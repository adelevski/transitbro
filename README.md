# transitbro

[Open the live dashboard](https://transitbro.onrender.com/)

A snowball transit dashboard for Chicago CTA and Boston MBTA. It combines
transitbro's dark rail map with traincountdown's useful station-arrival board.

- Chicago: all eight CTA rail lines, train reports, route/station map and
  selectable station arrivals grouped by destination.
- Boston: Red, Orange, Blue, Green B/C/D/E and Mattapan vehicle reports and
  station predictions from the official MBTA V3 API. Station membership is loaded
  per route; Boston route geometry is not currently drawn.
- Countdown clocks run locally. Estimated and scheduled arrivals are distinct;
  uncertain CTA predictions and missing report times are identified.
- Positions fade after 90 seconds and disappear after five minutes. Brief marker
  transitions end at the latest reported position; no future motion is invented.
- Keyboard station selection and train lists, named markers, responsive layout,
  stable status announcements and reduced-motion support.

No accounts, advertising, analytics, database or paid APIs. Provider and hosting
limits still apply. This independent project is not affiliated with the agencies.

## Run locally

Use Node.js 22 or newer:

```sh
npm ci
cp .env.example .env.local
# Put your existing CTA Train Tracker key in .env.local.
npm run dev
```

Open `http://localhost:3000`. The CTA key stays in server code. Never prefix it
with `NEXT_PUBLIC_`, commit it or put it in a frontend hosting variable. Boston
uses anonymous browser requests and works without a CTA key. Without that key,
Chicago's map remains available and its live feeds clearly fail.

`npm run check` runs deterministic fixtures, strict TypeScript and the production
build. Tests do not need a key or external feed. `npm run build` and
`npm run start` run the production server.

## Deployment and zero-cost operation

The full dashboard is a standard Next.js Node server. GitHub Pages alone cannot
serve CTA: CTA requires a private key and its endpoints do not allow browser CORS.
Use one **Free** Render web service with `render.yaml`, or the same Node commands
on an existing no-cost host. There is no database, persistent disk or scheduled job.

- Repository: `snowball-projects/transitbro`, public Git connection on `main`.
- Hosting: one Free Render service in Ohio. Automatic deploys are **Off**; deploy
  reviewed, passing revisions manually. `render.yaml` records these settings.
- Build: `npm ci && npm run build`.
- Start: `npm run start -- --hostname 0.0.0.0 --port $PORT`.
- Environment: `CTA_API_KEY` as a private runtime secret, `NODE_VERSION=24.14.0`.
  Leave `CTA_TRAIN_POSITIONS_URL` unset in production.
- Health check: `/api/health`. It does not fetch upstream data or prevent sleep.
- Keep one process/instance and the Free service plan. Do not attach a payment
  method, enable paid overages or purchase capacity for this project.

The existing Render workspace was verified on September 11, 2026 as Hobby with
no payment method and no credits. That account configuration is what makes
allowance exhaustion suspend service rather than bill. Reverify it when moving
or reviving the service. Free service sleep can add about a minute to first load;
shared workspace hours/bandwidth can make the whole service unavailable. See
[operations and costs](docs/OPERATIONS.md) for exact limits and recovery.

The public dashboard and both city feeds were verified on September 11, 2026.
[Handoff](docs/HANDOFF.md) records the deployed application revision and checks.

## Configuration and API

- `CTA_API_KEY`: required only for CTA live data; server only.
- `CTA_POLL_INTERVAL_MS`: optional advertised interval, bounded to 20–60 seconds.
  Shared positions refresh at most every 20 seconds; browser default is 20 seconds.
- `CTA_TRAIN_POSITIONS_URL`: testing override only.

The existing `/api/cta/blue-line`, `/api/cta/red-line` and
`/api/cta/rail?lines=blue,red` endpoints remain. `lines=` is idle. New:
`/api/cta/arrivals?station=40670`. Public errors never include upstream URLs or keys.
Existing vehicle fields remain; unknown `isDelayed` is now `null`, unknown
`updatedAt` is an empty string, and new `fetchedAt`/`stale` fields separate receipt
from provider freshness. Consumers must handle those honest unknown values.

## Continuity and rights

- [Architecture and adding cities](docs/ARCHITECTURE.md)
- [Operating limits and sources](docs/OPERATIONS.md)
- [Extraction and preservation](docs/CONSOLIDATION.md)
- [Roadmap](docs/ROADMAP.md) · [Handoff](docs/HANDOFF.md)

Original software and documentation use [MIT](LICENSE); existing copyright
notices are preserved. CTA feeds and inherited GTFS-derived paths/stations,
MassDOT/MBTA data, OpenStreetMap tiles and dependencies retain their own terms.
Data provided by Chicago Transit Authority and MassDOT / MBTA. The map includes
OpenStreetMap attribution. Provider logos and traincountdown's unproven image
are not republished. See [data terms](docs/OPERATIONS.md#data-and-attribution).
