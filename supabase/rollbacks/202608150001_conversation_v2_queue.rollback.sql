-- Manual rollback. Run only after disabling V2 shadow persistence and confirming no V2 jobs are active.
drop function if exists public.recover_channel_jobs_v2();
drop function if exists public.defer_channel_job_v2(uuid,uuid,timestamptz,text);
drop function if exists public.commit_conversation_v2_transition(uuid,uuid,uuid,integer,jsonb);
drop function if exists public.claim_channel_job_v2(text,uuid,uuid);
drop function if exists public.release_channel_lock_v2(text,uuid,uuid);
drop function if exists public.renew_channel_lock_v2(text,uuid,uuid,integer);
drop function if exists public.acquire_channel_lock_v2(text,uuid,uuid,integer);
drop index if exists public.channel_jobs_stale_processing_v2_idx;
drop index if exists public.channel_jobs_conversation_order_v2_idx;
alter table public.channel_conversation_locks drop column if exists acquired_at,drop column if exists owner_token;
alter table public.channel_message_jobs drop constraint if exists channel_message_jobs_queue_status_v2_check;
alter table public.channel_message_jobs drop column if exists state_revision,drop column if exists lease_expires_at,drop column if exists processing_started_at,drop column if exists owner_token,drop column if exists available_at,drop column if exists queue_status,drop column if exists conversation_key,drop column if exists conversation_id;
alter table public.conversations drop constraint if exists conversations_revision_v2_nonnegative;
alter table public.conversations drop column if exists conversation_revision_v2,drop column if exists conversation_state_v2;
