# transitbro and traincountdown consolidation

Reviewed September 11, 2026. Existing name stays transitbro. The maintained public
source is `snowball-projects/transitbro`; the reviewed implementation is published
at [transitbro.onrender.com](https://transitbro.onrender.com/). This is an implementation merge of useful behavior, not authorization to
delete either source repository or any backup.

## Preserved sources

- `adelevski/transitbro` remote main `250939a93fc38be9f0e6c8e3b78109b493cd42dc`,
  including merged Windows motion experiments and earlier tags/history.
- Original local `/Users/adelevski/repos/transitbro` remains untouched at `f73a8e5`;
  its ignored private environment, dependencies and build output are preserved.
- `/Users/adelevski/repos/revival-lab-20260827/transitbro` is an independent clean
  preservation checkout at `f73a8e5`.
- `adelevski/traincountdown` master `c698de3d3fba02faadb36ab0cf0b3e27a6441e70`
  and its tags/history remain intact. Independent source checkout:
  `/Users/adelevski/repos/snowball/traincountdown-source`; original preservation
  checkout `/Users/adelevski/repos/revival-lab-20260827/traincountdown` remains.
- Implementation uses an isolated `/Users/adelevski/repos/snowball/transitbro`
  checkout on `feat/unified-transit-dashboard`. No original file was overwritten.

Older audit evidence remains in the collection's
`reports/2026-09-09-readonly/evidence/merge-forensics.md`. It identified actual
motion bugs; passing TypeScript/CI did not validate the physics.

## Keep and extract

| Source                                    | Concrete retained value                                                                | Implementation                                                                                               |
| ----------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| transitbro                                | Dark map, all 8 CTA lines, route/station overlays, filters, destination/run inspection | Retained dashboard visual language and data artifacts                                                        |
| traincountdown `chatgpt.py`               | Station arrival queues and next-train countdown                                        | Real `ttarrivals` adapter, selectable station, destination groups, full timestamps and local countdown clock |
| traincountdown `main.py`, QML             | Desktop clock experiment                                                               | Preserved in source history; no separate clock feature or unproven train image imported                      |
| Historical Python async/GUI/notebook work | Alternate polling and interface experiments                                            | Preserved in original repository; no distinct additional city/coverage implementation found                  |
| transitbro motion planner                 | Track projection/dwell experiment                                                      | Preserved in history; replaced in active source after reproduced correctness failures                        |

The old arrival prototype treated station names as directions, froze today's date,
added unexplained +/-20-second offsets, blocked the UI every second and failed
on an empty queue. None of those behaviors are ported. Provider destinations,
full dates, explicit schedule/estimate flags and abortable polling replace them.

The later motion planner could jump a train 1,111.95 metres to a station, remain
502.29 metres behind a new report and move an unchanged stationary train 7.32
metres in controlled reproductions. The new display interpolates only briefly
between recent reported positions and ends exactly at the new report. No implied
live GPS, inferred dwell or extrapolated speed is published.

No traincountdown Git history is merged into the new runtime. Its README records
historical credential exposure; those original private preservation copies stay
separate. No historical credential values or third-party image are republished.
Software MIT applies to original maintained source only; data terms stay separate.
