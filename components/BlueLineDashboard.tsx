"use client";

import { Fragment, memo, useEffect, useMemo, useRef, useState } from "react";
import { divIcon, type Marker as LeafletMarker } from "leaflet";
import {
  CircleMarker,
  MapContainer,
  Marker,
  Popup,
  Polyline,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import { ADAPTERS, CTA_CONNECTED } from "@/lib/adapters";
import {
  canInterpolate,
  EXPIRE_AFTER_MS,
  formatCountdown,
  sampleAge,
  STALE_AFTER_MS,
  type ArrivalBoard,
  type Feed,
  type Line,
  type RailVehicle,
  type Station,
} from "@/lib/transit";
import { startPolling } from "@/lib/poll";

function clock(iso: string | null | undefined, timeZone: string) {
  if (!iso || !Number.isFinite(Date.parse(iso))) return "Unknown";
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  });
}
function ageText(iso: string | null | undefined, now: number) {
  const age = sampleAge(iso, now);
  if (!Number.isFinite(age)) return "Report time unavailable";
  if (age < 60_000) return `${Math.floor(age / 1000)}s ago`;
  return `${Math.floor(age / 60_000)} min ago`;
}
function delayLabel(value: boolean | null) {
  return value === true
    ? "Delay reported"
    : value === false
      ? "No delay reported"
      : "Delay status unavailable";
}

