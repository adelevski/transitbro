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
const MAX_ANIMATION_DURATION_MS = 4200;
const MIN_ANIMATION_DURATION_MS = 1200;
const SHOW_INTERMEDIATE_STATIONS_ZOOM = 12;
const SHOW_INTERMEDIATE_STATION_LABELS_ZOOM = 14;

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

function easeInOutCubic(progress: number): number {
  if (progress < 0.5) {
    return 4 * progress * progress * progress;
  }

  return 1 - Math.pow(-2 * progress + 2, 3) / 2;
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
    (nextVehicles: CtaRailVehicle[], intervalMs: number) => {
      stopAnimation();

      const setFrame = (frameVehicles: CtaRailVehicle[]) => {
        displayedVehiclesRef.current = frameVehicles;
        setVehicles(frameVehicles);
      };

      if (nextVehicles.length === 0 || displayedVehiclesRef.current.length === 0) {
        setFrame(nextVehicles);
        return;
      }

      const fromById = new Map(
        displayedVehiclesRef.current.map((vehicle) => [vehicle.id, vehicle])
      );
      const animationDurationMs = Math.max(
        MIN_ANIMATION_DURATION_MS,
        Math.min(MAX_ANIMATION_DURATION_MS, intervalMs - 450)
      );
      const startTs = performance.now();

      const tick = (now: number) => {
        const elapsedMs = now - startTs;
        const progress = Math.min(elapsedMs / animationDurationMs, 1);
        const easedProgress = easeInOutCubic(progress);

        const frameVehicles = nextVehicles.map((targetVehicle) => {
          const originVehicle = fromById.get(targetVehicle.id);
          if (!originVehicle) {
            return targetVehicle;
          }

          return {
            ...targetVehicle,
            lat:
              originVehicle.lat +
              (targetVehicle.lat - originVehicle.lat) * easedProgress,
            lon:
              originVehicle.lon +
              (targetVehicle.lon - originVehicle.lon) * easedProgress
          };
        });

        setFrame(frameVehicles);

        if (progress < 1) {
          rafIdRef.current = window.requestAnimationFrame(tick);
        } else {
          rafIdRef.current = null;
        }
      };

      rafIdRef.current = window.requestAnimationFrame(tick);
    },
    [stopAnimation]
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
      animateVehicles(payload.vehicles, nextIntervalMs);
      setUpdatedAt(payload.updatedAt);
      setStatus("ok");
      setStatusText("Live");
      setPollIntervalMs(nextIntervalMs);
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
              Select one, several, or all lines. Markers interpolate between samples.
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
