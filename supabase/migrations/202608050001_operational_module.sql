-- Additive operational module. Commercial documents remain unchanged.
create table if not exists public.operational_sequences (
  organization_id uuid not null references public.organizations(id),
  type text not null check (type in ('service_order','checklist','service_report_service','service_report_inspection')),
  next_value bigint not null default 1 check (next_value > 0),
  primary key (organization_id,type)
);

create table if not exists public.operational_documents (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  type text not null check (type in ('service_order','checklist','service_report')),
  modality text check (modality is null or modality in ('service','inspection')),
  number text not null, request_id uuid, status text not null default 'draft', priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  title text not null, description text, counterparty_id uuid references public.business_contacts(id), counterparty_snapshot jsonb not null default '{}', location_snapshot jsonb not null default '{}',
  responsible_id uuid references public.profiles(id), team jsonb not null default '[]', scheduled_at timestamptz, started_at timestamptz, completed_at timestamptz,
  due_at timestamptz, source_document_id uuid references public.documents(id), service_order_id uuid references public.operational_documents(id), checklist_id uuid references public.operational_documents(id),
  content jsonb not null default '{}', acceptance jsonb, accepted_at timestamptz, accepted_by uuid references public.profiles(id), content_fingerprint text,
  version integer not null default 1 check (version > 0), created_by uuid not null references public.profiles(id), updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
  unique(organization_id,number), unique(organization_id,request_id),
  check ((type='service_report' and modality is not null) or (type<>'service_report' and modality is null))
);

create table if not exists public.operational_checklist_items (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), checklist_id uuid not null references public.operational_documents(id) on delete cascade,
  position integer not null check(position > 0), title text not null, description text, required boolean not null default true,
  status text not null default 'pending' check(status in ('pending','completed','not_applicable','non_compliant','blocked')),
  notes text, non_compliance_reason text, corrective_action text, responsible_id uuid references public.profiles(id), completed_at timestamptz, updated_by uuid references public.profiles(id), updated_at timestamptz not null default now(),
  unique(checklist_id,position)
);

create table if not exists public.checklist_templates (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), name text not null, description text,
  version integer not null default 1, items_snapshot jsonb not null default '[]', active boolean not null default true,
  created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(), deleted_at timestamptz,
  unique(organization_id,name,version)
);

create table if not exists public.operational_attachments (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), operational_document_id uuid not null references public.operational_documents(id),
  checklist_item_id uuid references public.operational_checklist_items(id), storage_path text not null, original_name text not null, mime_type text not null check(mime_type in ('image/png','image/jpeg','image/webp','application/pdf')),
  size_bytes bigint not null check(size_bytes between 1 and 10485760), checksum text not null, caption text, evidence_kind text not null default 'document',
  created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(), deleted_at timestamptz,
  unique(organization_id,storage_path)
);

create table if not exists public.operational_events (
  id bigint generated always as identity primary key, organization_id uuid not null references public.organizations(id), operational_document_id uuid not null references public.operational_documents(id),
  actor_id uuid references public.profiles(id), event_type text not null, source text not null default 'panel', from_status text, to_status text, observation text, metadata jsonb not null default '{}', created_at timestamptz not null default now()
);

create index if not exists operational_documents_org_created_idx on public.operational_documents(organization_id,created_at desc) where deleted_at is null;
create index if not exists operational_documents_org_status_idx on public.operational_documents(organization_id,type,status,due_at) where deleted_at is null;
create index if not exists operational_documents_responsible_idx on public.operational_documents(organization_id,responsible_id,status) where deleted_at is null;
create index if not exists operational_items_checklist_idx on public.operational_checklist_items(checklist_id,position);
create index if not exists operational_events_document_idx on public.operational_events(operational_document_id,created_at desc);
create index if not exists operational_attachments_document_idx on public.operational_attachments(operational_document_id,created_at);

do $$ declare t text; begin foreach t in array array['operational_sequences','operational_documents','operational_checklist_items','checklist_templates','operational_attachments','operational_events'] loop execute format('alter table public.%I enable row level security',t); end loop; end $$;
do $$ declare t text; begin foreach t in array array['operational_sequences','operational_documents','operational_checklist_items','checklist_templates','operational_attachments','operational_events'] loop
  execute format('create policy %I on public.%I for select using(public.is_org_member(organization_id))',t||'_select',t);
  execute format('create policy %I on public.%I for insert with check(public.has_org_role(organization_id,array[''owner'',''admin'',''sales'']::public.member_role[]))',t||'_insert',t);
  execute format('create policy %I on public.%I for update using(public.has_org_role(organization_id,array[''owner'',''admin'',''sales'']::public.member_role[])) with check(public.has_org_role(organization_id,array[''owner'',''admin'',''sales'']::public.member_role[]))',t||'_update',t);
end loop; end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('operational-evidence','operational-evidence',false,10485760,array['image/png','image/jpeg','image/webp','application/pdf']) on conflict(id) do nothing;
create policy operational_storage_read on storage.objects for select using(bucket_id='operational-evidence' and public.is_org_member((storage.foldername(name))[1]::uuid));
create policy operational_storage_write on storage.objects for insert with check(bucket_id='operational-evidence' and public.has_org_role((storage.foldername(name))[1]::uuid,array['owner','admin','sales']::public.member_role[]));

create or replace function public.next_operational_number(org_id uuid,operation_type text) returns text language plpgsql security definer set search_path='' as $$
declare seq bigint; prefix text;
begin
  if operation_type not in ('service_order','checklist','service_report_service','service_report_inspection') then raise exception 'invalid type'; end if;
  if not public.has_org_role(org_id,array['owner','admin','sales']::public.member_role[]) then raise exception 'forbidden'; end if;
  insert into public.operational_sequences(organization_id,type,next_value) values(org_id,operation_type,2)
  on conflict(organization_id,type) do update set next_value=public.operational_sequences.next_value+1 returning next_value-1 into seq;
  if seq is null then seq:=1; end if;
  prefix:=case operation_type when 'service_order' then 'OS' when 'checklist' then 'CHK' when 'service_report_inspection' then 'VIS' else 'REL' end;
  return prefix||'-'||lpad(seq::text,6,'0');
end $$;
revoke all on function public.next_operational_number(uuid,text) from public;
grant execute on function public.next_operational_number(uuid,text) to authenticated;

create trigger operational_documents_updated_at before update on public.operational_documents for each row execute function public.set_updated_at();
