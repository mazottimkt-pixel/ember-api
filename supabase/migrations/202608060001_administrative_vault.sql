-- Additive MVP: ad-hoc counterparties and the private Administrative Vault.
alter table public.documents drop constraint if exists documents_counterparty_check;
alter table public.documents add constraint documents_counterparty_check check (
  counterparty_id is not null
  or customer_id is not null
  or supplier_id is not null
  or nullif(counterparty_snapshot->>'name', '') is not null
);

create table if not exists public.administrative_files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  conversation_id uuid references public.conversations(id),
  inbound_message_id uuid references public.messages(id),
  uploaded_by_user_id uuid references public.profiles(id),
  source_channel text not null default 'whatsapp',
  provider_media_id text,
  storage_bucket text not null default 'administrative-vault',
  storage_path text not null,
  original_filename text not null,
  normalized_filename text not null,
  mime_type text not null,
  extension text not null,
  size_bytes bigint not null check(size_bytes > 0 and size_bytes <= 10485760),
  sha256 text not null,
  document_category text not null default 'outro',
  title text,
  description text,
  extracted_text text,
  extraction_status text not null default 'pending' check(extraction_status in ('pending','completed','failed','stored_not_indexed')),
  indexing_status text not null default 'pending' check(indexing_status in ('pending','indexed','failed','stored_not_indexed')),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  customer_id uuid references public.business_contacts(id),
  supplier_id uuid references public.business_contacts(id),
  quote_id uuid references public.documents(id),
  purchase_order_id uuid references public.documents(id),
  service_order_id uuid references public.operational_documents(id),
  content_project_id uuid references public.content_projects(id)
);
create unique index if not exists administrative_files_org_hash_uidx on public.administrative_files(organization_id,sha256) where deleted_at is null;
create index if not exists administrative_files_org_search_idx on public.administrative_files(organization_id,document_category,occurred_at desc) where deleted_at is null;
create index if not exists administrative_files_conversation_idx on public.administrative_files(conversation_id,created_at desc);
alter table public.administrative_files enable row level security;
create policy administrative_files_select on public.administrative_files for select using(public.is_org_member(organization_id));
create policy administrative_files_insert on public.administrative_files for insert with check(public.has_org_role(organization_id,array['owner','admin','sales']::public.member_role[]));
create policy administrative_files_update on public.administrative_files for update using(public.has_org_role(organization_id,array['owner','admin','sales']::public.member_role[])) with check(public.has_org_role(organization_id,array['owner','admin','sales']::public.member_role[]));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values(
  'administrative-vault','administrative-vault',false,10485760,
  array['application/pdf','image/jpeg','image/png','image/webp','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/plain']
) on conflict(id) do nothing;
create policy administrative_vault_read on storage.objects for select using(bucket_id='administrative-vault' and public.is_org_member((storage.foldername(name))[1]::uuid));
create policy administrative_vault_write on storage.objects for insert with check(bucket_id='administrative-vault' and public.has_org_role((storage.foldername(name))[1]::uuid,array['owner','admin','sales']::public.member_role[]));

-- Rollback: drop policies/table/bucket only after exporting retained files; restore the prior documents constraint if required.
