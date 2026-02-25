# transitbro architecture (Iteration 4)

## System overview
1. Browser requests `/api/cta/rail?lines=...` with selected line IDs.
2. Next.js route handler validates selected lines and fetches CTA Train Tracker `ttpositions` per selected line using server-side API key.
3. Server normalizes train records into a stable internal rail vehicle model (`line`, `runNumber`, position, destination, next stop, heading).
4. Browser polls on the configured interval and interpolates marker positions between samples.
5. Browser renders selected route geometries for all CTA rail lines from GTFS-derived path artifacts.
6. Browser renders GTFS-derived station markers with zoom gating (line terminals always on, intermediate stations at higher zoom).

## Why this architecture
- Keeps CTA credentials server-side.
- Supports one/some/all line selection with one UI flow.
- Keeps line-specific concerns in `lib/ctaRailLines.ts` so adding or adjusting lines remains centralized.

## Data model (current)
- `CtaRailVehicle`
  - `id`
  - `line`
  - `runNumber`
  - `lat`, `lon`
  - `heading`
  - `destination`
  - `nextStop`
  - `nextStopArrivalAt`
  - `direction`
  - `updatedAt`

## Current limitations
- Polling only (no push stream yet).
- No persistence/cache layer.
- Multiple selected lines currently trigger one upstream request per line on each poll.
- No bus feed integration yet.
- No automated validation yet against official GTFS schedule updates (path/station snapshots are static artifacts).

## Planned evolution
- Add short-lived cache and eventually SSE/WebSocket fanout.
- Add server aggregation optimizations to reduce duplicated upstream calls.
- Add route/station GTFS static data service for richer map context.
