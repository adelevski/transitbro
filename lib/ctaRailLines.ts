import { CTA_RAIL_LINE_PATHS } from "@/lib/ctaLinePaths";
import { CTA_RAIL_LINE_IDS, type CtaRailLineId } from "@/lib/types";

export type CtaRailLineConfig = {
  id: CtaRailLineId;
  label: string;
  ctaRouteId: string;
  color: string;
  glowColor: string;
  pathSegments: [number, number][][];
  terminalStationIds: string[];
};

export const CTA_RAIL_LINE_CONFIG: Record<CtaRailLineId, CtaRailLineConfig> = {
  blue: {
    id: "blue",
    label: "Blue Line",
    ctaRouteId: "blue",
    color: "#00a1de",
    glowColor: "#5ccfff",
    pathSegments: CTA_RAIL_LINE_PATHS.blue,
    terminalStationIds: ["40890", "40390"]
  },
  red: {
    id: "red",
    label: "Red Line",
    ctaRouteId: "red",
    color: "#c60c30",
    glowColor: "#ff6f8f",
    pathSegments: CTA_RAIL_LINE_PATHS.red,
    terminalStationIds: ["40900", "40450"]
  },
  brn: {
    id: "brn",
    label: "Brown Line",
    ctaRouteId: "brn",
    color: "#62361b",
    glowColor: "#a1724a",
    pathSegments: CTA_RAIL_LINE_PATHS.brn,
    terminalStationIds: ["41290", "40850"]
  },
  g: {
    id: "g",
    label: "Green Line",
    ctaRouteId: "g",
    color: "#009b3a",
    glowColor: "#49d277",
    pathSegments: CTA_RAIL_LINE_PATHS.g,
    terminalStationIds: ["40020", "40720", "40290"]
  },
  org: {
    id: "org",
    label: "Orange Line",
    ctaRouteId: "org",
    color: "#f9461c",
    glowColor: "#ff8368",
    pathSegments: CTA_RAIL_LINE_PATHS.org,
    terminalStationIds: ["40930", "41700"]
  },
  p: {
    id: "p",
    label: "Purple Line",
    ctaRouteId: "p",
    color: "#522398",
    glowColor: "#8f61db",
    pathSegments: CTA_RAIL_LINE_PATHS.p,
    terminalStationIds: ["41050", "40900"]
  },
  pink: {
    id: "pink",
    label: "Pink Line",
    ctaRouteId: "pink",
    color: "#e27ea6",
    glowColor: "#f8b9d1",
    pathSegments: CTA_RAIL_LINE_PATHS.pink,
    terminalStationIds: ["40580", "41700"]
  },
  y: {
    id: "y",
    label: "Yellow Line",
    ctaRouteId: "y",
    color: "#f9e300",
    glowColor: "#fff07d",
    pathSegments: CTA_RAIL_LINE_PATHS.y,
    terminalStationIds: ["40140", "40900"]
  }
};

export const DEFAULT_CTA_RAIL_LINE: CtaRailLineId = "blue";

export function isCtaRailLineId(value: string): value is CtaRailLineId {
  return CTA_RAIL_LINE_IDS.includes(value as CtaRailLineId);
}

export function normalizeCtaRailLineSelection(
  values: Iterable<string>,
  options?: {
    fallbackToDefaultLine?: boolean;
  }
): CtaRailLineId[] {
  const selected = new Set<CtaRailLineId>();
  const fallbackToDefaultLine = options?.fallbackToDefaultLine ?? false;

  for (const value of values) {
    if (isCtaRailLineId(value)) {
      selected.add(value);
    }
  }

  if (selected.size === 0) {
    return fallbackToDefaultLine ? [DEFAULT_CTA_RAIL_LINE] : [];
  }

  return CTA_RAIL_LINE_IDS.filter((lineId) => selected.has(lineId));
}
