# transitbro

Live public transit dashboard for Chicago CTA rail, built to evolve in small iterations.

## Current scope (Iteration 4)
- Live CTA rail train positions for all lines (Train Tracker `ttpositions`):
  - `blue`, `red`, `brn`, `g`, `org`, `p`, `pink`, `y`.
- Dark-theme map dashboard with:
  - checkbox panel for line selection with none/one/some/all active,
  - map layer toggles for trains and stations,
  - live multi-line vehicle markers,
  - direction arrows rendered inside train markers,
  - train popup status badge (`On time` / `Late`),
  - continuous interpolation between samples with station-aware dwell pauses,
  - per-line route overlays from CTA GTFS shape data for all CTA rail lines,
  - collapsible run lists per selected line, grouped by destination,
  - next-stop ETA shown for each run,
  - CTA station markers with zoom-aware visibility:
    - terminal stations always visible,
    - intermediate stations shown only when zoomed in.
- Server-side CTA proxy route so API key is never exposed to the browser.

## Tech stack
- Next.js (App Router) + TypeScript
- React Leaflet + OpenStreetMap tiles
- CTA Train Tracker API (server-side fetch)

## Quick start
1. Install Node.js 20+.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create `.env.local` from `.env.example` and set `CTA_API_KEY`.
4. Run:
   ```bash
   npm run dev
   ```
5. Open `http://localhost:3000`.

## Environment variables
- `CTA_API_KEY` (required): your CTA Train Tracker API key.
- `CTA_TRAIN_POSITIONS_URL` (optional): override endpoint for tests.
- `CTA_POLL_INTERVAL_MS` (optional): polling interval in milliseconds.
  - Default: `5000`
  - Enforced bounds: `5000` to `60000`

## API route
- `GET /api/cta/blue-line`
- `GET /api/cta/red-line`
- `GET /api/cta/rail?lines=blue,red,brn,g,org,p,pink,y`
  - Returns normalized vehicles:
    - `id`, `line`, `runNumber`, `lat`, `lon`, `heading`, `destination`, `nextStop`, `nextStopArrivalAt`, `updatedAt`.
  - `lines` query can include one, several, or all supported line IDs.

## Important notes
- Polling every 5 seconds is reasonable for local development and single-user usage.
- CTA Train Tracker terms currently mention a default daily API transaction limit of 100,000 per API key, so total traffic across all clients should be monitored as usage grows.
- The app is intentionally modular and can be extended line-by-line.

## Project continuity
- [docs/ROADMAP.md](docs/ROADMAP.md)
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [docs/HANDOFF.md](docs/HANDOFF.md)
- [AGENTS.md](AGENTS.md)
