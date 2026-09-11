import { CTA_RAIL_LINE_CONFIG } from "./ctaRailLines";
import { CTA_RAIL_LINE_IDS } from "./types";
import { CTA_STATIONS } from "./ctaStations";
import type { TransitAdapter } from "./transit";
import {
  mbtaRequest,
  normalizeMbtaArrivals,
  normalizeMbtaStations,
  normalizeMbtaVehicles,
} from "./mbta";

export const CTA_CONNECTED =
  process.env.NEXT_PUBLIC_STATIC_BUILD !== "1" ||
  !!process.env.NEXT_PUBLIC_CTA_BASE_URL;
async function ctaRequest(path: string, signal: AbortSignal) {
  if (!CTA_CONNECTED)
    throw new Error(
      "Live CTA feed is not connected. Station and route maps remain available.",
    );
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_CTA_BASE_URL ?? ""}/api/cta/${path}`,
    { signal, cache: "no-store" },
  );
  if (!response.ok) throw new Error("CTA data could not be refreshed.");
  return response.json();
}
const mbtaLines = [
  ["Red", "Red Line", "#da291c"],
  ["Orange", "Orange Line", "#ed8b00"],
  ["Blue", "Blue Line", "#008eaa"],
  ["Green-B", "Green B", "#00843d"],
  ["Green-C", "Green C", "#00843d"],
  ["Green-D", "Green D", "#00843d"],
  ["Green-E", "Green E", "#00843d"],
  ["Mattapan", "Mattapan", "#da291c"],
].map(([id, label, color]) => ({
  id,
  label,
  color,
  pathSegments: [],
  terminalStationIds: [],
}));
const mbtaIds = mbtaLines.map((line) => line.id);
let mbtaStations:
  Awaited<ReturnType<TransitAdapter["loadStations"]>> | undefined;
const mbtaStationsByLine = new Map<
  string,
  Awaited<ReturnType<TransitAdapter["loadStations"]>>
>();
export const ADAPTERS: Record<string, TransitAdapter> = {
  chicago: {
    id: "chicago",
    label: "Chicago · CTA",
    timeZone: "America/Chicago",
    center: [41.8781, -87.6298],
    lines: CTA_RAIL_LINE_IDS.map((id) => CTA_RAIL_LINE_CONFIG[id]),
    defaultLines: ["blue"],
    sourceUrl: "https://www.transitchicago.com/traintracker/",
    async loadStations() {
      return CTA_STATIONS;
    },
    loadVehicles(lines, signal) {
      return ctaRequest(
        `rail?lines=${encodeURIComponent(lines.join(","))}`,
        signal,
      );
    },
    loadArrivals(stationId, signal) {
      return ctaRequest(
        `arrivals?station=${encodeURIComponent(stationId)}`,
        signal,
      );
    },
  },
  boston: {
    id: "boston",
    label: "Boston · MBTA",
    timeZone: "America/New_York",
    center: [42.3564, -71.0624],
    lines: mbtaLines,
    defaultLines: ["Red"],
    sourceUrl: "https://www.mbta.com/alerts/subway",
    async loadStations(signal) {
      if (mbtaStations) return mbtaStations;
      for (const line of mbtaIds) {
        if (mbtaStationsByLine.has(line)) continue;
        const payload = await mbtaRequest(
          "stops",
          {
            "filter[route]": line,
            include: "parent_station",
            "page[limit]": "500",
          },
          signal,
        );
        mbtaStationsByLine.set(line, normalizeMbtaStations(payload, [line]));
      }
      const merged = new Map<
        string,
        Awaited<ReturnType<TransitAdapter["loadStations"]>>[number]
      >();
      for (const stations of mbtaStationsByLine.values())
        for (const station of stations) {
          const existing = merged.get(station.id);
          merged.set(station.id, {
            ...station,
            lines: [...new Set([...(existing?.lines ?? []), ...station.lines])],
          });
        }
      return (mbtaStations = [...merged.values()].sort((a, b) =>
        a.name.localeCompare(b.name),
      ));
    },
    async loadVehicles(lines, signal) {
      const payload = await mbtaRequest(
        "vehicles",
        {
          "filter[route]": lines.join(","),
          include: "trip,stop",
          "page[limit]": "500",
        },
        signal,
      );
      return normalizeMbtaVehicles(payload, lines);
    },
    async loadArrivals(stationId, signal) {
      const payload = await mbtaRequest(
        "predictions",
        {
          "filter[stop]": stationId,
          "filter[route]": mbtaIds.join(","),
          include: "trip,stop",
          "page[limit]": "500",
        },
        signal,
      );
      return normalizeMbtaArrivals(payload, stationId);
    },
  },
};
