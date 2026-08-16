-- Conversation V2 Phase 5D: one durable inbound job with isolated legacy and V2 stages.
alter table public.channel_message_jobs add column if not exists legacy_queue_status text;
alter table public.channel_message_jobs add column if not exists legacy_available_at timestamptz;
alter table public.channel_message_jobs add column if not exists legacy_owner_token uuid;
alter table public.channel_message_jobs add column if not exists legacy_lease_expires_at timestamptz;
alter table public.channel_message_jobs add column if not exists v2_eligible boolean not null default false;
alter table public.channel_message_jobs add column if not exists v2_eligible_at timestamptz;

do $$ begin
  if not exists(select 1 from pg_constraint where conname='channel_message_jobs_legacy_queue_status_check') then
    alter table public.channel_message_jobs add constraint channel_message_jobs_legacy_queue_status_check
      check(legacy_queue_status is null or legacy_queue_status in ('received','processing','deferred','completed','failed_recoverable','failed_terminal'));
  end if;
end $$;

create index if not exists channel_jobs_legacy_work_idx
  on public.channel_message_jobs(organization_id,legacy_available_at,received_at,created_at,id)
  where legacy_queue_status in ('received','deferred','failed_recoverable');
create index if not exists channel_jobs_v2_eligible_work_idx
  on public.channel_message_jobs(conversation_key,available_at,received_at,created_at,id)
  where v2_eligible=true and queue_status in ('received','ready','deferred','failed_recoverable');

create or replace function public.claim_channel_job_legacy(p_job_id uuid,p_lock_key text,p_organization_id uuid,p_owner_token uuid,p_lease_seconds integer default 60)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_claimed integer;
begin
  perform 1 from public.channel_message_jobs where id=p_job_id and organization_id=p_organization_id
    and legacy_queue_status in ('received','deferred','failed_recoverable') and coalesce(legacy_available_at,received_at,created_at)<=now() for update;
  if not found then return false; end if;
  insert into public.channel_conversation_locks(lock_key,organization_id,lease_until,owner_token,acquired_at)
  values(p_lock_key,p_organization_id,now()+make_interval(secs=>least(greatest(p_lease_seconds,5),120)),p_owner_token,now())
  on conflict(lock_key) do update set organization_id=excluded.organization_id,lease_until=excluded.lease_until,owner_token=excluded.owner_token,acquired_at=excluded.acquired_at
  where channel_conversation_locks.lease_until<now() or channel_conversation_locks.owner_token=p_owner_token;
  get diagnostics v_claimed=row_count;
  if v_claimed=0 then
    update public.channel_message_jobs set legacy_queue_status='deferred',legacy_available_at=now()+interval '250 milliseconds'
    where id=p_job_id and organization_id=p_organization_id;
    return false;
  end if;
  update public.channel_message_jobs set legacy_queue_status='processing',legacy_owner_token=p_owner_token,
    legacy_lease_expires_at=now()+make_interval(secs=>least(greatest(p_lease_seconds,5),120)),processing_status='processing',attempts=attempts+1
  where id=p_job_id and organization_id=p_organization_id;
  return true;
end $$;

