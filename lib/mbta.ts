import type {
  Arrival,
  ArrivalBoard,
  Feed,
  RailVehicle,
  Station,
} from "./transit";

type Resource = {
  id: string;
  type: string;
  attributes: Record<string, unknown>;
  relationships?: Record<string, { data: { id: string; type: string } | null }>;
};
type Payload = {
  data: Resource[];
  included?: Resource[];
  links?: { next?: string | null };
};
const relation = (resource: Resource, name: string) =>
  resource.relationships?.[name]?.data?.id ?? "";
const str = (value: unknown, fallback = "") =>
  typeof value === "string" ? value : fallback;
function instant(value: unknown): string | null {
  const text = str(value);
  return text && Number.isFinite(Date.parse(text))
    ? new Date(text).toISOString()
    : null;
}
const coordinate = (value: unknown, limit: number): value is number =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  Math.abs(value) <= limit;
function includes(payload: Payload) {
  return new Map(
    (payload.included ?? []).map((item) => [`${item.type}:${item.id}`, item]),
  );
}

export async function mbtaRequest(
  path: string,
  query: Record<string, string>,
  signal: AbortSignal,
): Promise<Payload> {
  const url = new URL(`https://api-v3.mbta.com/${path}`);
  for (const [key, value] of Object.entries(query))
    url.searchParams.set(key, value);
  const response = await fetch(url, {
    signal,
    headers: { Accept: "application/vnd.api+json" },
  });
  if (response.status === 429)
    throw new Error("MBTA request limit reached. Retrying in a minute.");
  if (!response.ok) throw new Error("MBTA data could not be refreshed.");
  const payload = await response.json();
  if (!Array.isArray(payload?.data) || payload.links?.next)
    throw new Error("MBTA returned incomplete data.");
  return payload;
}

export function normalizeMbtaVehicles(
  payload: Payload,
  lines: string[],
  now = Date.now(),
): Feed {
  const related = includes(payload);
  const vehicles = payload.data.flatMap((item): RailVehicle[] => {
    const a = item.attributes;
    if (
      !a ||
      !coordinate(a.latitude, 90) ||
      !coordinate(a.longitude, 180) ||
      a.revenue === "NON_REVENUE"
    )
      return [];
    const line = relation(item, "route");
    if (!lines.includes(line)) return [];
    return [
      {
        id: item.id,
        line,
        runNumber: str(a.label, item.id),
        lat: a.latitude,
        lon: a.longitude,
        heading:
          coordinate(a.bearing, 359) && a.bearing >= 0 ? a.bearing : null,
        isDelayed: null,
        destination: str(
          related.get(`trip:${relation(item, "trip")}`)?.attributes.headsign,
          "Destination unavailable",
        ),
        nextStop: str(
          related.get(`stop:${relation(item, "stop")}`)?.attributes.name,
          "Stop unavailable",
        ),
        nextStopArrivalAt: null,
        direction: null,
        updatedAt: instant(a.updated_at) ?? "",
      },
    ];
  });
  const valid = vehicles
    .map((vehicle) => Date.parse(vehicle.updatedAt))
    .filter(Number.isFinite);
  return {
    source: "MassDOT / MBTA",
    routes: lines,
    vehicles,
    updatedAt: valid.length ? new Date(Math.max(...valid)).toISOString() : "",
    fetchedAt: new Date(now).toISOString(),
    pollIntervalMs: 30_000,
  };
}

export function normalizeMbtaArrivals(
  payload: Payload,
  stationId: string,
  now = Date.now(),
): ArrivalBoard {
  const related = includes(payload);
  const arrivals = payload.data
    .flatMap((item): Arrival[] => {
      const a = item.attributes;
      if (
        !a ||
        ["CANCELLED", "SKIPPED", "NO_DATA"].includes(
          str(a.schedule_relationship),
        ) ||
        a.revenue === "NON_REVENUE"
      )
        return [];
      const arrivalAt = instant(a.arrival_time) ?? instant(a.departure_time);
      if (!arrivalAt) return [];
      return [
        {
          id: item.id,
          line: relation(item, "route"),
          arrivalAt,
          destination:
            str(a.trip_headsign) ||
            str(
              related.get(`trip:${relation(item, "trip")}`)?.attributes
                .headsign,
              "Destination unavailable",
            ),
          platform: str(
            related.get(`stop:${relation(item, "stop")}`)?.attributes
              .platform_name,
          ),
          // V3 predictions do not expose a per-prediction observation timestamp.
          updatedAt: null,
          kind: "prediction",
          isDelayed: null,
        },
      ];
    })
    .sort((a, b) => a.arrivalAt.localeCompare(b.arrivalAt));
  return {
    source: "MassDOT / MBTA",
    stationId,
    arrivals,
    updatedAt: null,
    fetchedAt: new Date(now).toISOString(),
  };
}

export function normalizeMbtaStations(
  payload: Payload,
  lines: string[],
): Station[] {
  const related = includes(payload);
  const stations = new Map<string, Station>();
  for (const item of payload.data) {
    const parent =
      related.get(`stop:${relation(item, "parent_station")}`) ?? item;
    const a = parent.attributes;
    if (a && coordinate(a.latitude, 90) && coordinate(a.longitude, 180))
      stations.set(parent.id, {
        id: parent.id,
        name: str(a.name, parent.id),
        lat: a.latitude,
        lon: a.longitude,
        lines,
      });
  }
  return [...stations.values()].sort((a, b) => a.name.localeCompare(b.name));
}
