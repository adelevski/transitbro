# transitbro architecture

The shared dashboard renders a small provider-neutral contract from `lib/transit.ts`:
vehicles, stations, lines and arrival boards. `lib/adapters.ts` declares supported
cities and their capabilities. Provider-specific parsing lives in `lib/cta.ts`,
`lib/ctaService.ts` and `lib/mbta.ts`; React presentation stays separate.

## Data path

1. Chicago uses same-origin server routes. One CTA `ttpositions` request covers
   all eight lines and is filtered after caching. A selected station uses the
   separate `ttarrivals` API; station queues are not inferred from next-stop data.
2. `lib/ctaService.ts` shares caches, in-flight promises and a request budget via
   a process-global object across Next route bundles. Legacy endpoints use it too.
3. Boston calls MBTA V3 directly in the browser, with no key or proxy. Vehicle
   and prediction requests include related trip/stop metadata. Eight small
   route-specific station requests build accurate line membership once per page
   session; successful metadata loads survive a retry of a failed route.
4. `lib/poll.ts` schedules the next fetch after completion. Abort on city/line/
   station change or unmount prevents late responses from restoring cleared data.
   Hidden pages pause polling; failures back off to 30, 60, then 120 seconds.
5. The UI clock updates countdowns independently of feed requests. Leaflet marker
   movement uses a one-second imperative transition without rendering all React
   elements at animation frame rate. It never extrapolates and respects reduced
   motion. New/stale/distant/out-of-order samples snap to their reported positions.

## Honest time and availability

CTA unzoned timestamps use `America/Chicago`, including day rollover. Invalid
calendar dates and nonexistent DST local times fail parsing. Explicitly zoned
instants remain absolute. The provider does not disambiguate the repeated hour
at the autumn DST transition; a timezone conversion cannot recover absent data.
Unknown report timestamps stay unknown instead of becoming request time.

`updatedAt` means provider time; `fetchedAt` means receipt time. A successful HTTP
response does not guarantee a recent observation. Each vehicle ages separately.
Reports older than 90 seconds fade, older than five minutes disappear. A failed
refresh keeps last-known positions visibly old; arrival countdowns are hidden
until a successful refresh. Unknown delay flags never mean on-time performance.

CTA `isSch` marks scheduled arrivals; `isFlt` marks uncertain estimates. MBTA V3
prediction responses do not expose a per-prediction timestamp, so the UI says
that report time is unavailable and shows time since retrieval separately.
Cancelled, skipped and no-data MBTA predictions are omitted. Empty feeds do not
prove that service has ended. Operator tracker/alert links remain available.

## Add a city only when it is useful and cheap

Add one `TransitAdapter` with explicit time zone, bounds/center, lines and loaders.
Normalize timestamps, nulls, coordinates, agency status and prediction provenance
at its boundary. Keep provider route/stop IDs as IDs; do not infer direction from
station names. Add deterministic examples for empty/error, stale, overnight and
malformed records. Verify official access terms, attribution, quota, CORS and
credentials with a real request before claiming coverage.

Prefer direct browser requests where official CORS and anonymous access permit.
Otherwise reuse the existing small server, with a bounded cache and budget; never
put a private key in the frontend. Add geometry or wider modes only after a
maintainable source and real rider need exist. No universal GTFS ingestion stack,
account system, database or streaming fanout is required by the current workload.

## Limits

CTA geometry/station snapshots are inherited GTFS-derived artifacts. Their exact
original download date is not recorded; they are context, not a claim about
current diversions or station access. Boston membership comes from current API
metadata but route geometry is absent. Train locations and arrivals are provider
estimates, not guaranteed GPS or exact arrival promises. Budgets and caches are
process-local; restarts reset them. See [operations](OPERATIONS.md).
