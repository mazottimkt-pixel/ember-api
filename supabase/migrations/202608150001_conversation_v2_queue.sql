-- Conversation V2 Phase 5B: additive durable queue, owner leases and atomic CAS.
alter table public.conversations add column if not exists conversation_state_v2 jsonb;
alter table public.conversations add column if not exists conversation_revision_v2 integer not null default 0;
do $$ begin
  if not exists(select 1 from pg_constraint where conname='conversations_revision_v2_nonnegative') then
    alter table public.conversations add constraint conversations_revision_v2_nonnegative check(conversation_revision_v2>=0) not valid;
  end if;
end $$;
alter table public.channel_message_jobs add column if not exists conversation_id uuid references public.conversations(id);
alter table public.channel_message_jobs add column if not exists conversation_key text;
alter table public.channel_message_jobs add column if not exists queue_status text;
alter table public.channel_message_jobs add column if not exists available_at timestamptz;
alter table public.channel_message_jobs add column if not exists owner_token uuid;
alter table public.channel_message_jobs add column if not exists processing_started_at timestamptz;
alter table public.channel_message_jobs add column if not exists lease_expires_at timestamptz;
alter table public.channel_message_jobs add column if not exists state_revision integer;

update public.channel_message_jobs set
  conversation_key=coalesce(conversation_key,organization_id::text||':'||coalesce(external_conversation_id,external_message_id)),
  queue_status=coalesce(queue_status,case processing_status when 'responded' then 'completed' when 'failed' then 'failed_recoverable' when 'processing' then 'processing' else 'received' end),
  available_at=coalesce(available_at,received_at,created_at)
where conversation_key is null or queue_status is null or available_at is null;

alter table public.channel_message_jobs alter column queue_status set default 'received';
alter table public.channel_message_jobs alter column available_at set default now();

do $$ begin
  if not exists(select 1 from pg_constraint where conname='channel_message_jobs_queue_status_v2_check') then
    alter table public.channel_message_jobs add constraint channel_message_jobs_queue_status_v2_check
      check(queue_status is null or queue_status in ('received','ready','processing','deferred','completed','failed_recoverable','failed_terminal'));
  end if;
end $$;

alter table public.channel_conversation_locks add column if not exists owner_token uuid;
alter table public.channel_conversation_locks add column if not exists acquired_at timestamptz;

create index if not exists channel_jobs_conversation_order_v2_idx
  on public.channel_message_jobs(conversation_key,received_at,created_at,id)
  where queue_status in ('received','ready','deferred','failed_recoverable');
create index if not exists channel_jobs_stale_processing_v2_idx
  on public.channel_message_jobs(lease_expires_at)
  where queue_status='processing';

create or replace function public.acquire_channel_lock_v2(p_lock_key text,p_organization_id uuid,p_owner_token uuid,p_lease_seconds integer default 60)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  insert into public.channel_conversation_locks(lock_key,organization_id,lease_until,owner_token,acquired_at)
  values(p_lock_key,p_organization_id,now()+make_interval(secs=>least(greatest(p_lease_seconds,5),120)),p_owner_token,now())
  on conflict(lock_key) do update set organization_id=excluded.organization_id,lease_until=excluded.lease_until,owner_token=excluded.owner_token,acquired_at=excluded.acquired_at
  where channel_conversation_locks.lease_until<now() or channel_conversation_locks.owner_token=p_owner_token;
  return found;
end $$;

create or replace function public.renew_channel_lock_v2(p_lock_key text,p_organization_id uuid,p_owner_token uuid,p_lease_seconds integer default 60)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  update public.channel_conversation_locks set lease_until=now()+make_interval(secs=>least(greatest(p_lease_seconds,5),120))
  where lock_key=p_lock_key and organization_id=p_organization_id and owner_token=p_owner_token and lease_until>=now();
  return found;
end $$;

create or replace function public.release_channel_lock_v2(p_lock_key text,p_organization_id uuid,p_owner_token uuid)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  delete from public.channel_conversation_locks where lock_key=p_lock_key and organization_id=p_organization_id and owner_token=p_owner_token;
  return found;
end $$;

