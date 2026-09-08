"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { divIcon, type DivIcon, type LatLngTuple } from "leaflet";
import {
  CircleMarker,
  MapContainer,
  Marker,
  Popup,
  Polyline,
  TileLayer,
  Tooltip,
  useMapEvents
} from "react-leaflet";
import { CTA_RAIL_LINE_CONFIG } from "@/lib/ctaRailLines";
import { CTA_STATIONS } from "@/lib/ctaStations";
import {
  CTA_RAIL_LINE_IDS,
  type CtaRailFeedResponse,
  type CtaRailLineId,
  type CtaRailVehicle
} from "@/lib/types";

const CHICAGO_CENTER: LatLngTuple = [41.8781, -87.6298];
const FALLBACK_POLL_INTERVAL_MS = 5000;
const MAX_ANIMATION_DURATION_MS = 58000;
const MIN_ANIMATION_DURATION_MS = 1200;
const STATION_DWELL_RATIO = 0.1;
const MIN_STATION_DWELL_MS = 450;
const MAX_STATION_DWELL_MS = 1200;
const STATION_HOLD_RADIUS_METERS = 30;
const MIN_MOVE_SEGMENT_MS = 450;
const MIN_ESTIMATED_SPEED_MPS = 1.5;
const MAX_ESTIMATED_SPEED_MPS = 22;
const MAX_TRACK_SNAP_METERS = 700;
const SHOW_INTERMEDIATE_STATIONS_ZOOM = 12;
const SHOW_INTERMEDIATE_STATION_LABELS_ZOOM = 14;

const DEFAULT_LINE_SPEED_MPS: Record<CtaRailLineId, number> = {
  blue: 11,
  red: 10.5,
  brn: 9,
  g: 10,
  org: 10.5,
  p: 9.5,
  pink: 9.5,
  y: 11.5
};

type VehicleSample = {
  vehicle: CtaRailVehicle;
  sampledAtMs: number;
};

type LineTrack = {
  points: [number, number][];
  cumulativeMeters: number[];
  totalMeters: number;
};

type TrackSnap = {
  trackIndex: number;
  offsetMeters: number;
  lat: number;
  lon: number;
  distanceMeters: number;
  forwardBearing: number | null;
};

type VehicleMotionPlan =
  | {
      kind: "linear";
      startLat: number;
      startLon: number;
      endLat: number;
      endLon: number;
      durationMs: number;
    }
  | {
      kind: "dwell";
      lat: number;
      lon: number;
      durationMs: number;
    }
  | {
      kind: "arrive-dwell";
      startLat: number;
      startLon: number;
      stationLat: number;
      stationLon: number;
      moveDurationMs: number;
      dwellDurationMs: number;
    }
  | {
      kind: "track-linear";
      trackIndex: number;
      startOffsetMeters: number;
      endOffsetMeters: number;
      durationMs: number;
    }
  | {
      kind: "track-arrive-dwell";
      trackIndex: number;
      startOffsetMeters: number;
      stationOffsetMeters: number;
      moveDurationMs: number;
      dwellDurationMs: number;
    };

