# Conversation V2 — Phase 5D shadow gate

## Queue ownership

- `LEGACY_QUEUE`: `channel_message_jobs.legacy_queue_status`, recovered by the legacy inbound runner.
- `V2_QUEUE`: the V2 stage on the same row, enabled only by `v2_eligible=true` and represented by `queue_status`.
- `SHARED_JOB`: yes. One inbound WAMID creates one `channel_message_jobs` row.
- `COMPETING_CLAIMS`: no. Legacy and V2 have separate stage status, owner and lease fields; V2 eligibility is set only after the legacy turn reaches the shadow checkpoint.

The legacy lock claim atomically changes `received/deferred/failed_recoverable` to `processing`. Lock contention persists the same row as `deferred`; the 15-second runner retries it in `received_at, created_at, id` order. A process restart or a second runner cannot claim the same stage concurrently.

## V2 eligibility and bootstrap

Historical jobs have `v2_eligible=false` and are excluded from V2 claim, listing and stale recovery. A real shadow checkpoint sets `v2_eligible=true`, `conversation_id` and `conversation_key` on the existing job.

If the conversation has no `conversation_state_v2`, the legacy mapper creates revision `0` once. Subsequent turns load the persisted V2 state. The queue transition uses the same inbound interpreter and reducer as the in-memory shadow. A material transition must advance exactly `N → N+1`; both the TypeScript boundary and PostgreSQL CAS function reject non-monotonic state.

## Expected input and oracle

Legacy-only names are normalized before schema validation. `price_scope` maps to the existing canonical `item_bundle`; `document_selection` maps to `free_text`. The V2 enum is not widened.

Shadow telemetry records interpretations, state deltas, next actions, active interaction, category and expected-behavior source. Classification priority is deterministic invariant, catalog transcript, structural validation, then manual review. No LLM is an authority for the oracle.
