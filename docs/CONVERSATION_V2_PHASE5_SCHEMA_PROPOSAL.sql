-- REVIEW-ONLY PROPOSAL. This file is not an applied Supabase migration.
-- All changes are additive, but must be reviewed against the live schema first.

alter table public.channel_message_jobs
  add column if not exists conversation_key text,
  add column if not exists queue_status text,
  add column if not exists available_at timestamptz,
  add column if not exists owner_token uuid,
  add column if not exists processing_started_at timestamptz,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists state_revision integer;

alter table public.channel_conversation_locks
  add column if not exists owner_token uuid,
  add column if not exists acquired_at timestamptz;

create index if not exists channel_jobs_conversation_order_v2_idx
  on public.channel_message_jobs(conversation_key, received_at, created_at, id)
  where processing_status in ('received','processing','failed');

-- Production implementation must expose service-role-only RPCs for:
-- 1. enqueue/deduplicate;
-- 2. claim earliest eligible job with FOR UPDATE SKIP LOCKED;
-- 3. acquire/renew/release by matching owner_token;
-- 4. atomically CAS conversations.context->conversationV2 revision and complete job;
-- 5. recover expired processing leases to deferred.
-- The CAS RPC must reject when:
--   current revision <> expected revision;
--   job owner_token <> caller owner_token;
--   lease has expired;
--   job is already completed.
-- Function bodies are deliberately omitted until the live schema audit and migration review.
