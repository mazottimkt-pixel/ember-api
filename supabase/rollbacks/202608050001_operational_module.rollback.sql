drop trigger if exists operational_documents_updated_at on public.operational_documents;
drop function if exists public.next_operational_number(uuid,text);
drop policy if exists operational_storage_write on storage.objects;
drop policy if exists operational_storage_read on storage.objects;
delete from storage.buckets where id='operational-evidence';
drop table if exists public.operational_events, public.operational_attachments, public.checklist_templates, public.operational_checklist_items, public.operational_documents, public.operational_sequences cascade;
