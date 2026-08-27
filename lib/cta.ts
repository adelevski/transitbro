import {
  CTA_RAIL_LINE_CONFIG,
  type CtaRailLineConfig
} from "@/lib/ctaRailLines";
import type {
  CtaRailFeedResponse,
  CtaRailLineId,
  CtaRailVehicle,
  CtaSingleLineFeedResponse
} from "@/lib/types";

const DEFAULT_POSITIONS_URL =
  "https://lapi.transitchicago.com/api/1.0/ttpositions.aspx";
const DEFAULT_POLL_INTERVAL_MS = 5000;
const MIN_POLL_INTERVAL_MS = 5000;
const MAX_POLL_INTERVAL_MS = 60000;
const CTA_TIME_ZONE = "America/Chicago";

const ctaTimeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: CTA_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23"
});

type JsonLike = Record<string, unknown>;

function toArray<T>(value: T | T[] | null | undefined): T[] {
  if (value === null || value === undefined) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function toString(value: unknown, fallback = ""): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return fallback;
}

function toNumber(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") {
    return null;
  }

  if (typeof value === "string" && value.trim().length === 0) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getCtaTimeParts(timestampMs: number): Record<string, number> {
  return Object.fromEntries(
    ctaTimeFormatter
      .formatToParts(timestampMs)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)])
  );
}

function parseCtaLocalTimestamp(value: string): string | null {
  const match =
    /^(\d{4})-?(\d{2})-?(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }

  const [, yearText, monthText, dayText, hourText, minuteText, secondText] =
    match;
  const expected = {
    year: Number(yearText),
    month: Number(monthText),
    day: Number(dayText),
    hour: Number(hourText),
    minute: Number(minuteText),
    second: Number(secondText)
  };
  const localAsUtc = Date.UTC(
    expected.year,
    expected.month - 1,
    expected.day,
    expected.hour,
    expected.minute,
    expected.second
  );
  const localAsUtcDate = new Date(localAsUtc);

  if (
    localAsUtcDate.getUTCFullYear() !== expected.year ||
    localAsUtcDate.getUTCMonth() + 1 !== expected.month ||
    localAsUtcDate.getUTCDate() !== expected.day ||
    localAsUtcDate.getUTCHours() !== expected.hour ||
    localAsUtcDate.getUTCMinutes() !== expected.minute ||
    localAsUtcDate.getUTCSeconds() !== expected.second
  ) {
    return null;
  }

  let timestampMs = localAsUtc;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = getCtaTimeParts(timestampMs);
    const renderedAsUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second
    );
    const nextTimestampMs = localAsUtc - (renderedAsUtc - timestampMs);
    if (nextTimestampMs === timestampMs) {
      break;
    }
    timestampMs = nextTimestampMs;
  }

  const actual = getCtaTimeParts(timestampMs);
  if (
    actual.year !== expected.year ||
    actual.month !== expected.month ||
    actual.day !== expected.day ||
    actual.hour !== expected.hour ||
    actual.minute !== expected.minute ||
    actual.second !== expected.second
  ) {
    return null;
  }

  return new Date(timestampMs).toISOString();
}

export function normalizeCtaTimestamp(raw: unknown): string | null {
  const value = toString(raw).trim();
  if (value.length === 0) {
    return null;
  }

  const ctaTimestamp = parseCtaLocalTimestamp(value);
  if (ctaTimestamp) {
    return ctaTimestamp;
  }

  const timestampMs = Date.parse(value);
  return Number.isFinite(timestampMs) ? new Date(timestampMs).toISOString() : null;
}

function normalizeDirection(
  raw: unknown,
  line: CtaRailLineConfig
): string | null {
  const code = toString(raw).trim();

  if (code === "1" || code === "5") {
    return line.directionLabels[code];
  }

  return code.length > 0 ? code : null;
}

function parseDelayFlag(raw: unknown): boolean {
  const value = toString(raw).trim().toLowerCase();
  return value === "1" || value === "true" || value === "y" || value === "yes";
}

function extractTrains(ctatt: JsonLike): JsonLike[] {
  const routes = toArray(ctatt.route as JsonLike | JsonLike[]);

  if (routes.length > 0) {
    return routes.flatMap((route) => toArray(route.train as JsonLike | JsonLike[]));
  }

  // Defensive fallback in case CTA returns a flattened shape.
  return toArray(ctatt.train as JsonLike | JsonLike[]);
}

function getPollIntervalMs(): number {
  const configuredIntervalMs = Number(process.env.CTA_POLL_INTERVAL_MS);
  return Number.isFinite(configuredIntervalMs)
    ? Math.max(
        MIN_POLL_INTERVAL_MS,
        Math.min(MAX_POLL_INTERVAL_MS, configuredIntervalMs)
      )
    : DEFAULT_POLL_INTERVAL_MS;
}