create or replace function public.claim_channel_job_v2(p_conversation_key text,p_organization_id uuid,p_owner_token uuid)
returns setof public.channel_message_jobs language plpgsql security definer set search_path=public as $$
declare v_job public.channel_message_jobs;
begin
  if not exists(select 1 from public.channel_conversation_locks where lock_key=p_conversation_key and organization_id=p_organization_id and owner_token=p_owner_token and lease_until>=now()) then return; end if;
  select * into v_job from public.channel_message_jobs
  where organization_id=p_organization_id and conversation_key=p_conversation_key
    and queue_status in ('received','ready','deferred','failed_recoverable') and available_at<=now()
  order by received_at,created_at,id for update skip locked limit 1;
  if not found then return; end if;
  update public.channel_message_jobs set queue_status='processing',attempts=attempts+1,processing_started_at=now(),owner_token=p_owner_token,
    lease_expires_at=(select lease_until from public.channel_conversation_locks where lock_key=p_conversation_key)
  where id=v_job.id returning * into v_job;
  return next v_job;
end $$;

create or replace function public.commit_conversation_v2_transition(p_conversation_id uuid,p_job_id uuid,p_owner_token uuid,p_expected_revision integer,p_next_state jsonb)
returns text language plpgsql security definer set search_path=public as $$
declare v_context jsonb;v_revision integer;v_job public.channel_message_jobs;
begin
  select conversation_state_v2 into v_context from public.conversations where id=p_conversation_id for update;
  if not found then return 'conversation_not_found'; end if;
  select * into v_job from public.channel_message_jobs where id=p_job_id for update;
  if not found then return 'job_not_found'; end if;
  if v_job.queue_status='completed' then return 'already_completed'; end if;
  if v_job.owner_token is distinct from p_owner_token or v_job.lease_expires_at<now() then return 'lease_lost'; end if;
  select conversation_revision_v2 into v_revision from public.conversations where id=p_conversation_id;
  if v_revision<>p_expected_revision then return 'cas_conflict'; end if;
  if coalesce((p_next_state->>'revision')::integer,-1)<p_expected_revision then return 'revision_regression'; end if;
  update public.conversations set conversation_state_v2=p_next_state,conversation_revision_v2=(p_next_state->>'revision')::integer,updated_at=now() where id=p_conversation_id;
  update public.channel_message_jobs set queue_status='completed',processed_at=now(),state_revision=(p_next_state->>'revision')::integer,owner_token=null,lease_expires_at=null,error_code=null where id=p_job_id;
  return 'committed';
end $$;

create or replace function public.defer_channel_job_v2(p_job_id uuid,p_owner_token uuid,p_available_at timestamptz,p_error_code text)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  update public.channel_message_jobs set queue_status='deferred',available_at=p_available_at,error_code=left(p_error_code,80),owner_token=null,lease_expires_at=null
  where id=p_job_id and owner_token=p_owner_token and queue_status='processing';return found;
end $$;

create or replace function public.recover_channel_jobs_v2()
returns integer language plpgsql security definer set search_path=public as $$
declare v_count integer;
begin
  update public.channel_message_jobs set queue_status='deferred',available_at=now(),owner_token=null,lease_expires_at=null,error_code='STALE_PROCESSING_RECOVERED'
  where queue_status='processing' and lease_expires_at<now();get diagnostics v_count=row_count;return v_count;
end $$;

revoke all on function public.acquire_channel_lock_v2(text,uuid,uuid,integer) from public,anon,authenticated;
revoke all on function public.renew_channel_lock_v2(text,uuid,uuid,integer) from public,anon,authenticated;
revoke all on function public.release_channel_lock_v2(text,uuid,uuid) from public,anon,authenticated;
revoke all on function public.claim_channel_job_v2(text,uuid,uuid) from public,anon,authenticated;
revoke all on function public.commit_conversation_v2_transition(uuid,uuid,uuid,integer,jsonb) from public,anon,authenticated;
revoke all on function public.defer_channel_job_v2(uuid,uuid,timestamptz,text) from public,anon,authenticated;
revoke all on function public.recover_channel_jobs_v2() from public,anon,authenticated;
grant execute on function public.acquire_channel_lock_v2(text,uuid,uuid,integer),public.renew_channel_lock_v2(text,uuid,uuid,integer),public.release_channel_lock_v2(text,uuid,uuid),public.claim_channel_job_v2(text,uuid,uuid),public.commit_conversation_v2_transition(uuid,uuid,uuid,integer,jsonb),public.defer_channel_job_v2(uuid,uuid,timestamptz,text),public.recover_channel_jobs_v2() to service_role;
