# transitbro handoff

## September 11, 2026 consolidation

Implemented the unified station board/map, kept all CTA rail lines and added
Boston's anonymous direct-browser subway/light-rail feeds. Motion now transitions
between observations only. Unknown, stale, delayed, scheduled and uncertain data
remain distinct. Canonical design and operations are in the linked source docs.

Validation: 24 deterministic tests, strict TypeScript and production build pass.
Live CTA smoke test at 18:14 UTC returned 79 vehicles across 8 lines and 9 station
arrivals; no keys or payloads were saved. MBTA anonymous CORS, vehicle/prediction
responses and station endpoint verified with live public requests. Browser Chicago/Boston city switching, live boards, named markers and empty line
selection verified. Public deployment verification is pending in this revision.

Original transitbro and traincountdown checkouts/remotes/backups remain preserved;
see [consolidation](CONSOLIDATION.md). No repository retirement is authorized.

Deployment uses the existing no-payment Hobby Render workspace and a Free Node
service; no service has been created by this implementation task yet. Main task
coordinates the canonical `snowball-projects/transitbro` transfer and deployment.
Do not call CTA publicly live until its runtime key and live public responses are
verified. Keep the private key in server environment only.
