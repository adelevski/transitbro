# transitbro operations

Verified against official sources and public feed probes on September 11, 2026.

## Request and hosting budgets

| Resource        | Implemented policy                                                               | Practical limit                                                                        |
| --------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| CTA positions   | One batched all-line request, cache 20s, coalesce concurrent loads               | At most 4,320/day per continuously active process before request duration              |
| CTA arrivals    | Fetch only selected stations, cache 20s, browser refresh 30s                     | Additional traffic shares the same CTA request budget                                  |
| Combined CTA    | 20 upstream requests/minute and 25,000/day, including failures and legacy routes | Per process, UTC day; resets on restart, not an account-wide persistent cap            |
| Cached failure  | Cool down 30s; keep a last success up to 5min with `stale:true`                  | Beyond that, return a sanitized error                                                  |
| Cache memory    | One positions entry, at most 160 station entries                                 | No unbounded cache key growth or background polling                                    |
| MBTA            | 30s foreground vehicle/board polling; local clock needs no requests              | Anonymous limit observed at 20 requests/min/IP, shared with other tabs/users on the IP |
| Metadata        | CTA bundled snapshot; MBTA eight per-route station reads per page session        | Failed metadata retries retain already-loaded routes                                   |
| Browser failure | 15s request timeout, backoff 30/60/120s; no overlap                              | Hidden tabs pause requests, changes/unmount abort them                                 |
| Render Free     | One Node service, no databases or disks                                          | 750 hours/month shared by free services; sleeps after 15min inactivity                 |
| Render Hobby    | No payment method / credits in the verified workspace                            | 5GB monthly bandwidth, 500 build minutes; suspend at exhaustion                        |

CTA official pages disagree: the [overview](https://www.transitchicago.com/developers/traintracker/)
says 50,000 requests/day, while the [API docs](https://www.transitchicago.com/developers/ttdocs/)
say 100,000. Plan against 50,000. The local 25,000/day budget leaves headroom but
cannot control other applications using the same key or restarts. Keep one
instance and avoid reusing the key for other polling services. CTA itself can
rate-limit earlier; the UI fails clearly and no paid fallback is attempted.

Render's [current plans](https://render.com/docs/new-workspace-plans),
[free-service rules](https://render.com/docs/free) and
[bandwidth rules](https://render.com/docs/outbound-bandwidth) make no-payment
configuration essential. Adding a card can allow automatic overage billing.
Do not enable payments or upgrade to keep this project running. Free service
cold starts may take about a minute. Health checks are local and no external
keep-alive monitor is created. Stop or let the project sleep if allowances run out.

## Deployment and recovery

Use `render.yaml` and the commands in the canonical README. Set `CTA_API_KEY`
privately in the existing Render service environment; never in GitHub/public build
variables. Missing configuration returns 503, and Boston can still use its direct
feed once the page is served. Failed CTA requests return 502 after bounded stale
fallback; unsupported stations return 400. No raw provider errors reach clients.

After deploy, check `/api/health`, selected/all-line CTA positions and a station
board. Verify both cities in the browser, inspect provider report times, and
confirm the client bundle contains no private key. A build passing without a
credential is expected and does not prove live configuration. Revoke/rotate a
key if its confidentiality is ever in doubt; do not print it for troubleshooting.

There is no application database to back up. Preserve source history, lockfile,
configuration names and provider terms. To revive, verify current API terms and
hosting limits, reinstall locked dependencies, run `npm run check`, configure the
private key and deploy one free instance. Recheck static CTA data against current
GTFS before claiming geometry freshness. Source URLs and current provider IDs
remain canonical in their adapters.

## Data and attribution

- CTA [developer agreement](https://www.transitchicago.com/developers/traintrackerapply/)
  permits rider-facing uses/caching with reasonable freshness efforts. Retain
  “Data provided by Chicago Transit Authority”, do not imply affiliation, and do
  not relicense feeds or GTFS-derived artifacts as MIT.
- MBTA [V3 guidance](https://www.mbta.com/developers/v3-api) and
  [official schema](https://api-v3.mbta.com/docs/swagger/swagger.json) document the
  endpoint contract. The linked [MassDOT/MBTA agreement](https://cdn.mbta.com/sites/default/files/2023-08/mbta-massdot-develop-license-agreement.pdf)
  permits use and redistribution with acknowledgement; no agency logos or
  ownership/partnership claims. The application credits MassDOT / MBTA.
- The basemap uses the standard HTTPS OpenStreetMap tile endpoint, visible
  attribution, normal browser caching and Referer behavior. No offline downloads,
  bulk prefetch or proxy. Follow the [tile policy](https://operations.osmfoundation.org/policies/tiles/).
  If tiles are unavailable, train lists and arrival boards remain useful.
- The app has no analytics or user accounts. Hosting, MBTA and tile providers
  receive normal requests and IP addresses under their own policies. No geolocation
  permission, user movement history or personal data store is requested.

A GitHub Pages build could host the browser surface at no service cost, but CTA
would still require the private server. It is not the full-dashboard deployment
path for this release; keeping one verified Free Node service is simpler.
