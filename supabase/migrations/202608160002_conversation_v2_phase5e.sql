-- Phase 5E: additive, pre-reducer shadow-attempt ledger on the shared inbound job.
alter table public.channel_message_jobs
  add column if not exists v2_shadow_attempted_at timestamptz,
  add column if not exists v2_shadow_outcome text,
  add column if not exists v2_shadow_outcome_code text,
  add column if not exists v2_shadow_outcome_at timestamptz,
  add column if not exists v2_shadow_evidence jsonb;

alter table public.channel_message_jobs
  add constraint channel_message_jobs_v2_shadow_outcome_check check (
    v2_shadow_outcome is null or v2_shadow_outcome in (
      'PROCESSED', 'REJECTED_WITH_REASON', 'DEFERRED', 'RECOVERABLE_FAILURE', 'TERMINAL_FAILURE'
    )
  );

create index if not exists channel_message_jobs_v2_shadow_attempt_outcome_idx
  on public.channel_message_jobs (v2_shadow_attempted_at, v2_shadow_outcome)
  where v2_shadow_attempted_at is not null;
