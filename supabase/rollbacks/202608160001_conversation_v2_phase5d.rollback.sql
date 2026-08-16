-- Manual rollback: disable both recovery runners before use.
drop function if exists public.claim_channel_job_legacy(uuid,text,uuid,uuid,integer);
drop function if exists public.release_channel_job_legacy(uuid,text,uuid,uuid);
drop function if exists public.recover_channel_jobs_legacy();
drop index if exists public.channel_jobs_legacy_work_idx;
drop index if exists public.channel_jobs_v2_eligible_work_idx;
-- Columns are intentionally retained to keep rollback non-destructive.
