# AGENTS: transitbro collaboration guide

## Mission
Build `transitbro` incrementally into a high-fidelity live transit dashboard, starting with CTA Blue Line.

## Non-negotiables
- Keep secrets server-side only (`CTA_API_KEY` must never reach client code).
- Prefer small, production-viable increments over large rewrites.
- Update `docs/HANDOFF.md` after meaningful milestones.
- Preserve backward compatibility for existing API response fields unless intentionally versioned.

## Working protocol
1. Read `README.md`, `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, `docs/HANDOFF.md`.
2. Complete one scoped iteration end-to-end (code + docs).
3. Run verification steps and record what was not verified.
4. Append current status and next task to `docs/HANDOFF.md`.

## Code standards
- TypeScript strict mode.
- Keep feed normalization logic in `lib/`.
- Keep external API calls in server routes or server-only modules.
- Add lightweight comments only where logic is non-obvious.

## Near-term priorities
1. Improve animation quality and route context for Blue Line.
2. Add robust error handling/retry/telemetry.
3. Expand to all CTA rail lines.
4. Add bus positions and scalability optimizations.
