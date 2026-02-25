# transitbro roadmap

## Principles
- Ship working slices quickly.
- Keep real-time accuracy high by using official CTA feeds and short polling/SSE.
- Preserve clean handoff state between sessions.

## Phase 0: Foundation (done)
- Project skeleton.
- CTA Blue Line server proxy.
- Minimal live map dashboard.
- Continuity docs (`ARCHITECTURE`, `HANDOFF`, `ROADMAP`, `AGENTS`).

## Phase 1: Better Blue Line (in progress)
- Done:
  - Smoother marker motion interpolation between samples.
  - Route geometry overlay (Blue Line track shape).
  - Collapsible run list panel and refined dark-theme layout.
- Next:
  - Train list filters/sort and map highlight linking.
  - API response validation and retry/backoff policy.

## Phase 2: Expand rail coverage
- In progress:
  - Shared rail feed service and per-route filtering.
  - Blue + Red line support with checkbox-based one/some/all selection.
  - Full CTA rail line set added to dashboard selection (`blue`, `red`, `brn`, `g`, `org`, `p`, `pink`, `y`).
- Next:
  - Real-time arrival context from station APIs.
  - Add server-side retry/backoff + telemetry for CTA upstream errors.

## Phase 3: Add buses
- Integrate CTA Bus Tracker positions.
- Efficient spatial rendering for high marker counts.
- Cluster/declutter strategy by zoom level.

## Phase 4: Real-time infrastructure upgrade
- Replace client polling with server fanout (SSE/WebSocket).
- Add in-memory cache layer (Redis optional) to reduce upstream pressure.
- Health checks and observability dashboards.

## Phase 5: Productization
- Authentication for user-specific dashboards.
- Saved views and custom alerts.
- Deploy pipeline + uptime/latency SLOs.
