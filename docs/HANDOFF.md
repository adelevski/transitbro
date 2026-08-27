# transitbro handoff

## Session handshake checklist
1. Read [README.md](../README.md), [docs/ARCHITECTURE.md](./ARCHITECTURE.md), and [docs/ROADMAP.md](./ROADMAP.md).
2. Confirm the current phase and active milestone.
3. Run local app and verify `GET /api/cta/blue-line` with valid `CTA_API_KEY`.
4. Update this file with:
   - what was completed,
   - what is next,
   - blockers/assumptions.

## Current status (2026-08-27)
- Iteration 1 implemented:
  - Next.js app skeleton.
  - CTA Blue Line proxy endpoint.
  - Minimal live map + heading vectors + train list panel.
  - Initial roadmap/architecture docs.
- Compatibility fix applied for Next.js 15:
  - `ssr: false` moved out of `app/page.tsx` into a client wrapper component.
  - Resolved prerender `window is not defined` for Leaflet imports.
  - `npm run build` now passes successfully.
- Iteration 2 updates completed:
  - Added smooth marker interpolation between feed samples.
  - Added Blue Line route overlay from CTA GTFS shape data.
  - Updated layout to dark theme.
  - Moved refresh interval into top-right metadata row.
  - Converted run list to collapsible dropdown panel.
  - Set default poll interval to 5s (`CTA_POLL_INTERVAL_MS`, bounded to 5s-60s).
- Iteration 3 updates completed:
  - Added shared rail feed abstraction (`blue`, `red`) in `lib/cta.ts` + `lib/ctaRailLines.ts`.
  - Added Red Line route shape and endpoint (`/api/cta/red-line`).
  - Added multi-line endpoint (`/api/cta/rail?lines=...`).
  - Added left sidebar checkbox panel to display one/some/all selected lines.
  - Updated map to render multi-line overlays, markers, and per-line run dropdowns.
  - Verified `npm run typecheck` and `npm run build` pass.
- Iteration 3.1 UX/data enhancement completed:
  - Grouped run dropdown contents by destination for each selected line.
  - Removed repeated per-run destination text in list cards.
  - Added next-stop ETA rendering in run cards and marker popups.
  - Extended normalized vehicle model with `nextStopArrivalAt` from CTA `arrT` when available.
  - Verified `npm run typecheck` and `npm run build` pass.
- Iteration 3.2 map context enhancement completed:
  - Added GTFS-derived station dataset for Blue/Red (`lib/ctaStations.ts`).
  - Added station marker rendering on map with clutter controls:
    - line terminal stations are always visible,
    - intermediate stations appear only when zoomed in.
  - Added compact station labels (terminal labels always visible, intermediate labels at higher zoom).
  - Verified `npm run typecheck` and `npm run build` pass.
- Iteration 3.3 layer controls and marker icon update completed:
  - Added map-layer toggles for `Trains` and `Stations`.
  - Added heading arrows inside train marker circles.
  - Train marker arrow rotates by heading when available.
  - Verified `npm run typecheck` and `npm run build` pass.
- Iteration 3.4 marker/readability and popup status update completed:
  - Removed dotted heading vector lines from train markers.
  - Increased train arrow readability with clearer head + shaft styling.
  - Added popup status badge (`On time` / `Late`) with green/red dot.
  - Fixed line selection checkbox gray state by removing disabled style on the last selected line.
  - Verified `npm run typecheck` and `npm run build` pass.
- Iteration 3.5 line-selection behavior update completed:
  - Line checkboxes now allow zero selected lines.
  - Dashboard enters an idle state when none are selected (`No lines selected`).
  - Polling pauses until at least one line is selected again.
  - `/api/cta/rail` now supports explicit empty selection (`lines=`) without defaulting to Blue.
  - Verified `npm run typecheck` and `npm run build` pass.
- Iteration 4 all-lines rail expansion completed:
  - Expanded core rail line IDs/types to include all CTA rail routes:
    - `blue`, `red`, `brn`, `g`, `org`, `p`, `pink`, `y`.
  - Added full line metadata (label/color/CTA route ID/terminal station IDs) in `lib/ctaRailLines.ts`.
  - Switched map overlay rendering to GTFS-derived multi-segment line paths via `lib/ctaLinePaths.ts`.
  - Updated per-line vehicle counts and station terminal logic to be dynamic across the full line set.
  - Verified `npm run typecheck` and `npm run build` pass.
- Iteration 5 normalization, packaging, and CI hardening completed (2026-08-27):
  - Fixed CTA compact local timestamps so feed sample times and next-stop ETAs
    are emitted as unambiguous ISO instants using the `America/Chicago` timezone.
    Both the documented compact form and the unzoned ISO form shown in CTA's
    JSON examples are covered.
  - Fixed malformed coordinates (`null`, blank, non-finite, or out of range)
    being accepted as valid vehicle positions.
  - Replaced incorrect generic inbound/outbound direction labels with CTA's
    documented route-specific operational directions.
  - Added deterministic mocked tests for singleton/array response handling,
    timestamps, coordinate rejection, line selection, aggregation, upstream
    errors, and `/api/cta/rail` response behavior.
  - Added the `npm run check` verification command and GitHub Actions CI on
    Node.js 20.
  - Updated Next.js within version 15 and overrode vulnerable transitive
    PostCSS/Sharp releases; `npm audit` reports no known vulnerabilities.
  - Added reproducible install and production deployment instructions.
  - Reviewed Traincountdown as read-only source material. Its clock display did
    not warrant a separate user-facing feature; the useful underlying concern,
    reliable time/countdown handling, was addressed in Transitbro's existing ETA
    normalization and tests instead.
  - Verified `npm test` (12 tests), `npm run typecheck`, `npm run build`, and
    `npm audit` pass.

## Open items
- Confirm CTA field mapping against real feed payload with valid key.
- Add stale-data indicator (for when feed updates stop but API still responds).
- Add server-side caching/fanout to reduce duplicate upstream requests as clients grow.
- Add retry/backoff + telemetry around CTA upstream failures.

## Next best task
- Add robust API error handling (retry policy, stale-data marker, and lightweight telemetry counters).

## Known blockers/assumptions
- CTA API key is required.
- CTA uptime and response latency determine freshness.
- CTA Train Tracker default daily limit is documented as 100,000 API transactions per key.
- Automated tests use mocked CTA payloads; a credentialed live-feed smoke test
  remains intentionally manual.