function createVehicleIcon(color: string, heading: number | null): DivIcon {
  const rotation =
    heading !== null && Number.isFinite(heading)
      ? ((heading % 360) + 360) % 360
      : 0;
  const headingClass = heading === null ? " no-heading" : "";

  return divIcon({
    className: "",
    html: `<div class="vehicle-icon${headingClass}" style="--vehicle-color: ${color}; --vehicle-rotation: ${rotation}deg;"><span class="vehicle-arrow"><span class="vehicle-arrow-shaft"></span><span class="vehicle-arrow-head"></span></span></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9]
  });
}

function formatUpdatedAt(iso: string | null): string {
  if (!iso) {
    return "waiting for first sample";
  }

  const asDate = new Date(iso);
  if (Number.isNaN(asDate.getTime())) {
    return "unknown";
  }

  return asDate.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function formatNextStopEta(iso: string | null): string {
  if (!iso) {
    return "ETA unavailable";
  }

  const arrivalAt = new Date(iso);
  if (Number.isNaN(arrivalAt.getTime())) {
    return "ETA unavailable";
  }

  const clockText = arrivalAt.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
  const diffMs = arrivalAt.getTime() - Date.now();

  if (diffMs <= -30000) {
    return `${clockText} (passed)`;
  }

  const diffMinutes = Math.round(diffMs / 60000);
  if (diffMinutes <= 0) {
    return `${clockText} (due)`;
  }

  return `${clockText} (${diffMinutes} min)`;
}

function trainStatusLabel(isDelayed: boolean): "Late" | "On time" {
  return isDelayed ? "Late" : "On time";
}

function trainStatusClass(isDelayed: boolean): "late" | "on-time" {
  return isDelayed ? "late" : "on-time";
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function distanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const earthRadiusMeters = 6371000;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusMeters * c;
}

function normalizeStationName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function interpolateLinearPosition(
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number,
  progress: number
): { lat: number; lon: number } {
  return {
    lat: startLat + (endLat - startLat) * progress,
    lon: startLon + (endLon - startLon) * progress
  };
}

function angularDifferenceDegrees(a: number, b: number): number {
  return Math.abs(((a - b + 540) % 360) - 180);
}

function projectPointToSegment(
  pointLat: number,
  pointLon: number,
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number
): {
  lat: number;
  lon: number;
  distanceMeters: number;
  fraction: number;
  segmentMeters: number;
} {
  const metersPerDegLat = 111320;
  const metersPerDegLon =
    111320 * Math.cos(toRadians((pointLat + startLat + endLat) / 3));
  const bx = (endLon - startLon) * metersPerDegLon;
  const by = (endLat - startLat) * metersPerDegLat;
  const px = (pointLon - startLon) * metersPerDegLon;
  const py = (pointLat - startLat) * metersPerDegLat;
  const segmentSquared = bx * bx + by * by;

  if (segmentSquared <= 0.000001) {
    return {
      lat: startLat,
      lon: startLon,
      distanceMeters: Math.sqrt(px * px + py * py),
      fraction: 0,
      segmentMeters: 0
    };
  }

  const fraction = clamp((px * bx + py * by) / segmentSquared, 0, 1);
  const cx = bx * fraction;
  const cy = by * fraction;
  const dx = px - cx;
  const dy = py - cy;

  return {
    lat: startLat + cy / metersPerDegLat,
    lon: startLon + cx / metersPerDegLon,
    distanceMeters: Math.sqrt(dx * dx + dy * dy),
    fraction,
    segmentMeters: Math.sqrt(segmentSquared)
  };
}

function buildLineTracks(pathSegments: [number, number][][]): LineTrack[] {
  return pathSegments
    .filter((segment) => segment.length >= 2)
    .map((segment) => {
      const cumulativeMeters: number[] = [0];
      for (let i = 1; i < segment.length; i += 1) {
        const previous = segment[i - 1];
        const current = segment[i];
        cumulativeMeters.push(
          cumulativeMeters[i - 1] +
            distanceMeters(previous[0], previous[1], current[0], current[1])
        );
      }

      return {
        points: segment,
        cumulativeMeters,
        totalMeters: cumulativeMeters[cumulativeMeters.length - 1]
      };
    });
}

function interpolateOnTrack(
  track: LineTrack,
  offsetMeters: number
): { lat: number; lon: number } {
  if (track.points.length === 0) {
    return {
      lat: 0,
      lon: 0
    };
  }

  const clampedOffset = clamp(offsetMeters, 0, track.totalMeters);
  if (clampedOffset <= 0) {
    return {
      lat: track.points[0][0],
      lon: track.points[0][1]
    };
  }

  if (clampedOffset >= track.totalMeters) {
    const last = track.points[track.points.length - 1];
    return {
      lat: last[0],
      lon: last[1]
    };
  }

  let segmentIndex = 1;
  while (
    segmentIndex < track.cumulativeMeters.length &&
    track.cumulativeMeters[segmentIndex] < clampedOffset
  ) {
    segmentIndex += 1;
  }

  const startIndex = Math.max(0, segmentIndex - 1);
  const segmentStartOffset = track.cumulativeMeters[startIndex];
  const segmentEndOffset = track.cumulativeMeters[startIndex + 1];
  const segmentLength = Math.max(0.001, segmentEndOffset - segmentStartOffset);
  const fraction = clamp(
    (clampedOffset - segmentStartOffset) / segmentLength,
    0,
    1
  );
  const startPoint = track.points[startIndex];
  const endPoint = track.points[startIndex + 1];

  return interpolateLinearPosition(
    startPoint[0],
    startPoint[1],
    endPoint[0],
    endPoint[1],
    fraction
  );
}

function findClosestPointOnSingleTrack(
  track: LineTrack,
  pointLat: number,
  pointLon: number
): Omit<TrackSnap, "trackIndex"> | null {
  if (track.points.length < 2) {
    return null;
  }

  let best: Omit<TrackSnap, "trackIndex"> | null = null;

  for (let i = 1; i < track.points.length; i += 1) {
    const startPoint = track.points[i - 1];
    const endPoint = track.points[i];
    const projected = projectPointToSegment(
      pointLat,
      pointLon,
      startPoint[0],
      startPoint[1],
      endPoint[0],
      endPoint[1]
    );
    const segmentOffset =
      track.cumulativeMeters[i - 1] + projected.segmentMeters * projected.fraction;
    const forwardBearing = bearingFromPoints(
      startPoint[0],
      startPoint[1],
      endPoint[0],
      endPoint[1]
    );

    if (!best || projected.distanceMeters < best.distanceMeters) {
      best = {
        offsetMeters: segmentOffset,
        lat: projected.lat,
        lon: projected.lon,
        distanceMeters: projected.distanceMeters,
        forwardBearing
      };
    }
  }

  return best;
}

function findClosestPointOnTracks(
  tracks: LineTrack[],
  pointLat: number,
  pointLon: number
): TrackSnap | null {
  let best: TrackSnap | null = null;

  for (let trackIndex = 0; trackIndex < tracks.length; trackIndex += 1) {
    const track = tracks[trackIndex];
    const candidate = findClosestPointOnSingleTrack(track, pointLat, pointLon);
    if (!candidate) {
      continue;
    }

    if (!best || candidate.distanceMeters < best.distanceMeters) {
      best = {
        trackIndex,
        ...candidate
      };
    }
  }

  return best;
}

function projectTowardsPoint(
  startLat: number,
  startLon: number,
  targetLat: number,
  targetLon: number,
  distanceToProjectMeters: number
): { lat: number; lon: number } {
  const totalMeters = distanceMeters(startLat, startLon, targetLat, targetLon);
  if (totalMeters < 0.5) {
    return {
      lat: targetLat,
      lon: targetLon
    };
  }

  const ratio = clamp(distanceToProjectMeters / totalMeters, 0, 1);
  return interpolateLinearPosition(startLat, startLon, targetLat, targetLon, ratio);
}

function projectByHeading(
  startLat: number,
  startLon: number,
  headingDegrees: number,
  distanceToProjectMeters: number
): { lat: number; lon: number } {
  const headingRadians = toRadians(((headingDegrees % 360) + 360) % 360);
  const northMeters = Math.cos(headingRadians) * distanceToProjectMeters;
  const eastMeters = Math.sin(headingRadians) * distanceToProjectMeters;
  const latOffset = northMeters / 111320;
  const lonOffset = eastMeters / (111320 * Math.cos(toRadians(startLat)));

  return {
    lat: startLat + latOffset,
    lon: startLon + lonOffset
  };
}

function bearingFromPoints(
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number
): number | null {
  if (distanceMeters(startLat, startLon, endLat, endLon) < 1) {
    return null;
  }

  const lat1 = toRadians(startLat);
  const lat2 = toRadians(endLat);
  const dLon = toRadians(endLon - startLon);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  const bearing = (Math.atan2(y, x) * 180) / Math.PI;
  return (bearing + 360) % 360;
}

function parseArrivalTimestamp(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function estimateObservedSpeedMps(
  previousSample: VehicleSample | undefined,
  currentVehicle: CtaRailVehicle,
  sampledAtMs: number
): number | null {
  if (!previousSample) {
    return null;
  }

  const elapsedSeconds = (sampledAtMs - previousSample.sampledAtMs) / 1000;
  if (elapsedSeconds <= 0.5) {
    return null;
  }

  const movedMeters = distanceMeters(
    previousSample.vehicle.lat,
    previousSample.vehicle.lon,
    currentVehicle.lat,
    currentVehicle.lon
  );
  return movedMeters / elapsedSeconds;
}

function estimateHeadingDegrees(
  vehicle: CtaRailVehicle,
  previousSample: VehicleSample | undefined
): number | null {
  if (vehicle.heading !== null && Number.isFinite(vehicle.heading)) {
    return vehicle.heading;
  }

  if (!previousSample) {
    return null;
  }

  return bearingFromPoints(
    previousSample.vehicle.lat,
    previousSample.vehicle.lon,
    vehicle.lat,
    vehicle.lon
  );
}

function buildMotionPlan(
  startLat: number,
  startLon: number,
  vehicle: CtaRailVehicle,
  intervalMs: number,
  sampledAtMs: number,
  previousSample: VehicleSample | undefined,
  nextStopStation: (typeof CTA_STATIONS)[number] | undefined,
  lineTracks: LineTrack[]
): VehicleMotionPlan {
  const animationDurationMs = Math.max(
    MIN_ANIMATION_DURATION_MS,
    Math.min(MAX_ANIMATION_DURATION_MS, intervalMs - 120)
  );
  const intervalSeconds = animationDurationMs / 1000;
  const observedSpeedMps = estimateObservedSpeedMps(
    previousSample,
    vehicle,
    sampledAtMs
  );
  const baseSpeedMps = clamp(
    observedSpeedMps ?? DEFAULT_LINE_SPEED_MPS[vehicle.line],
    MIN_ESTIMATED_SPEED_MPS,
    MAX_ESTIMATED_SPEED_MPS
  );
  const dwellMs = clamp(
    intervalMs * STATION_DWELL_RATIO,
    MIN_STATION_DWELL_MS,
    MAX_STATION_DWELL_MS
  );

  const startSnap = findClosestPointOnTracks(lineTracks, startLat, startLon);
  const headingDegrees = estimateHeadingDegrees(vehicle, previousSample);

  if (startSnap && startSnap.distanceMeters <= MAX_TRACK_SNAP_METERS) {
    const activeTrack = lineTracks[startSnap.trackIndex];

    if (nextStopStation) {
      const stationOnActiveTrack = findClosestPointOnSingleTrack(
        activeTrack,
        nextStopStation.lat,
        nextStopStation.lon
      );
      if (stationOnActiveTrack) {
        const distanceToStationMeters = Math.abs(
          stationOnActiveTrack.offsetMeters - startSnap.offsetMeters
        );
        const movingDirection =
          stationOnActiveTrack.offsetMeters >= startSnap.offsetMeters ? 1 : -1;

        if (
          distanceToStationMeters <= STATION_HOLD_RADIUS_METERS ||
          stationOnActiveTrack.distanceMeters <= STATION_HOLD_RADIUS_METERS
        ) {
          return {
            kind: "dwell",
            lat: stationOnActiveTrack.lat,
            lon: stationOnActiveTrack.lon,
            durationMs: animationDurationMs
          };
        }

        const nextStopArrivalAtMs = parseArrivalTimestamp(vehicle.nextStopArrivalAt);
        if (nextStopArrivalAtMs !== null && nextStopArrivalAtMs > sampledAtMs) {
          const etaMs = nextStopArrivalAtMs - sampledAtMs;

          if (etaMs <= animationDurationMs) {
            const moveDurationMs = clamp(
              etaMs,
              MIN_MOVE_SEGMENT_MS,
              animationDurationMs
            );
            const dwellDurationMs = Math.max(
              0,
              Math.min(dwellMs, animationDurationMs - moveDurationMs)
            );
            return {
              kind: "track-arrive-dwell",
              trackIndex: startSnap.trackIndex,
              startOffsetMeters: startSnap.offsetMeters,
              stationOffsetMeters: stationOnActiveTrack.offsetMeters,
              moveDurationMs,
              dwellDurationMs
            };
          }

          const speedToStationMps = distanceToStationMeters / (etaMs / 1000);
          const blendedSpeedMps = clamp(
            observedSpeedMps !== null
              ? speedToStationMps * 0.65 + observedSpeedMps * 0.35
              : speedToStationMps,
            MIN_ESTIMATED_SPEED_MPS,
            MAX_ESTIMATED_SPEED_MPS
          );
          const projectedDistance = blendedSpeedMps * intervalSeconds;
          const signedDistance = projectedDistance * movingDirection;
          const maxSignedDistance = distanceToStationMeters * movingDirection;
          const clampedSignedDistance =
            movingDirection > 0
              ? Math.min(signedDistance, maxSignedDistance)
              : Math.max(signedDistance, maxSignedDistance);
          return {
            kind: "track-linear",
            trackIndex: startSnap.trackIndex,
            startOffsetMeters: startSnap.offsetMeters,
            endOffsetMeters: clamp(
              startSnap.offsetMeters + clampedSignedDistance,
              0,
              activeTrack.totalMeters
            ),
            durationMs: animationDurationMs
          };
        }

        const projectedDistance = baseSpeedMps * intervalSeconds;
        const signedDistance = projectedDistance * movingDirection;
        const maxSignedDistance = distanceToStationMeters * movingDirection;
        const clampedSignedDistance =
          movingDirection > 0
            ? Math.min(signedDistance, maxSignedDistance)
            : Math.max(signedDistance, maxSignedDistance);
        return {
          kind: "track-linear",
          trackIndex: startSnap.trackIndex,
          startOffsetMeters: startSnap.offsetMeters,
          endOffsetMeters: clamp(
            startSnap.offsetMeters + clampedSignedDistance,
            0,
            activeTrack.totalMeters
          ),
          durationMs: animationDurationMs
        };
      }
    }

    if (headingDegrees !== null && startSnap.forwardBearing !== null) {
      const forwardDifference = angularDifferenceDegrees(
        headingDegrees,
        startSnap.forwardBearing
      );
      const backwardDifference = angularDifferenceDegrees(
        headingDegrees,
        (startSnap.forwardBearing + 180) % 360
      );
      const directionSign = forwardDifference <= backwardDifference ? 1 : -1;
      const projectedDistance = baseSpeedMps * intervalSeconds * directionSign;
      return {
        kind: "track-linear",
        trackIndex: startSnap.trackIndex,
        startOffsetMeters: startSnap.offsetMeters,
        endOffsetMeters: clamp(
          startSnap.offsetMeters + projectedDistance,
          0,
          activeTrack.totalMeters
        ),
        durationMs: animationDurationMs
      };
    }
  }

  if (nextStopStation) {
    const distanceToStopMeters = distanceMeters(
      startLat,
      startLon,
      nextStopStation.lat,
      nextStopStation.lon
    );

    if (distanceToStopMeters <= STATION_HOLD_RADIUS_METERS) {
      return {
        kind: "dwell",
        lat: nextStopStation.lat,
        lon: nextStopStation.lon,
        durationMs: animationDurationMs
      };
    }

    const nextStopArrivalAtMs = parseArrivalTimestamp(vehicle.nextStopArrivalAt);
    if (nextStopArrivalAtMs !== null && nextStopArrivalAtMs > sampledAtMs) {
      const etaMs = nextStopArrivalAtMs - sampledAtMs;

      if (etaMs <= animationDurationMs) {
        const moveDurationMs = clamp(
          etaMs,
          MIN_MOVE_SEGMENT_MS,
          animationDurationMs
        );
        const dwellDurationMs = Math.max(
          0,
          Math.min(dwellMs, animationDurationMs - moveDurationMs)
        );
        return {
          kind: "arrive-dwell",
          startLat,
          startLon,
          stationLat: nextStopStation.lat,
          stationLon: nextStopStation.lon,
          moveDurationMs,
          dwellDurationMs
        };
      }

      const speedToStationMps = distanceToStopMeters / (etaMs / 1000);
      const blendedSpeedMps = clamp(
        observedSpeedMps !== null
          ? speedToStationMps * 0.65 + observedSpeedMps * 0.35
          : speedToStationMps,
        MIN_ESTIMATED_SPEED_MPS,
        MAX_ESTIMATED_SPEED_MPS
      );
      const projected = projectTowardsPoint(
        startLat,
        startLon,
        nextStopStation.lat,
        nextStopStation.lon,
        blendedSpeedMps * intervalSeconds
      );
      return {
        kind: "linear",
        startLat,
        startLon,
        endLat: projected.lat,
        endLon: projected.lon,
        durationMs: animationDurationMs
      };
    }

    const projected = projectTowardsPoint(
      startLat,
      startLon,
      nextStopStation.lat,
      nextStopStation.lon,
      baseSpeedMps * intervalSeconds
    );
    return {
      kind: "linear",
      startLat,
      startLon,
      endLat: projected.lat,
      endLon: projected.lon,
      durationMs: animationDurationMs
    };
  }

  if (headingDegrees !== null) {
    const projected = projectByHeading(
      startLat,
      startLon,
      headingDegrees,
      baseSpeedMps * intervalSeconds
    );
    return {
      kind: "linear",
      startLat,
      startLon,
      endLat: projected.lat,
      endLon: projected.lon,
      durationMs: animationDurationMs
    };
  }

  return {
    kind: "linear",
    startLat,
    startLon,
    endLat: vehicle.lat,
    endLon: vehicle.lon,
    durationMs: animationDurationMs
  };
}

function interpolateWithMotionPlan(
  plan: VehicleMotionPlan,
  elapsedMs: number,
  lineTracks: LineTrack[]
): { lat: number; lon: number } {
  if (plan.kind === "dwell") {
    return {
      lat: plan.lat,
      lon: plan.lon
    };
  }

  if (plan.kind === "arrive-dwell") {
    if (elapsedMs <= plan.moveDurationMs) {
      const progress = clamp(elapsedMs / plan.moveDurationMs, 0, 1);
      return interpolateLinearPosition(
        plan.startLat,
        plan.startLon,
        plan.stationLat,
        plan.stationLon,
        progress
      );
    }

    return {
      lat: plan.stationLat,
      lon: plan.stationLon
    };
  }

  if (plan.kind === "track-arrive-dwell") {
    const track = lineTracks[plan.trackIndex];
    if (!track) {
      return {
        lat: 0,
        lon: 0
      };
    }

    if (elapsedMs <= plan.moveDurationMs) {
      const progress = clamp(elapsedMs / plan.moveDurationMs, 0, 1);
      const offset =
        plan.startOffsetMeters +
        (plan.stationOffsetMeters - plan.startOffsetMeters) * progress;
      return interpolateOnTrack(track, offset);
    }

    return interpolateOnTrack(track, plan.stationOffsetMeters);
  }

  if (plan.kind === "track-linear") {
    const track = lineTracks[plan.trackIndex];
    if (!track) {
      return {
        lat: 0,
        lon: 0
      };
    }

    const progress = clamp(elapsedMs / plan.durationMs, 0, 1);
    const offset =
      plan.startOffsetMeters +
      (plan.endOffsetMeters - plan.startOffsetMeters) * progress;
    return interpolateOnTrack(track, offset);
  }

  const progress = clamp(elapsedMs / plan.durationMs, 0, 1);
  return interpolateLinearPosition(
    plan.startLat,
    plan.startLon,
    plan.endLat,
    plan.endLon,
    progress
  );
}

function motionPlanDurationMs(plan: VehicleMotionPlan): number {
  if (plan.kind === "arrive-dwell") {
    return plan.moveDurationMs + plan.dwellDurationMs;
  }

  if (plan.kind === "track-arrive-dwell") {
    return plan.moveDurationMs + plan.dwellDurationMs;
  }

  return plan.durationMs;
}

type DashboardStatus = "loading" | "ok" | "error" | "idle";

type MapZoomWatcherProps = {
  onZoomChange: (zoom: number) => void;
};

function MapZoomWatcher({ onZoomChange }: MapZoomWatcherProps) {
  const map = useMapEvents({
    zoomend: () => {
      onZoomChange(map.getZoom());
    }
  });

  useEffect(() => {
    onZoomChange(map.getZoom());
  }, [map, onZoomChange]);

  return null;
}

export default function BlueLineDashboard() {
  const [selectedLines, setSelectedLines] = useState<CtaRailLineId[]>(["blue"]);
  const [vehicles, setVehicles] = useState<CtaRailVehicle[]>([]);
  const [showTrains, setShowTrains] = useState(true);
  const [showStations, setShowStations] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [status, setStatus] = useState<DashboardStatus>("loading");
  const [statusText, setStatusText] = useState("Connecting to CTA...");
  const [pollIntervalMs, setPollIntervalMs] = useState(FALLBACK_POLL_INTERVAL_MS);
  const [mapZoom, setMapZoom] = useState(11);

  const rafIdRef = useRef<number | null>(null);
  const requestSeqRef = useRef(0);
  const vehicleIconCacheRef = useRef<Map<string, DivIcon>>(new Map());
  const displayedVehiclesRef = useRef<CtaRailVehicle[]>([]);
  const previousSampleByIdRef = useRef<Map<string, VehicleSample>>(new Map());

  const selectedLineLabels = useMemo(
    () =>
      selectedLines.length === 0
        ? "None selected"
        : selectedLines.map((lineId) => CTA_RAIL_LINE_CONFIG[lineId].label).join(", "),
    [selectedLines]
  );
  const selectedLineParam = useMemo(() => selectedLines.join(","), [selectedLines]);
  const selectedLineSet = useMemo(
    () => new Set<CtaRailLineId>(selectedLines),
    [selectedLines]
  );
  const lineTracksByLine = useMemo(() => {
    const map = new Map<CtaRailLineId, LineTrack[]>();
    for (const lineId of CTA_RAIL_LINE_IDS) {
      map.set(
        lineId,
        buildLineTracks(CTA_RAIL_LINE_CONFIG[lineId].pathSegments)
      );
    }

    return map;
  }, []);
  const stationByNameByLine = useMemo(() => {
    const map = new Map<CtaRailLineId, Map<string, (typeof CTA_STATIONS)[number]>>();

    for (const lineId of CTA_RAIL_LINE_IDS) {
      const stationByName = new Map<string, (typeof CTA_STATIONS)[number]>();
      for (const station of CTA_STATIONS) {
        if (!station.lines.includes(lineId)) {
          continue;
        }

        const normalizedName = normalizeStationName(station.name);
        if (!stationByName.has(normalizedName)) {
          stationByName.set(normalizedName, station);
        }
      }
      map.set(lineId, stationByName);
    }

    return map;
  }, []);
  const terminalStationIdsByLine = useMemo(() => {
    const map = new Map<CtaRailLineId, Set<string>>();
    for (const lineId of CTA_RAIL_LINE_IDS) {
      map.set(
        lineId,
        new Set(CTA_RAIL_LINE_CONFIG[lineId].terminalStationIds)
      );
    }

    return map;
  }, []);
  const getVehicleIcon = useCallback((vehicle: CtaRailVehicle): DivIcon => {
    const lineColor = CTA_RAIL_LINE_CONFIG[vehicle.line].color;
    const headingKey =
      vehicle.heading === null || !Number.isFinite(vehicle.heading)
        ? "na"
        : Math.round(vehicle.heading).toString();
    const cacheKey = `${vehicle.id}|${lineColor}|${headingKey}`;
    const cached = vehicleIconCacheRef.current.get(cacheKey);
    if (cached) {
      return cached;
    }

    const icon = createVehicleIcon(lineColor, vehicle.heading);
    if (vehicleIconCacheRef.current.size > 600) {
      vehicleIconCacheRef.current.clear();
    }
    vehicleIconCacheRef.current.set(cacheKey, icon);
    return icon;
  }, []);

  const stopAnimation = useCallback(() => {
    if (rafIdRef.current !== null) {
      window.cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
  }, []);

  const animateVehicles = useCallback(
    (nextVehicles: CtaRailVehicle[], intervalMs: number, sampledAtMs: number) => {
      stopAnimation();

      const setFrame = (frameVehicles: CtaRailVehicle[]) => {
        displayedVehiclesRef.current = frameVehicles;
        setVehicles(frameVehicles);
      };

      if (nextVehicles.length === 0) {
        setFrame(nextVehicles);
        return;
      }

      const fromById = new Map(
        displayedVehiclesRef.current.map((vehicle) => [vehicle.id, vehicle])
      );
      const motionPlanByVehicleId = new Map<string, VehicleMotionPlan>();

      for (const nextVehicle of nextVehicles) {
        const currentDisplayedVehicle = fromById.get(nextVehicle.id);
        const startLat = currentDisplayedVehicle?.lat ?? nextVehicle.lat;
        const startLon = currentDisplayedVehicle?.lon ?? nextVehicle.lon;
        const lineTracks = lineTracksByLine.get(nextVehicle.line) ?? [];
        const nextStopStation = stationByNameByLine
          .get(nextVehicle.line)
          ?.get(normalizeStationName(nextVehicle.nextStop));
        const previousSample = previousSampleByIdRef.current.get(nextVehicle.id);

        motionPlanByVehicleId.set(
          nextVehicle.id,
          buildMotionPlan(
            startLat,
            startLon,
            nextVehicle,
            intervalMs,
            sampledAtMs,
            previousSample,
            nextStopStation,
            lineTracks
          )
        );
      }
      const maxDurationMs = Math.max(
        ...Array.from(motionPlanByVehicleId.values()).map((plan) =>
          motionPlanDurationMs(plan)
        )
      );
      const startTs = performance.now();

      const tick = (now: number) => {
        const elapsedMs = now - startTs;

        const frameVehicles = nextVehicles.map((targetVehicle) => {
          const fallbackPlan: VehicleMotionPlan = {
            kind: "linear",
            startLat: targetVehicle.lat,
            startLon: targetVehicle.lon,
            endLat: targetVehicle.lat,
            endLon: targetVehicle.lon,
            durationMs: MIN_ANIMATION_DURATION_MS
          };
          const motionPlan =
            motionPlanByVehicleId.get(targetVehicle.id) ?? fallbackPlan;
          const lineTracks = lineTracksByLine.get(targetVehicle.line) ?? [];
          const interpolated = interpolateWithMotionPlan(
            motionPlan,
            elapsedMs,
            lineTracks
          );

          return {
            ...targetVehicle,
            lat: interpolated.lat,
            lon: interpolated.lon
          };
        });

        setFrame(frameVehicles);

        if (elapsedMs < maxDurationMs) {
          rafIdRef.current = window.requestAnimationFrame(tick);
        } else {
          rafIdRef.current = null;
        }
      };

      rafIdRef.current = window.requestAnimationFrame(tick);
    },
    [lineTracksByLine, stationByNameByLine, stopAnimation]
  );

  const fetchFeed = useCallback(async () => {
    const requestSeq = ++requestSeqRef.current;

    try {
      const query = new URLSearchParams({
        lines: selectedLineParam
      });
      const response = await fetch(`/api/cta/rail?${query.toString()}`, {
        cache: "no-store"
      });
      const payload = (await response.json()) as CtaRailFeedResponse;

      if (!response.ok) {
        const message =
          payload.error || `CTA feed request failed with ${response.status}.`;
        throw new Error(message);
      }
      if (requestSeq !== requestSeqRef.current) {
        return;
      }

      const nextIntervalMs = payload.pollIntervalMs || FALLBACK_POLL_INTERVAL_MS;
      const sampledAtMs = Date.now();
      animateVehicles(payload.vehicles, nextIntervalMs, sampledAtMs);
      setUpdatedAt(payload.updatedAt);
      setStatus("ok");
      setStatusText("Live");
      setPollIntervalMs(nextIntervalMs);
      previousSampleByIdRef.current = new Map(
        payload.vehicles.map((vehicle) => [
          vehicle.id,
          {
            vehicle,
            sampledAtMs
          }
        ])
      );
    } catch (error) {
      if (requestSeq !== requestSeqRef.current) {
        return;
      }

      const message =
        error instanceof Error ? error.message : "Failed to fetch CTA feed.";
      setStatus("error");
      setStatusText(message);
    }
  }, [animateVehicles, selectedLineParam]);

  useEffect(() => {
    stopAnimation();
    displayedVehiclesRef.current = [];
    previousSampleByIdRef.current = new Map();
    setVehicles([]);
    setUpdatedAt(null);

    if (selectedLines.length === 0) {
      setStatus("idle");
      setStatusText("No lines selected");
      return;
    }

    setStatus("loading");
    setStatusText("Loading selected lines...");
    void fetchFeed();
  }, [fetchFeed, selectedLines.length, stopAnimation]);

  useEffect(() => {
    if (selectedLines.length === 0) {
      return;
    }

    const timer = window.setInterval(() => {
      void fetchFeed();
    }, pollIntervalMs);

    return () => {
      window.clearInterval(timer);
    };
  }, [fetchFeed, pollIntervalMs, selectedLines.length]);

  useEffect(() => stopAnimation, [stopAnimation]);

  const toggleLine = useCallback((lineId: CtaRailLineId) => {
    setSelectedLines((current) => {
      if (current.includes(lineId)) {
        return CTA_RAIL_LINE_IDS.filter(
          (candidateId) => candidateId !== lineId && current.includes(candidateId)
        );
      }

      return CTA_RAIL_LINE_IDS.filter(
        (candidateId) => candidateId === lineId || current.includes(candidateId)
      );
    });
  }, []);

  const activeCount = vehicles.length;
  const nextSampleText = useMemo(
    () => `${Math.round(pollIntervalMs / 1000)}s`,
    [pollIntervalMs]
  );

  const runsByLine = useMemo(() => {
    return CTA_RAIL_LINE_IDS.filter((lineId) => selectedLines.includes(lineId)).map(
      (lineId) => ({
        lineId,
        line: CTA_RAIL_LINE_CONFIG[lineId],
        destinationGroups: (() => {
          const lineVehicles = vehicles
            .filter((vehicle) => vehicle.line === lineId)
            .sort((a, b) => a.runNumber.localeCompare(b.runNumber));
          const groups = new Map<string, CtaRailVehicle[]>();

          for (const vehicle of lineVehicles) {
            const destination = vehicle.destination || "Unknown destination";
            const bucket = groups.get(destination);
            if (bucket) {
              bucket.push(vehicle);
            } else {
              groups.set(destination, [vehicle]);
            }
          }

          return Array.from(groups.entries())
            .map(([destination, groupVehicles]) => ({
              destination,
              vehicles: groupVehicles.sort((a, b) =>
                a.runNumber.localeCompare(b.runNumber)
              )
            }))
            .sort((a, b) => a.destination.localeCompare(b.destination));
        })()
      })
    );
  }, [selectedLines, vehicles]);
  const vehicleCountsByLine = useMemo(() => {
    const counts = Object.fromEntries(
      CTA_RAIL_LINE_IDS.map((lineId) => [lineId, 0])
    ) as Record<CtaRailLineId, number>;

    for (const vehicle of vehicles) {
      counts[vehicle.line] += 1;
    }

    return counts;
  }, [vehicles]);
  const visibleStations = useMemo(() => {
    return CTA_STATIONS.map((station) => {
      const activeLines = station.lines.filter((lineId) =>
        selectedLineSet.has(lineId)
      );
      if (activeLines.length === 0) {
        return null;
      }

      const isTerminal = activeLines.some(
        (lineId) => terminalStationIdsByLine.get(lineId)?.has(station.id)
      );
      if (!isTerminal && mapZoom < SHOW_INTERMEDIATE_STATIONS_ZOOM) {
        return null;
      }

      return {
        station,
        activeLines,
        isTerminal
      };
    }).filter((value): value is {
      station: (typeof CTA_STATIONS)[number];
      activeLines: CtaRailLineId[];
      isTerminal: boolean;
    } => value !== null);
  }, [mapZoom, selectedLineSet, terminalStationIdsByLine]);
  const handleMapZoomChange = useCallback((zoom: number) => {
    setMapZoom(zoom);
  }, []);

  return (
    <main className="dashboard-shell">
      <header className="topbar">
        <h1>transitbro | Chicago CTA Rail</h1>
        <div className="topbar-meta">
          <span
            className={`status-pill ${
              status === "error" ? "error" : status === "idle" ? "idle" : "ok"
            }`}
          >
            {statusText}
          </span>
          <span className="meta-chip">Lines: {selectedLineLabels}</span>
          <span className="meta-chip">Last sample: {formatUpdatedAt(updatedAt)}</span>
          <span className="meta-chip">Refresh: {nextSampleText}</span>
        </div>
      </header>

      <section className="dashboard-grid">
        <aside className="sidebar">
          <h2>Rail Snapshot</h2>
          <p>Live train locations from CTA Train Tracker for selected lines.</p>

          <div className="stats-row">
            <article className="stat-card">
              <span className="stat-label">Active Trains</span>
              <span className="stat-value">{activeCount}</span>
            </article>
          </div>

          <section className="line-filter-panel">
            <h3>Lines On Map</h3>
            <div className="line-filter-list">
              {CTA_RAIL_LINE_IDS.map((lineId) => {
                const line = CTA_RAIL_LINE_CONFIG[lineId];
                const isChecked = selectedLines.includes(lineId);
                const lineVehicleCount = vehicleCountsByLine[lineId];

                return (
                  <label className="line-checkbox" key={line.id}>
                    <input
                      checked={isChecked}
                      onChange={() => toggleLine(line.id)}
                      type="checkbox"
                    />
                    <span
                      className="line-swatch"
                      style={{ backgroundColor: line.color }}
                    />
                    <span className="line-name">{line.label}</span>
                    <span className="line-count">{lineVehicleCount}</span>
                  </label>
                );
              })}
            </div>
          </section>

          <section className="layer-toggle-panel">
            <h3>Map Layers</h3>
            <div className="layer-toggle-list">
              <label className="layer-toggle">
                <input
                  checked={showTrains}
                  onChange={(event) => setShowTrains(event.target.checked)}
                  type="checkbox"
                />
                <span>Trains</span>
              </label>
              <label className="layer-toggle">
                <input
                  checked={showStations}
                  onChange={(event) => setShowStations(event.target.checked)}
                  type="checkbox"
                />
                <span>Stations</span>
              </label>
            </div>
          </section>

          {status === "error" ? (
            <p className="error-note">{statusText}</p>
          ) : (
            <p>
              Select one, several, or all lines. Markers interpolate continuously with brief station dwells.
            </p>
          )}

          {runsByLine.map(({ lineId, line, destinationGroups }) => (
            <details className="runs-panel" key={lineId}>
              <summary>
                {line.label} runs (
                {destinationGroups.reduce(
                  (count, group) => count + group.vehicles.length,
                  0
                )}
                )
              </summary>
              <section className="destination-groups">
                {destinationGroups.length === 0 ? (
                  <p className="empty-runs">No active runs in current sample.</p>
                ) : (
                  destinationGroups.map((group) => (
                    <section
                      className="destination-group"
                      key={`${lineId}-${group.destination}`}
                    >
                      <h4>
                        <span
                          className="line-swatch destination-swatch"
                          style={{ backgroundColor: line.color }}
                        />
                        Toward {group.destination} ({group.vehicles.length})
                      </h4>
                      <div className="train-list">
                        {group.vehicles.map((vehicle) => (
                          <article className="train-item" key={vehicle.id}>
                            <h3>Run {vehicle.runNumber}</h3>
                            <p>
                              Next stop: {vehicle.nextStop}
                              <br />
                              ETA: {formatNextStopEta(vehicle.nextStopArrivalAt)}
                            </p>
                          </article>
                        ))}
                      </div>
                    </section>
                  ))
                )}
              </section>
            </details>
          ))}
        </aside>

        <div className="map-wrap">
          <MapContainer
            center={CHICAGO_CENTER}
            zoom={11}
            minZoom={9}
            maxZoom={17}
            scrollWheelZoom
            className="map-root"
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>'
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            />
            <MapZoomWatcher onZoomChange={handleMapZoomChange} />

            {selectedLines.map((lineId) => {
              const line = CTA_RAIL_LINE_CONFIG[lineId];
              return (
                <Fragment key={`path-${lineId}`}>
                  {line.pathSegments.map((segment, segmentIndex) => (
                    <Fragment key={`path-${lineId}-${segmentIndex}`}>
                      <Polyline
                        pathOptions={{
                          color: "#07121f",
                          opacity: 0.95,
                          weight: 8
                        }}
                        positions={segment}
                      />
                      <Polyline
                        pathOptions={{
                          color: line.color,
                          opacity: 0.95,
                          weight: 4
                        }}
                        positions={segment}
                      />
                    </Fragment>
                  ))}
                </Fragment>
              );
            })}

            {showTrains
              ? vehicles.map((vehicle) => {
                  const line = CTA_RAIL_LINE_CONFIG[vehicle.line];
                  return (
                    <Fragment key={vehicle.id}>
                      <Marker icon={getVehicleIcon(vehicle)} position={[vehicle.lat, vehicle.lon]}>
                        <Popup>
                          <span
                            className={`train-status-pill ${trainStatusClass(vehicle.isDelayed)}`}
                          >
                            {trainStatusLabel(vehicle.isDelayed)}
                          </span>
                          <br />
                          <strong>{line.label} | Run {vehicle.runNumber}</strong>
                          <br />
                          Destination: {vehicle.destination}
                          <br />
                          Next stop: {vehicle.nextStop}
                          <br />
                          ETA: {formatNextStopEta(vehicle.nextStopArrivalAt)}
                          <br />
                          Heading: {vehicle.heading ?? "n/a"} deg
                        </Popup>
                      </Marker>
                    </Fragment>
                  );
                })
              : null}

            {showStations
              ? visibleStations.map(({ station, activeLines, isTerminal }) => {
                  const singleLine =
                    activeLines.length === 1 ? activeLines[0] : null;
                  const stationColor = singleLine
                    ? CTA_RAIL_LINE_CONFIG[singleLine].color
                    : "#d7e6ff";
                  const showLabel =
                    isTerminal || mapZoom >= SHOW_INTERMEDIATE_STATION_LABELS_ZOOM;

                  return (
                    <CircleMarker
                      center={[station.lat, station.lon]}
                      key={station.id}
                      pathOptions={{
                        color: "#07121f",
                        fillColor: stationColor,
                        fillOpacity: isTerminal ? 1 : 0.85,
                        opacity: 1,
                        weight: 1
                      }}
                      radius={isTerminal ? 4 : 2.4}
                    >
                      <Popup>
                        <strong>{station.name}</strong>
                        <br />
                        Lines:{" "}
                        {activeLines
                          .map((lineId) => CTA_RAIL_LINE_CONFIG[lineId].label)
                          .join(", ")}
                      </Popup>
                      {showLabel ? (
                        <Tooltip
                          className={`station-label ${isTerminal ? "terminal" : ""}`}
                          direction="top"
                          offset={[0, -2]}
                          opacity={1}
                          permanent
                        >
                          {station.name}
                        </Tooltip>
                      ) : null}
                    </CircleMarker>
                  );
                })
              : null}
          </MapContainer>
        </div>
      </section>
    </main>
  );
}
