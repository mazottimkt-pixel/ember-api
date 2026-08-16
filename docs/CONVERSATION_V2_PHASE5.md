# Conversation V2 — Phase 5 queue and CAS

## Audit of the current runtime

The production source of inbound jobs is `channel_message_jobs`, created by `202607300002_whatsapp_channels.sql`. Its unique `(channel, external_message_id)` constraint is the existing WAMID idempotency boundary. The production lock source is `channel_conversation_locks`, acquired by `acquire_channel_lock` with a 60-second lease in the WhatsApp processor.

The current implementation has no durable deferred state or consumer, no owner token, no lease renewal, no ordering claim by `received_at`, and no compare-and-swap for conversation state. A failed lock acquisition returns `deferred` only to the caller while the persisted job remains `received`. Nothing in the current service polls that row later. Release is scoped by organization rather than by the acquiring owner, so it cannot prove ownership. The existing queue abstraction has the same gap.

Audit answers:

- `JOB_SOURCE_OF_TRUTH = channel_message_jobs`
- `LOCK_SOURCE_OF_TRUTH = channel_conversation_locks`
- `DEFERRED_RECOVERY_EXISTS = NO`
- `ORDERING_EXISTS = NO`
- `CAS_EXISTS = NO`
- `LEASE_RENEWAL_EXISTS = NO`

## Phase 5 design

`ConversationQueueEngineV2` is isolated from the legacy runtime. It serializes each conversation under an owner-token lease, while `drainAvailable` processes different conversation keys concurrently. Eligible jobs are ordered by `receivedAt`, then `createdAt`, then job id. PostgreSQL measurements compared 0, 250, 500, and 1000 ms: 0 ms exposed a 100 ms physical inversion, while 250 ms protected it without the additional latency of 500/1000 ms. The production candidate therefore uses 250 ms; ordering beyond available timestamps is not invented.

The engine uses at most three CAS attempts. Every conflict reloads the current state and invokes the transition again. Exhaustion moves the job to durable `deferred` with a future `availableAt`. Expired processing leases are also recovered to `deferred`. `lastProcessedEvent.externalMessageId` prevents a completed event from entering the reducer again.

The controlled repository commits state and job completion in one synchronous atomic operation. It is intentionally dependency-free and restart tests reuse the durable store instance with a new engine instance. It is a proof repository, not production storage.

## Required production persistence

Production needs the additive schema/RPC described in `CONVERSATION_V2_PHASE5_SCHEMA_PROPOSAL.sql`. The proposed storage is `conversations.context.conversationV2`; the RPC locks the conversation row, checks the expected JSON revision, writes the new state, and completes the claimed job in the same PostgreSQL transaction. Claiming and lease operations must also be owner-token guarded.

The proposal is documentation only. It has not been placed in `supabase/migrations`, applied to Supabase, or wired into the WhatsApp processor. Until it is reviewed and applied, production persistence, restart guarantees across Railway instances, and real shadow queue execution remain blocked.

## Invariants proved in controlled tests

1. `EVENT_PROCESSED_AT_MOST_ONCE`
2. `CONVERSATION_REVISION_MONOTONIC`
3. `SAME_CONVERSATION_SERIALIZED`
4. `DIFFERENT_CONVERSATIONS_PARALLEL`
5. `DEFERRED_EVENT_RECOVERABLE`
6. `STALE_PROCESSING_RECOVERABLE`
7. `CAS_PREVENTS_LOST_UPDATE`
8. `COMPLETED_JOB_NOT_REPROCESSED`
9. `CRASH_DOES_NOT_LOSE_EVENT`
10. `RESTART_SAFE`

No document, PDF, outbound, Graph API, legacy state, Railway, Meta, or production Supabase behavior is changed.
