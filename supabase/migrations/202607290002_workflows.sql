create or replace function public.set_updated_at() returns trigger language plpgsql set search_path='' as $$ begin new.updated_at=now(); return new; end $$;
create trigger documents_updated_at before update on public.documents for each row execute function public.set_updated_at();
create trigger conversations_updated_at before update on public.conversations for each row execute function public.set_updated_at();

create or replace function public.create_organization(org_name text) returns uuid language plpgsql security definer set search_path='' as $$
declare new_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if length(trim(org_name)) < 2 then raise exception 'invalid organization name'; end if;
  insert into public.profiles(id,full_name) values(auth.uid(),coalesce(auth.jwt()->>'email','Proprietário')) on conflict(id) do nothing;
  insert into public.organizations(name) values(trim(org_name)) returning id into new_id;
  insert into public.organization_members(organization_id,user_id,role) values(new_id,auth.uid(),'owner');
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id) values(new_id,auth.uid(),'organization.created','organization',new_id);
  return new_id;
end $$;
revoke all on function public.create_organization(text) from public;
grant execute on function public.create_organization(text) to authenticated;

create or replace function public.next_document_number(org_id uuid,doc_type public.document_type) returns text language plpgsql security definer set search_path='' as $$
declare seq bigint; yr integer:=extract(year from now()); prefix text;
begin
  if not public.has_org_role(org_id,array['owner','admin','sales']::public.member_role[]) then raise exception 'forbidden'; end if;
  insert into public.document_sequences(organization_id,type,year,next_value) values(org_id,doc_type,yr,2)
  on conflict(organization_id,type,year) do update set next_value=public.document_sequences.next_value+1 returning next_value-1 into seq;
  if seq is null then seq:=1; end if;
  prefix:=case when doc_type='quote' then 'ORC' else 'PC' end;
  return prefix||'-'||yr||'-'||lpad(seq::text,6,'0');
end $$;
revoke all on function public.next_document_number(uuid,public.document_type) from public;
grant execute on function public.next_document_number(uuid,public.document_type) to authenticated;

create index if not exists customers_org_name_idx on public.customers(organization_id,name) where deleted_at is null;
create index if not exists suppliers_org_name_idx on public.suppliers(organization_id,name) where deleted_at is null;
create index if not exists catalog_org_name_idx on public.catalog_items(organization_id,name) where deleted_at is null;
create index if not exists documents_org_created_idx on public.documents(organization_id,created_at desc) where deleted_at is null;
create index if not exists document_items_document_idx on public.document_items(document_id,position);
create index if not exists messages_conversation_created_idx on public.messages(conversation_id,created_at);
create index if not exists events_document_created_idx on public.document_events(document_id,created_at);
