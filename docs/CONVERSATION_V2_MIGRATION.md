# Conversation V2 migration

## Current phase: foundation shadow

The legacy runtime remains authoritative. When `LUME_CONVERSATION_V2_SHADOW=true`, the same inbound is mapped and reduced in memory after the legacy decision. The shadow result is compared and logged with `sideEffects: false`; it is never persisted or rendered.

Default is `false`. Railway and `.env.local` are unchanged.

## Legacy mapper classifications

- `VALID`: already canonical input (reserved for future direct V2 persistence).
- `MIGRATABLE`: coherent legacy context mapped without choosing between conflicts.
- `CONFLICTING`: two legacy structures disagree.
- `STALE`: context older than the migration window.
- `CORRUPTED_RECOVERABLE`: structurally valid but semantically incomplete.
- `CORRUPTED_FATAL`: draft cannot be parsed safely.

Detected conflicts include interaction, party, items versus hybrid entities, summary versus draft, and document checkpoint status.

## Incremental continuation

1. Collect shadow divergences with no effects.
2. Add an ordered queue and revision compare-and-swap.
3. Move document/PDF/delivery execution behind effect requests.
4. Make renderer consume only V2 state.
5. Migrate one commercial interaction at a time.
6. Retire legacy parallel truths only after runtime-equivalent tests and an internal pilot.

Rollback during foundation is simply disabling the single shadow flag; production behavior does not depend on V2.
