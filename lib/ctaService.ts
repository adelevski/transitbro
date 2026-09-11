import { createFeedCache } from "./cache";
import {
  fetchCtaRailPositions,
  normalizeCtaTimestamp,
  parseDelayFlag,
  toArray,
  toString,
} from "./cta";
import {
  CTA_RAIL_LINE_IDS,
  type CtaRailFeedResponse,
  type CtaRailLineId,
} from "./types";
import { CTA_STATIONS } from "./ctaStations";
import type { Arrival, ArrivalBoard } from "./transit";

function createState() {
  return {
    positions: createFeedCache<CtaRailFeedResponse>(1),
    boards: createFeedCache<ArrivalBoard>(),
    minuteStarted: 0,
    minuteRequests: 0,
    date: "",
    dailyRequests: 0,
  };
}
// Next route bundles may instantiate modules separately. Share one budget/cache
// across all legacy and current routes in this Node process.
const runtime = globalThis as typeof globalThis & {
  __transitbroCta?: ReturnType<typeof createState>;
};
const state = (runtime.__transitbroCta ??= createState());
function budget() {
  const now = Date.now();
  const day = new Date(now).toISOString().slice(0, 10);
  if (state.date !== day) {
    state.date = day;
    state.dailyRequests = 0;
  }
  if (now - state.minuteStarted >= 60_000) {
    state.minuteStarted = now;
    state.minuteRequests = 0;
  }
  if (state.dailyRequests >= 25_000 || state.minuteRequests >= 20)
    throw new Error("Feed request budget reached");
  state.dailyRequests += 1;
  state.minuteRequests += 1;
}

export async function getCtaPositions(key: string, lines: CtaRailLineId[]) {
  if (!lines.length) return fetchCtaRailPositions(key, []);
  const result = await state.positions(key, async () => {
    budget();
    return fetchCtaRailPositions(key, [...CTA_RAIL_LINE_IDS]);
  });
  const vehicles = result.value.vehicles.filter((vehicle) =>
    lines.includes(vehicle.line),
  );
  return { ...result.value, routes: lines, vehicles, stale: result.stale };
}

export function normalizeCtaArrivals(
  ctatt: Record<string, unknown>,
  stationId: string,
  now = Date.now(),
): ArrivalBoard {
  const updatedAt = normalizeCtaTimestamp(ctatt.tmst);
  const arrivals = toArray(
    ctatt.eta as Record<string, unknown> | Record<string, unknown>[],
  )
    .flatMap((eta): Arrival[] => {
      if (!eta || typeof eta !== "object") return [];
      const arrivalAt = normalizeCtaTimestamp(eta.arrT);
      const line = toString(eta.rt).toLowerCase();
      if (!arrivalAt || !CTA_RAIL_LINE_IDS.includes(line as CtaRailLineId))
        return [];
      return [
        {
          id: `${stationId}-${line}-${toString(eta.rn)}-${toString(eta.stpId)}-${arrivalAt}`,
          line,
          destination: toString(eta.destNm, "Unknown destination"),
          platform: toString(eta.stpDe),
          arrivalAt,
          updatedAt: normalizeCtaTimestamp(eta.prdt) ?? updatedAt,
          kind: toString(eta.isSch) === "1" ? "schedule" : "prediction",
          uncertain: toString(eta.isFlt) === "1",
          isDelayed: parseDelayFlag(eta.isDly),
        },
      ];
    })
    .sort((a, b) => a.arrivalAt.localeCompare(b.arrivalAt));
  return {
    source: "CTA Train Tracker API",
    stationId,
    updatedAt,
    fetchedAt: new Date(now).toISOString(),
    arrivals,
  };
}

export async function getCtaArrivals(key: string, stationId: string) {
  if (!CTA_STATIONS.some((station) => station.id === stationId))
    throw new Error("Unknown station");
  const result = await state.boards(`${key}:${stationId}`, async () => {
    budget();
    const url = new URL(
      "https://lapi.transitchicago.com/api/1.0/ttarrivals.aspx",
    );
    url.searchParams.set("key", key);
    url.searchParams.set("mapid", stationId);
    url.searchParams.set("max", "20");
    url.searchParams.set("outputType", "JSON");
    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error("Arrivals unavailable");
    const payload = await response.json();
    if (!payload?.ctatt || toString(payload.ctatt.errCd, "0") !== "0")
      throw new Error("Arrivals unavailable");
    return normalizeCtaArrivals(payload.ctatt, stationId);
  });
  return { ...result.value, stale: result.stale };
}
