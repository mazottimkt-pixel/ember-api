drop policy if exists storage_org_delete on storage.objects;
drop policy if exists storage_org_update on storage.objects;
alter table public.documents drop column if exists branding_snapshot;
drop table if exists public.document_branding_versions;
drop type if exists public.document_template_id;
drop type if exists public.document_branding_status;