const ReportedMarker = memo(function ReportedMarker({
  vehicle,
  line,
  stale,
  selected,
  timeZone,
}: {
  vehicle: RailVehicle;
  line: Line;
  stale: boolean;
  selected: boolean;
  timeZone: string;
}) {
  const marker = useRef<LeafletMarker>(null);
  const previous = useRef(vehicle);
  const icon = useMemo(
    () =>
      divIcon({
        className: "",
        iconSize: [20, 20],
        iconAnchor: [10, 10],
        html: `<div class="vehicle-icon${vehicle.heading === null ? " no-heading" : ""}" style="--vehicle-color:${line.color};--vehicle-rotation:${vehicle.heading ?? 0}deg"><span class="vehicle-arrow"><span class="vehicle-arrow-shaft"></span><span class="vehicle-arrow-head"></span></span></div>`,
      }),
    [line.color, vehicle.heading],
  );
  useEffect(() => {
    const layer = marker.current;
    const from = previous.current;
    previous.current = vehicle;
    if (!layer) return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    const finish = () => {
      cancelAnimationFrame(frame);
      layer.setLatLng([vehicle.lat, vehicle.lon]);
    };
    if (
      !stale &&
      !media.matches &&
      document.visibilityState === "visible" &&
      canInterpolate(from, vehicle, Date.now())
    ) {
      const origin = { lat: from.lat, lng: from.lon };
      layer.setLatLng(origin);
      const start = performance.now();
      const tick = (now: number) => {
        const t = Math.min((now - start) / 1000, 1);
        layer.setLatLng([
          origin.lat + (vehicle.lat - origin.lat) * t,
          origin.lng + (vehicle.lon - origin.lng) * t,
        ]);
        if (t < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    } else finish();
    media.addEventListener("change", finish);
    document.addEventListener("visibilitychange", finish);
    return () => {
      finish();
      media.removeEventListener("change", finish);
      document.removeEventListener("visibilitychange", finish);
    };
  }, [vehicle, stale]);
  useEffect(() => {
    if (selected) marker.current?.openPopup();
  }, [selected]);
  return (
    <Marker
      ref={marker}
      position={[vehicle.lat, vehicle.lon]}
      icon={icon}
      opacity={stale ? 0.45 : 1}
      title={`${line.label} train ${vehicle.runNumber}, toward ${vehicle.destination}`}
      alt={`${line.label} train ${vehicle.runNumber}`}
    >
      <Popup>
        <strong>
          {line.label} · {vehicle.runNumber}
        </strong>
        <p>
          Toward {vehicle.destination}
          <br />
          Next: {vehicle.nextStop}
        </p>
        <p>
          {stale ? "Old position report" : "Reported position"} ·{" "}
          {clock(vehicle.updatedAt, timeZone)}
          <br />
          {delayLabel(vehicle.isDelayed)}
        </p>
        {vehicle.nextStopArrivalAt && (
          <p>
            Next-stop estimate: {clock(vehicle.nextStopArrivalAt, timeZone)}
          </p>
        )}
      </Popup>
    </Marker>
  );
});

function MapEvents({
  onZoom,
  focus,
}: {
  onZoom: (zoom: number) => void;
  focus: { lat: number; lon: number; id: string } | null;
}) {
  const map = useMap();
  useMapEvents({ zoomend: () => onZoom(map.getZoom()) });
  useEffect(() => {
    if (focus)
      map.setView([focus.lat, focus.lon], Math.max(map.getZoom(), 14), {
        animate: false,
      });
  }, [map, focus]);
  return null;
}

function Dashboard({
  city,
  onCity,
}: {
  city: string;
  onCity: (city: string) => void;
}) {
  const adapter = ADAPTERS[city];
  const [selectedLines, setSelectedLines] = useState(adapter.defaultLines);
  const [stations, setStations] = useState<Station[]>([]);
  const [stationId, setStationId] = useState(
    city === "chicago" ? "40670" : "place-pktrm",
  );
  const [stationError, setStationError] = useState("");
  const [feed, setFeed] = useState<Feed | null>(null);
  const [feedError, setFeedError] = useState("");
  const [board, setBoard] = useState<ArrivalBoard | null>(null);
  const [boardError, setBoardError] = useState("");
  const [now, setNow] = useState(Date.now());
  const [showTrains, setShowTrains] = useState(true);
  const [showStations, setShowStations] = useState(true);
  const [zoom, setZoom] = useState(11);
  const [focus, setFocus] = useState<{
    lat: number;
    lon: number;
    id: string;
  } | null>(null);
  const linesKey = selectedLines.join(",");
  const lineMap = useMemo(
    () => new Map(adapter.lines.map((line) => [line.id, line])),
    [adapter],
  );

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(
    () =>
      startPolling({
        load: (signal) => adapter.loadStations(signal),
        receive: (value) => {
          setStations(value);
          setStationError("");
        },
        fail: (error) => setStationError(error.message),
        interval: 3600_000,
        visible: () => document.visibilityState === "visible",
      }),
    [adapter],
  );
  useEffect(() => {
    setFeed(null);
    setFeedError("");
    if (!linesKey) return;
    return startPolling({
      load: (signal) => adapter.loadVehicles(linesKey.split(","), signal),
      receive: (value) => {
        setFeed(value);
        setFeedError("");
      },
      fail: (error) => setFeedError(error.message),
      interval: city === "boston" ? 30_000 : 20_000,
      visible: () => document.visibilityState === "visible",
    });
  }, [adapter, linesKey, city]);
  useEffect(() => {
    setBoard(null);
    setBoardError("");
    if (!stationId) return;
    return startPolling({
      load: (signal) => adapter.loadArrivals(stationId, signal),
      receive: (value) => {
        setBoard(value);
        setBoardError("");
      },
      fail: (error) => setBoardError(error.message),
      interval: 30_000,
      visible: () => document.visibilityState === "visible",
    });
  }, [adapter, stationId]);

  const vehicles = useMemo(
    () =>
      feed?.vehicles.filter((vehicle) =>
        selectedLines.includes(vehicle.line),
      ) ?? [],
    [feed, selectedLines],
  );
  const visibleVehicles = vehicles.filter(
    (vehicle) => sampleAge(vehicle.updatedAt, now) < EXPIRE_AFTER_MS,
  );
  const staleCount = vehicles.filter(
    (vehicle) => sampleAge(vehicle.updatedAt, now) >= STALE_AFTER_MS,
  ).length;
  const feedOld =
    !!feed &&
    (feed.stale ||
      (vehicles.length > 0
        ? staleCount === vehicles.length
        : sampleAge(feed.updatedAt, now) >= STALE_AFTER_MS));
  const state = !selectedLines.length
    ? "idle"
    : feedError
      ? "error"
      : !feed
        ? "loading"
        : feedOld || staleCount
          ? "stale"
          : "ok";
  const statusText = {
    idle: "No lines selected",
    error: "Feed unavailable",
    loading: "Connecting…",
    stale: vehicles.length ? "Some reports are old" : "Report time unavailable",
    ok: vehicles.length ? "Reports fresh" : "No trains reported",
  }[state];
  const boardOld =
    !!board &&
    (board.stale ||
      sampleAge(board.updatedAt ?? board.fetchedAt, now) >= STALE_AFTER_MS);
  const arrivals =
    board?.arrivals.filter(
      (arrival) => Date.parse(arrival.arrivalAt) >= now - 30_000,
    ) ?? [];
  const groups = new Map<string, typeof arrivals>();
  for (const arrival of arrivals) {
    const key = `${arrival.line}|${arrival.destination}`;
    groups.set(key, [...(groups.get(key) ?? []), arrival]);
  }
  const selectedStation = stations.find((station) => station.id === stationId);
  function chooseStation(id: string) {
    setStationId(id);
    const station = stations.find((item) => item.id === id);
    if (station) setFocus(station);
  }
  function toggleLine(id: string) {
    setSelectedLines((current) =>
      adapter.lines
        .filter((line) =>
          line.id === id ? !current.includes(id) : current.includes(line.id),
        )
        .map((line) => line.id),
    );
  }

  return (
    <main className="dashboard-shell">
      <a className="skip-link" href="#station-arrivals">
        Skip to station arrivals
      </a>
      <header className="topbar">
        <div className="brand-row">
          <h1>transitbro</h1>
          <label className="city-label">
            <span className="sr-only">City</span>
            <select
              value={city}
              onChange={(event) => onCity(event.target.value)}
            >
              <option value="chicago">
                Chicago · CTA{!CTA_CONNECTED ? " · map only" : ""}
              </option>
              <option value="boston">Boston · MBTA</option>
            </select>
          </label>
        </div>
        <div className="topbar-meta">
          <span
            role="status"
            className={`status-pill ${state === "ok" ? "ok" : state === "error" ? "error" : "idle"}`}
          >
            {statusText}
          </span>
          <span className="meta-chip">
            {visibleVehicles.length} trains shown
          </span>
        </div>
      </header>
      <section className="dashboard-grid">
        <aside className="sidebar" aria-label="Transit controls and arrivals">
          <section
            className="arrival-panel"
            id="station-arrivals"
            aria-labelledby="arrivals-heading"
          >
            <div className="section-heading">
              <h2 id="arrivals-heading">Station arrivals</h2>
              <span className="live-dot" aria-hidden="true" />
            </div>
            <label htmlFor="station">Station</label>
            <select
              id="station"
              value={stationId}
              onChange={(event) => chooseStation(event.target.value)}
            >
              {!stations.length && (
                <option value={stationId}>Loading stations…</option>
              )}
              {stations.map((station) => (
                <option value={station.id} key={station.id}>
                  {station.name}
                </option>
              ))}
            </select>
            {stationError && (
              <p className="error-note" role="status">
                {stationError}
              </p>
            )}
            <div
              role="status"
              className={boardError || boardOld ? "error-note" : "board-meta"}
            >
              {boardError ||
                (boardOld
                  ? "Old arrivals · check the operator before traveling"
                  : board
                    ? "Arrivals loaded"
                    : "Loading arrivals…")}
            </div>
            {board && (
              <p className="board-meta">
                Checked {ageText(board.fetchedAt, now)} · Times in{" "}
                {city === "chicago" ? "Chicago" : "Boston"} ·{" "}
                {board.updatedAt
                  ? "provider estimates"
                  : "provider report time unavailable"}
              </p>
            )}
            <div
              className="arrivals-list"
              tabIndex={0}
              role="region"
              aria-label="Upcoming arrival groups"
            >
              {!boardOld &&
                !boardError &&
                [...groups].map(([key, items]) => (
                  <section key={key} className="arrival-group">
                    <h3>
                      <span
                        className="line-swatch"
                        style={{
                          backgroundColor:
                            lineMap.get(items[0].line)?.color ?? "#adbdd0",
                        }}
                      />
                      {items[0].destination}
                    </h3>
                    <ol>
                      {items.slice(0, 3).map((arrival, index) => (
                        <li key={arrival.id}>
                          <div>
                            <span>
                              {lineMap.get(arrival.line)?.label ?? arrival.line}
                            </span>
                            <small>
                              {arrival.kind === "schedule"
                                ? "Scheduled"
                                : "Estimated"}
                              {arrival.isDelayed ? " · delay reported" : ""} ·{" "}
                              {clock(arrival.arrivalAt, adapter.timeZone)}
                            </small>
                          </div>
                          <strong
                            className={index === 0 ? "next-countdown" : ""}
                          >
                            {arrival.uncertain
                              ? "Uncertain"
                              : arrival.updatedAt &&
                                  sampleAge(arrival.updatedAt, now) >=
                                    STALE_AFTER_MS
                                ? "Old estimate"
                                : formatCountdown(arrival.arrivalAt, now)}
                          </strong>
                        </li>
                      ))}
                    </ol>
                  </section>
                ))}
              {board && !arrivals.length && !boardError && !boardOld && (
                <p>
                  No upcoming arrivals reported. This does not confirm that
                  service has ended.
                </p>
              )}
            </div>
            <a
              className="operator-link"
              href={adapter.sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              Official tracker & service information ↗
            </a>
          </section>

          <section
            className="line-filter-panel"
            aria-labelledby="lines-heading"
          >
            <div className="section-heading">
              <h2 id="lines-heading">Lines on map</h2>
              <div className="button-pair">
                <button
                  onClick={() =>
                    setSelectedLines(adapter.lines.map((line) => line.id))
                  }
                >
                  All
                </button>
                <button onClick={() => setSelectedLines([])}>None</button>
              </div>
            </div>
            <div className="line-filter-list">
              {adapter.lines.map((line) => (
                <label className="line-checkbox" key={line.id}>
                  <input
                    type="checkbox"
                    checked={selectedLines.includes(line.id)}
                    onChange={() => toggleLine(line.id)}
                  />
                  <span
                    className="line-swatch"
                    style={{ backgroundColor: line.color }}
                  />
                  <span className="line-name">{line.label}</span>
                  <span className="line-count">
                    {selectedLines.includes(line.id)
                      ? visibleVehicles.filter(
                          (vehicle) => vehicle.line === line.id,
                        ).length
                      : "—"}
                  </span>
                </label>
              ))}
            </div>
          </section>
          <section className="layer-toggle-panel">
            <h2>Map layers</h2>
            <div className="layer-toggle-list">
              <label className="layer-toggle">
                <input
                  type="checkbox"
                  checked={showTrains}
                  onChange={(event) => setShowTrains(event.target.checked)}
                />
                Trains
              </label>
              <label className="layer-toggle">
                <input
                  type="checkbox"
                  checked={showStations}
                  onChange={(event) => setShowStations(event.target.checked)}
                />
                Stations
              </label>
            </div>
          </section>
          {feedError && <p className="error-note">{feedError}</p>}
          <p className="data-note">
            Positions are provider reports. Short transitions are visual
            estimates; trains never move beyond the latest report. Reports older
            than 90 seconds fade; after 5 minutes they disappear.
          </p>
          {adapter.lines
            .filter((line) => selectedLines.includes(line.id))
            .map((line) => (
              <details className="runs-panel" key={line.id}>
                <summary>
                  {line.label} trains (
                  {
                    visibleVehicles.filter(
                      (vehicle) => vehicle.line === line.id,
                    ).length
                  }
                  )
                </summary>
                <div className="destination-groups">
                  {visibleVehicles
                    .filter((vehicle) => vehicle.line === line.id)
                    .map((vehicle) => (
                      <article className="train-item" key={vehicle.id}>
                        <button
                          className="train-focus"
                          onClick={() => {
                            setShowTrains(true);
                            setFocus({
                              id: vehicle.id,
                              lat: vehicle.lat,
                              lon: vehicle.lon,
                            });
                          }}
                        >
                          Train {vehicle.runNumber} · {vehicle.destination}
                        </button>
                        <p>
                          {vehicle.nextStop}
                          <br />
                          {vehicle.nextStopArrivalAt
                            ? `Estimated ${formatCountdown(vehicle.nextStopArrivalAt, now)} · `
                            : ""}
                          {ageText(vehicle.updatedAt, now)}
                        </p>
                      </article>
                    ))}
                </div>
              </details>
            ))}
          <footer className="sidebar-footer">
            <a href="https://github.com/snowball-projects/transitbro">
              Source · MIT
            </a>
            <a href="https://snowball-projects.github.io/operations/#transitbro">
              Operations
            </a>
            <span>
              by <a href="https://snowball-projects.github.io/">snowball</a>
            </span>
            <p>
              Data provided by{" "}
              {city === "chicago"
                ? "Chicago Transit Authority"
                : "MassDOT / MBTA"}
              . Independent project; no agency affiliation.
            </p>
          </footer>
        </aside>
        <div className="map-wrap" aria-label={`${adapter.label} train map`}>
          <MapContainer
            center={adapter.center}
            zoom={11}
            minZoom={8}
            maxZoom={17}
            className="map-root"
            scrollWheelZoom
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapEvents onZoom={setZoom} focus={focus} />
            {adapter.lines
              .filter((line) => selectedLines.includes(line.id))
              .map((line) => (
                <Fragment key={line.id}>
                  {line.pathSegments.map((segment, index) => (
                    <Fragment key={index}>
                      <Polyline
                        positions={segment}
                        pathOptions={{
                          color: "#07121f",
                          weight: 7,
                          opacity: 0.85,
                        }}
                      />
                      <Polyline
                        positions={segment}
                        pathOptions={{
                          color: line.color,
                          weight: 3,
                          opacity: 0.95,
                        }}
                      />
                    </Fragment>
                  ))}
                </Fragment>
              ))}
            {showTrains &&
              visibleVehicles.map((vehicle) => (
                <ReportedMarker
                  key={vehicle.id}
                  vehicle={vehicle}
                  line={lineMap.get(vehicle.line)!}
                  timeZone={adapter.timeZone}
                  stale={
                    !!feedOld ||
                    sampleAge(vehicle.updatedAt, now) >= STALE_AFTER_MS
                  }
                  selected={focus?.id === vehicle.id}
                />
              ))}
            {showStations &&
              stations
                .filter((station) =>
                  station.lines.some((id) => selectedLines.includes(id)),
                )
                .filter(
                  (station) =>
                    zoom >= 12 ||
                    station.id === stationId ||
                    adapter.lines.some(
                      (line) =>
                        selectedLines.includes(line.id) &&
                        line.terminalStationIds.includes(station.id),
                    ),
                )
                .map((station) => (
                  <CircleMarker
                    key={station.id}
                    center={[station.lat, station.lon]}
                    radius={station.id === stationId ? 6 : 3}
                    pathOptions={{
                      color: "#091323",
                      weight: 1,
                      fillColor:
                        station.id === stationId ? "#ffffff" : "#a1bfdc",
                      fillOpacity: 1,
                    }}
                  >
                    <Popup>
                      <strong>{station.name}</strong>
                      <p>
                        <button onClick={() => chooseStation(station.id)}>
                          Show station arrivals
                        </button>
                      </p>
                    </Popup>
                    {(zoom >= 14 || station.id === stationId) && (
                      <Tooltip
                        permanent
                        direction="top"
                        className="station-label"
                      >
                        {station.name}
                      </Tooltip>
                    )}
                  </CircleMarker>
                ))}
          </MapContainer>
          <div className="map-caption">
            {city === "chicago"
              ? "CTA rail · route geometry snapshot"
              : "MBTA subway & light rail · reported locations"}
            {selectedStation ? ` · ${selectedStation.name}` : ""}
          </div>
        </div>
      </section>
    </main>
  );
}
export default function BlueLineDashboard() {
  const [city, setCity] = useState("chicago");
  return <Dashboard key={city} city={city} onCity={setCity} />;
}
