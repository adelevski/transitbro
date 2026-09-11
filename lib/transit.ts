/** Provider-neutral browser contract. Provider clocks stay separate from fetch time. */
export type RailVehicle<Line extends string = string> = {
  id: string;
  line: Line;
  runNumber: string;
  lat: number;
  lon: number;
  heading: number | null;
  isDelayed: boolean | null;
  destination: string;
  nextStop: string;
  nextStopArrivalAt: string | null;
  direction: string | null;
  updatedAt: string;
};

export type Feed<Line extends string = string> = {
  source: string;
  routes: Line[];
  updatedAt: string;
  fetchedAt?: string;
  vehicles: RailVehicle<Line>[];
  pollIntervalMs: number;
  stale?: boolean;
  error?: string;
};

export type Arrival = {
  id: string;
  line: string;
  destination: string;
  platform: string;
  arrivalAt: string;
  updatedAt: string | null;
  kind: "prediction" | "schedule";
  uncertain?: boolean;
  isDelayed: boolean | null;
};

export type ArrivalBoard = {
  source: string;
  stationId: string;
  updatedAt: string | null;
  fetchedAt: string;
  arrivals: Arrival[];
  stale?: boolean;
};

export type Station = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  lines: string[];
};
export type Line = {
  id: string;
  label: string;
  color: string;
  pathSegments: [number, number][][];
  terminalStationIds: string[];
};
export type TransitAdapter = {
  id: string;
  label: string;
  timeZone: string;
  center: [number, number];
  lines: Line[];
  defaultLines: string[];
  sourceUrl: string;
  loadStations(signal: AbortSignal): Promise<Station[]>;
  loadVehicles(lines: string[], signal: AbortSignal): Promise<Feed>;
  loadArrivals(stationId: string, signal: AbortSignal): Promise<ArrivalBoard>;
};

export const STALE_AFTER_MS = 90_000;
export const EXPIRE_AFTER_MS = 5 * 60_000;

export function sampleAge(iso: string | null | undefined, now: number): number {
  const timestamp = iso ? Date.parse(iso) : NaN;
  // Unknown or materially future timestamps are not evidence of freshness.
  return Number.isFinite(timestamp) && timestamp <= now + 30_000
    ? Math.max(0, now - timestamp)
    : Infinity;
}

export function formatCountdown(iso: string | null, now: number): string {
  if (!iso || !Number.isFinite(Date.parse(iso))) return "Unavailable";
  const seconds = Math.ceil((Date.parse(iso) - now) / 1000);
  if (seconds < -30) return "Prediction passed";
  if (seconds <= 0) return "Due";
  if (seconds < 60) return `<1 min`;
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Motion is only a short transition between two observed samples, never extrapolation. */
export function canInterpolate(
  from: RailVehicle,
  to: RailVehicle,
  now: number,
): boolean {
  const gap = Date.parse(to.updatedAt) - Date.parse(from.updatedAt);
  const dy = (to.lat - from.lat) * 111_320;
  const dx = (to.lon - from.lon) * 111_320 * Math.cos((to.lat * Math.PI) / 180);
  return (
    from.id === to.id &&
    gap > 0 &&
    gap <= STALE_AFTER_MS &&
    sampleAge(to.updatedAt, now) < STALE_AFTER_MS &&
    Math.hypot(dx, dy) < 600
  );
}
