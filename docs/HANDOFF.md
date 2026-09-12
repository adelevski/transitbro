# transitbro handoff

## v0.2.0 · September 11, 2026

Live dashboard: [transitbro.onrender.com](https://transitbro.onrender.com/).
Canonical source: [snowball-projects/transitbro](https://github.com/snowball-projects/transitbro).
The original repository identity, history and release tags were preserved in the
transfer to snowball. [PR #1](https://github.com/snowball-projects/transitbro/pull/1)
merged the independently reviewed implementation; PR and main CI passed.

Implemented the unified station board/map, kept all CTA rail lines and added
Boston's anonymous direct-browser subway/light-rail feeds. Motion transitions
between observations only. Unknown, stale, delayed, scheduled and uncertain data
remain distinct. The owner subsequently approved traincountdown's GitHub
retirement and verified local cleanup on September 11, 2026. Original source
and history are retained in private preservation archives; see
[consolidation](CONSOLIDATION.md) for the current record.

### Verified deployment

- Application revision: `7f57b2f16da142c3ee9fb74416404d7985f8f856`.
- Render service: `transitbro`, `srv-dai6jknqj5pc73ej5nv0`, Free, Ohio.
- Initial successful deployment: `dep-dai6jkvqj5pc73ej5phg`, confirmed live at
  20:52:30 UTC on September 11, 2026.
- Public Git source on `main`; automatic deploys **Off**. Use reviewed manual
  deployments. The v0.2.0 follow-up changes documentation, version metadata and
  declarative hosting settings only; application behavior is unchanged.
- Node.js 24.14.0; health endpoint `/api/health` returns 200.
- The approved CTA key is configured only in the private runtime environment.
  No key appears in source, release notes or public configuration.

Release validation: 24 deterministic tests, strict TypeScript and production
build; live CTA/MBTA checks; desktop and 390px mobile review, city switching,
named markers and empty line selection. Public verification returned 101 CTA
vehicles across all eight lines and 20 arrivals at station 40380 with fresh
report times and `stale:false`. Browser checks showed Chicago positions/arrivals
and Boston Red Line positions with Park Street arrival groups. These counts are
verification snapshots, not promised service levels.

The deployed HTML and 18 fetched static files contained no occurrence of the
configured CTA key. Root and health URLs were also independently confirmed with
HTTP 200 after deployment.

The existing Hobby workspace had no payment method or credits when verified.
Free service cold starts and shared monthly quotas remain material limits; see
[operations](OPERATIONS.md). No paid fallback or keep-alive job is configured.

Next maintenance work is to verify and reproducibly regenerate inherited CTA
GTFS geometry/station snapshots. Boston route geometry and in-page alerts remain
future work, not current coverage.
