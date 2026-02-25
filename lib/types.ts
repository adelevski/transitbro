export const CTA_RAIL_LINE_IDS = [
  "blue",
  "red",
  "brn",
  "g",
  "org",
  "p",
  "pink",
  "y"
] as const;

export type CtaRailLineId = (typeof CTA_RAIL_LINE_IDS)[number];

export type CtaRailVehicle = {
  id: string;
  line: CtaRailLineId;
  runNumber: string;
  lat: number;
  lon: number;
  heading: number | null;
  isDelayed: boolean;
  destination: string;
  nextStop: string;
  nextStopArrivalAt: string | null;
  direction: string | null;
  updatedAt: string;
};

export type CtaRailFeedResponse = {
  source: string;
  routes: CtaRailLineId[];
  updatedAt: string;
  vehicles: CtaRailVehicle[];
  pollIntervalMs: number;
  error?: string;
};

export type CtaSingleLineFeedResponse = CtaRailFeedResponse & {
  route: CtaRailLineId;
  routes: [CtaRailLineId];
};

// Backward-compatible aliases retained for the existing Blue endpoint.
export type BlueLineVehicle = CtaRailVehicle;
export type BlueLineFeedResponse = CtaSingleLineFeedResponse & {
  route: "blue";
  routes: ["blue"];
};
