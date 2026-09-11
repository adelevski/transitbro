export const CTA_RAIL_LINE_IDS = [
  "blue",
  "red",
  "brn",
  "g",
  "org",
  "p",
  "pink",
  "y",
] as const;

export type CtaRailLineId = (typeof CTA_RAIL_LINE_IDS)[number];

export type CtaRailVehicle = import("./transit").RailVehicle<CtaRailLineId>;
export type CtaRailFeedResponse = import("./transit").Feed<CtaRailLineId>;

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
