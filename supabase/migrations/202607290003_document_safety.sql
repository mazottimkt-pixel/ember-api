alter table public.documents add column if not exists request_id uuid;
create unique index if not exists documents_org_request_uidx on public.documents(organization_id,request_id) where request_id is not null;
create policy document_items_delete on public.document_items for delete using(public.has_org_role(organization_id,array['owner','admin','sales']::public.member_role[]));