create or replace function public.release_channel_job_legacy(p_job_id uuid,p_lock_key text,p_organization_id uuid,p_owner_token uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_released integer;
begin
  delete from public.channel_conversation_locks where lock_key=p_lock_key and organization_id=p_organization_id and owner_token=p_owner_token;
  get diagnostics v_released=row_count;
  update public.channel_message_jobs set legacy_owner_token=null,legacy_lease_expires_at=null
  where id=p_job_id and organization_id=p_organization_id and legacy_owner_token=p_owner_token;
  return v_released>0;
end $$;

create or replace function public.recover_channel_jobs_legacy()
returns integer language plpgsql security definer set search_path=public as $$
declare v_count integer;
begin
  update public.channel_message_jobs set legacy_queue_status='deferred',legacy_available_at=now(),legacy_owner_token=null,legacy_lease_expires_at=null,
    error_code='STALE_LEGACY_PROCESSING_RECOVERED'
  where legacy_queue_status='processing' and legacy_lease_expires_at<now();
  get diagnostics v_count=row_count; return v_count;
end $$;

create or replace function public.claim_channel_job_v2(p_conversation_key text,p_organization_id uuid,p_owner_token uuid)
returns setof public.channel_message_jobs language plpgsql security definer set search_path=public as $$
declare v_job public.channel_message_jobs;
begin
  if not exists(select 1 from public.channel_conversation_locks where lock_key=p_conversation_key and organization_id=p_organization_id and owner_token=p_owner_token and lease_until>=now()) then return; end if;
  select * into v_job from public.channel_message_jobs
  where organization_id=p_organization_id and v2_eligible=true and conversation_id is not null and conversation_key=p_conversation_key
    and queue_status in ('received','ready','deferred','failed_recoverable') and available_at<=now()
  order by received_at,created_at,id for update skip locked limit 1;
  if not found then return; end if;
  update public.channel_message_jobs set queue_status='processing',attempts=attempts+1,processing_started_at=now(),owner_token=p_owner_token,
    lease_expires_at=(select lease_until from public.channel_conversation_locks where lock_key=p_conversation_key)
  where id=v_job.id returning * into v_job;
  return next v_job;
end $$;

create or replace function public.recover_channel_jobs_v2()
returns integer language plpgsql security definer set search_path=public as $$
declare v_count integer;
begin
  update public.channel_message_jobs set queue_status='deferred',available_at=now(),owner_token=null,lease_expires_at=null,error_code='STALE_PROCESSING_RECOVERED'
  where v2_eligible=true and conversation_id is not null and queue_status='processing' and lease_expires_at<now();
  get diagnostics v_count=row_count; return v_count;
end $$;

create or replace function public.commit_conversation_v2_transition(p_conversation_id uuid,p_job_id uuid,p_owner_token uuid,p_expected_revision integer,p_next_state jsonb)
returns text language plpgsql security definer set search_path=public as $$
declare v_context jsonb;v_revision integer;v_job public.channel_message_jobs;v_next_revision integer;
begin
  select conversation_state_v2,conversation_revision_v2 into v_context,v_revision from public.conversations where id=p_conversation_id for update;
  if not found then return 'conversation_not_found'; end if;
  select * into v_job from public.channel_message_jobs where id=p_job_id for update;
  if not found then return 'job_not_found'; end if;
  if v_job.queue_status='completed' then return 'already_completed'; end if;
  if v_job.v2_eligible is distinct from true then return 'job_not_v2_eligible'; end if;
  if v_job.owner_token is distinct from p_owner_token or v_job.lease_expires_at<now() then return 'lease_lost'; end if;
  if v_revision<>p_expected_revision then return 'cas_conflict'; end if;
  v_next_revision=coalesce((p_next_state->>'revision')::integer,-1);
  if v_next_revision<p_expected_revision or v_next_revision>p_expected_revision+1 then return 'revision_non_monotonic'; end if;
  if (v_context-'lastProcessedEvent'-'metadata'-'revision') is distinct from (p_next_state-'lastProcessedEvent'-'metadata'-'revision')
     and v_next_revision<>p_expected_revision+1 then return 'revision_not_advanced'; end if;
  update public.conversations set conversation_state_v2=p_next_state,conversation_revision_v2=v_next_revision,updated_at=now() where id=p_conversation_id;
  update public.channel_message_jobs set queue_status='completed',processed_at=now(),state_revision=v_next_revision,owner_token=null,lease_expires_at=null,error_code=null where id=p_job_id;
  return 'committed';
end $$;

revoke all on function public.claim_channel_job_legacy(uuid,text,uuid,uuid,integer),public.release_channel_job_legacy(uuid,text,uuid,uuid),public.recover_channel_jobs_legacy() from public,anon,authenticated;
grant execute on function public.claim_channel_job_legacy(uuid,text,uuid,uuid,integer),public.release_channel_job_legacy(uuid,text,uuid,uuid),public.recover_channel_jobs_legacy() to service_role;
