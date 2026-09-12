# transitbro and traincountdown consolidation

Reviewed September 11, 2026. Existing name stays transitbro. The maintained public
source is `snowball-projects/transitbro`; the reviewed implementation is published
at [transitbro.onrender.com](https://transitbro.onrender.com/). The transitbro
repository was transferred to snowball with its history intact. After the
implementation merge and a separate preservation review, the owner approved
traincountdown's GitHub deletion; its absence was verified on September 11, 2026.

## Preserved sources

- The reviewed transitbro main was `250939a93fc38be9f0e6c8e3b78109b493cd42dc`,
  including merged Windows motion experiments and earlier tags/history. That
  repository continues as `snowball-projects/transitbro`.
- The original transitbro checkout and independent preservation copy at `f73a8e5`
  were moved into the private preservation archive during the later authorized
  local cleanup. Retained source, Git history and private inputs were verified;
  regenerable dependencies and build output were excluded.
- The reviewed traincountdown master was
  `c698de3d3fba02faadb36ab0cf0b3e27a6441e70`. Its source copies and history are
  retained in the private preservation archive; the old local checkout folders
  were removed after verification. The private archive index owns restore paths.
- Implementation was developed in an isolated checkout and merged through PR #1.
  Historical source files were preserved separately from the maintained runtime.

Older audit evidence remains in the collection's
`reports/2026-09-09-readonly/evidence/merge-forensics.md`. It identified actual
motion bugs; passing TypeScript/CI did not validate the physics.

## Keep and extract

| Source                                    | Concrete retained value                                                                | Implementation                                                                                               |
| ----------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| transitbro                                | Dark map, all 8 CTA lines, route/station overlays, filters, destination/run inspection | Retained dashboard visual language and data artifacts                                                        |
| traincountdown `chatgpt.py`               | Station arrival queues and next-train countdown                                        | Real `ttarrivals` adapter, selectable station, destination groups, full timestamps and local countdown clock |
| traincountdown `main.py`, QML             | Desktop clock experiment                                                               | Preserved in source history; no separate clock feature or unproven train image imported                      |
| Historical Python async/GUI/notebook work | Alternate polling and interface experiments                                            | Preserved in private source archives; no distinct additional city/coverage implementation found              |
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
