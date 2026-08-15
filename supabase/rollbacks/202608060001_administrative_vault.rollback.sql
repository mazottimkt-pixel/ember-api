-- Manual rollback only. Export retained files first; this operation removes Cofre metadata.
drop policy if exists administrative_vault_read on storage.objects;
drop policy if exists administrative_vault_write on storage.objects;
drop policy if exists administrative_files_select on public.administrative_files;
drop policy if exists administrative_files_insert on public.administrative_files;
drop policy if exists administrative_files_update on public.administrative_files;
drop table if exists public.administrative_files;
delete from storage.buckets where id='administrative-vault' and not exists(select 1 from storage.objects where bucket_id='administrative-vault');
alter table public.documents drop constraint if exists documents_counterparty_check;
alter table public.documents add constraint documents_counterparty_check check (
  counterparty_id is not null
  or (type='quote' and customer_id is not null)
  or (type='purchase_order' and supplier_id is not null)
);
