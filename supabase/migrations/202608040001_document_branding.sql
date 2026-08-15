create type public.document_branding_status as enum ('not_configured','skipped_for_now','configured','default','disabled');
create type public.document_template_id as enum ('essential','executive','contemporary','commercial');

create table public.document_branding_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  status public.document_branding_status not null default 'not_configured',
  template_id public.document_template_id not null default 'executive',
  primary_color text not null default '#334155' check(primary_color ~ '^#[0-9A-F]{6}$'),
  contrast_color text not null default '#FFFFFF' check(contrast_color ~ '^#[0-9A-F]{6}$'),
  light_variant text not null default '#F1F5F9' check(light_variant ~ '^#[0-9A-F]{6}$'),
  dark_variant text not null default '#1E293B' check(dark_variant ~ '^#[0-9A-F]{6}$'),
  logo_storage_path text,
  logo_original_filename text,
  logo_mime_type text check(logo_mime_type is null or logo_mime_type in ('image/png','image/jpeg')),
  logo_width integer check(logo_width is null or logo_width between 1 and 12000),
  logo_height integer check(logo_height is null or logo_height between 1 and 12000),
  logo_has_transparency boolean,
  version integer not null check(version > 0),
  active boolean not null default true,
  configured_at timestamptz,
  configured_by uuid references public.profiles(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,version)
);
create unique index document_branding_one_active_idx on public.document_branding_versions(organization_id) where active;
alter table public.documents add column branding_snapshot jsonb;

alter table public.document_branding_versions enable row level security;
create policy document_branding_select on public.document_branding_versions for select using(public.is_org_member(organization_id));
create policy document_branding_insert on public.document_branding_versions for insert with check(public.has_org_role(organization_id,array['owner','admin']::public.member_role[]));
create policy document_branding_update on public.document_branding_versions for update using(public.has_org_role(organization_id,array['owner','admin']::public.member_role[])) with check(public.has_org_role(organization_id,array['owner','admin']::public.member_role[]));

create policy storage_org_update on storage.objects for update
using(bucket_id='organization-assets' and public.has_org_role((storage.foldername(name))[1]::uuid,array['owner','admin']::public.member_role[]))
with check(bucket_id='organization-assets' and public.has_org_role((storage.foldername(name))[1]::uuid,array['owner','admin']::public.member_role[]));
create policy storage_org_delete on storage.objects for delete
using(bucket_id='organization-assets' and public.has_org_role((storage.foldername(name))[1]::uuid,array['owner','admin']::public.member_role[]));

comment on column public.documents.branding_snapshot is 'Immutable visual identity snapshot used when this document was created.';
