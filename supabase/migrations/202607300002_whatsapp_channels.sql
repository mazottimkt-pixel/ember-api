create table public.whatsapp_channels(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  phone_number_id text not null unique,
  business_account_id text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.messages add column if not exists delivery_status text check(delivery_status in ('sent','delivered','read','failed','deleted'));
alter table public.messages add column if not exists delivery_status_updated_at timestamptz;

create table public.channel_message_jobs(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  channel text not null check(channel in ('agent-lab','whatsapp')),
  external_message_id text not null,
  external_conversation_id text,
  kind text not null check(kind in ('text','audio','button','document','status')),
  normalized_payload jsonb not null,
  processing_status text not null default 'received' check(processing_status in ('received','processing','responded','failed')),
  error_code text,
  attempts integer not null default 0,
  received_at timestamptz not null,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(channel,external_message_id)
);

create table public.channel_conversation_locks(
  lock_key text primary key,
  organization_id uuid not null references public.organizations(id),
  lease_until timestamptz not null,
  created_at timestamptz not null default now()
);

create index channel_jobs_org_status_idx on public.channel_message_jobs(organization_id,processing_status,created_at);
create index whatsapp_channels_org_idx on public.whatsapp_channels(organization_id) where active;
alter table public.whatsapp_channels enable row level security;
alter table public.channel_message_jobs enable row level security;
alter table public.channel_conversation_locks enable row level security;

create policy whatsapp_channels_select on public.whatsapp_channels for select using(public.is_org_member(organization_id));
create policy whatsapp_channels_manage on public.whatsapp_channels for all using(public.has_org_role(organization_id,array['owner','admin']::public.member_role[])) with check(public.has_org_role(organization_id,array['owner','admin']::public.member_role[]));
create policy channel_jobs_select on public.channel_message_jobs for select using(public.is_org_member(organization_id));
create policy channel_locks_select on public.channel_conversation_locks for select using(public.is_org_member(organization_id));

create or replace function public.acquire_channel_lock(p_lock_key text,p_organization_id uuid,p_lease_seconds integer default 30)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  insert into public.channel_conversation_locks(lock_key,organization_id,lease_until)
  values(p_lock_key,p_organization_id,now()+make_interval(secs=>least(greatest(p_lease_seconds,5),120)))
  on conflict(lock_key) do update set organization_id=excluded.organization_id,lease_until=excluded.lease_until
  where public.channel_conversation_locks.lease_until < now();
  return found;
end $$;

create or replace function public.release_channel_lock(p_lock_key text,p_organization_id uuid)
returns void language sql security definer set search_path=public as $$
  delete from public.channel_conversation_locks where lock_key=p_lock_key and organization_id=p_organization_id;
$$;

revoke all on function public.acquire_channel_lock(text,uuid,integer) from public,anon,authenticated;
revoke all on function public.release_channel_lock(text,uuid) from public,anon,authenticated;
grant execute on function public.acquire_channel_lock(text,uuid,integer) to service_role;
grant execute on function public.release_channel_lock(text,uuid) to service_role;