function normalizeVehicle(
  train: JsonLike,
  line: CtaRailLineConfig,
  fallbackUpdatedAt: string,
  index: number
): CtaRailVehicle | null {
  const lat = toNumber(train.lat);
  const lon = toNumber(train.lon);
  const rawHeading = toNumber(train.heading);
  const heading =
    rawHeading !== null && rawHeading >= 0 && rawHeading <= 359
      ? rawHeading
      : null;

  if (
    lat === null ||
    lon === null ||
    lat < -90 ||
    lat > 90 ||
    lon < -180 ||
    lon > 180
  ) {
    return null;
  }

  const runNumber = toString(train.rn, `run-${index + 1}`);
  const updatedAt =
    normalizeCtaTimestamp(train.prdt) ??
    normalizeCtaTimestamp(train.prdtm) ??
    fallbackUpdatedAt;
  const nextStopArrivalAt = normalizeCtaTimestamp(train.arrT);

  return {
    id: `${line.id}-${runNumber}`,
    line: line.id,
    runNumber,
    lat,
    lon,
    heading,
    isDelayed: parseDelayFlag(train.isDly),
    destination:
      toString(train.destNm) || toString(train.destSt) || "Unknown destination",
    nextStop: toString(train.nextStaNm) || "Unknown next stop",
    nextStopArrivalAt,
    direction: normalizeDirection(train.trDr, line),
    updatedAt
  };
}

function normalizeLineFeed(
  ctatt: JsonLike,
  line: CtaRailLineConfig
): CtaSingleLineFeedResponse {
  const fallbackUpdatedAt =
    normalizeCtaTimestamp(ctatt.tmst) ?? new Date().toISOString();
  const trains = extractTrains(ctatt);
  const vehicles = trains
    .map((train, index) =>
      normalizeVehicle(train, line, fallbackUpdatedAt, index)
    )
    .filter((vehicle): vehicle is CtaRailVehicle => vehicle !== null)
    .sort((a, b) => a.runNumber.localeCompare(b.runNumber));

  const vehicleTimestamps = vehicles
    .map((vehicle) => Date.parse(vehicle.updatedAt))
    .filter((value) => Number.isFinite(value));
  const fallbackTimestamp = Date.parse(fallbackUpdatedAt);
  const newestVehicleTs =
    vehicleTimestamps.length > 0
      ? Math.max(...vehicleTimestamps)
      : Number.isFinite(fallbackTimestamp)
        ? fallbackTimestamp
        : Date.now();

  return {
    source: "CTA Train Tracker API",
    route: line.id,
    routes: [line.id],
    updatedAt: new Date(newestVehicleTs).toISOString(),
    vehicles,
    pollIntervalMs: getPollIntervalMs()
  };
}

export async function fetchCtaRailLinePositions(
  apiKey: string,
  lineId: CtaRailLineId
): Promise<CtaSingleLineFeedResponse> {
  const line = CTA_RAIL_LINE_CONFIG[lineId];
  const baseUrl = process.env.CTA_TRAIN_POSITIONS_URL || DEFAULT_POSITIONS_URL;
  const url = new URL(baseUrl);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("rt", line.ctaRouteId);
  url.searchParams.set("outputType", "JSON");

  const response = await fetch(url.toString(), {
    cache: "no-store",
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`CTA request failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as { ctatt?: JsonLike };
  const ctatt = payload.ctatt;

  if (!ctatt || typeof ctatt !== "object") {
    throw new Error("CTA response missing ctatt payload.");
  }

  const errCd = toString(ctatt.errCd, "0");
  if (errCd !== "0") {
    const errNm = toString(ctatt.errNm, "CTA returned an unknown error.");
    throw new Error(`CTA error ${errCd}: ${errNm}`);
  }

  return normalizeLineFeed(ctatt, line);
}

export async function fetchCtaRailPositions(
  apiKey: string,
  lineIds: CtaRailLineId[]
): Promise<CtaRailFeedResponse> {
  const feeds = await Promise.all(
    lineIds.map((lineId) => fetchCtaRailLinePositions(apiKey, lineId))
  );

  const vehicles = feeds
    .flatMap((feed) => feed.vehicles)
    .sort((a, b) => a.id.localeCompare(b.id));
  const newestVehicleTs =
    feeds
      .map((feed) => Date.parse(feed.updatedAt))
      .filter((value) => Number.isFinite(value))
      .sort((a, b) => b - a)[0] ?? Date.now();

  return {
    source: "CTA Train Tracker API",
    routes: lineIds,
    updatedAt: new Date(newestVehicleTs).toISOString(),
    vehicles,
    pollIntervalMs: getPollIntervalMs()
  };
}

export async function fetchBlueLinePositions(
  apiKey: string
): Promise<CtaSingleLineFeedResponse> {
  return fetchCtaRailLinePositions(apiKey, "blue");
}

export async function fetchRedLinePositions(
  apiKey: string
): Promise<CtaSingleLineFeedResponse> {
  return fetchCtaRailLinePositions(apiKey, "red");
}
