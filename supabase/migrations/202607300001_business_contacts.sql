create table if not exists public.business_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  legal_name text not null,
  trade_name text,
  tax_id text,
  tax_id_normalized text generated always as (nullif(regexp_replace(coalesce(tax_id, ''), '\D', '', 'g'), '')) stored,
  person_type text not null default 'individual' check (person_type in ('individual','company')),
  is_customer boolean not null default false,
  is_supplier boolean not null default false,
  phone text,
  whatsapp text,
  email text,
  postal_code text,
  street text,
  street_number text,
  address_extra text,
  district text,
  city text,
  state text,
  notes text,
  active boolean not null default true,
  legacy_customer_id uuid unique,
  legacy_supplier_id uuid unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (is_customer or is_supplier)
);

create unique index if not exists business_contacts_org_tax_uidx
  on public.business_contacts(organization_id, tax_id_normalized)
  where tax_id_normalized is not null;
create index if not exists business_contacts_org_roles_idx
  on public.business_contacts(organization_id, is_customer, is_supplier, legal_name);

insert into public.business_contacts (
  organization_id, legal_name, tax_id, person_type, is_customer, email, phone,
  postal_code, street, street_number, address_extra, district, city, state,
  legacy_customer_id, created_at, deleted_at
)
select distinct on (c.organization_id, coalesce(nullif(regexp_replace(coalesce(c.tax_id,''), '\D','','g'), ''), c.id::text)) c.organization_id, c.name, c.tax_id,
  case when length(regexp_replace(coalesce(c.tax_id,''), '\D','','g')) = 14 then 'company' else 'individual' end,
  true, c.email, c.phone, c.address->>'postal_code', c.address->>'street',
  c.address->>'number', c.address->>'extra', c.address->>'district',
  c.address->>'city', c.address->>'state', c.id, c.created_at, c.deleted_at
from public.customers c
order by c.organization_id, coalesce(nullif(regexp_replace(coalesce(c.tax_id,''), '\D','','g'), ''), c.id::text), c.created_at
on conflict (organization_id, tax_id_normalized) where tax_id_normalized is not null
do update set is_customer = true;

update public.business_contacts b
set is_supplier = true,
    legacy_supplier_id = s.id,
    phone = coalesce(b.phone, s.phone),
    email = coalesce(b.email, s.email)
from public.suppliers s
where b.organization_id = s.organization_id
  and b.tax_id_normalized is not null
  and b.tax_id_normalized = nullif(regexp_replace(coalesce(s.tax_id,''), '\D','','g'), '')
  and b.legacy_supplier_id is null;

insert into public.business_contacts (
  organization_id, legal_name, tax_id, person_type, is_supplier, email, phone,
  postal_code, street, street_number, address_extra, district, city, state,
  legacy_supplier_id, created_at, deleted_at
)
select distinct on (s.organization_id, coalesce(nullif(regexp_replace(coalesce(s.tax_id,''), '\D','','g'), ''), s.id::text)) s.organization_id, s.name, s.tax_id,
  case when length(regexp_replace(coalesce(s.tax_id,''), '\D','','g')) = 14 then 'company' else 'individual' end,
  true, s.email, s.phone, s.address->>'postal_code', s.address->>'street',
  s.address->>'number', s.address->>'extra', s.address->>'district',
  s.address->>'city', s.address->>'state', s.id, s.created_at, s.deleted_at
from public.suppliers s
order by s.organization_id, coalesce(nullif(regexp_replace(coalesce(s.tax_id,''), '\D','','g'), ''), s.id::text), s.created_at
on conflict (organization_id, tax_id_normalized) where tax_id_normalized is not null
do update set is_supplier = true,
  phone = coalesce(public.business_contacts.phone, excluded.phone),
  email = coalesce(public.business_contacts.email, excluded.email);

create table public.business_contact_legacy_links (
  contact_id uuid not null references public.business_contacts(id) on delete cascade,
  source_type text not null check (source_type in ('customer','supplier')),
  source_id uuid not null,
  primary key (source_type, source_id)
);

insert into public.business_contact_legacy_links(contact_id,source_type,source_id)
select b.id, 'customer', c.id from public.customers c join public.business_contacts b
  on b.organization_id=c.organization_id and (
    (b.tax_id_normalized is not null and b.tax_id_normalized=nullif(regexp_replace(coalesce(c.tax_id,''),'\D','','g'),''))
    or b.legacy_customer_id=c.id
  )
on conflict do nothing;
insert into public.business_contact_legacy_links(contact_id,source_type,source_id)
select b.id, 'supplier', s.id from public.suppliers s join public.business_contacts b
  on b.organization_id=s.organization_id and (
    (b.tax_id_normalized is not null and b.tax_id_normalized=nullif(regexp_replace(coalesce(s.tax_id,''),'\D','','g'),''))
    or b.legacy_supplier_id=s.id
  )
on conflict do nothing;

alter table public.documents add column if not exists counterparty_id uuid references public.business_contacts(id);
update public.documents d set counterparty_id = l.contact_id
from public.business_contact_legacy_links l
where ((l.source_type='customer' and d.customer_id=l.source_id) or (l.source_type='supplier' and d.supplier_id=l.source_id))
  and d.counterparty_id is null;

alter table public.documents drop constraint if exists documents_check;
alter table public.documents add constraint documents_counterparty_check check (
  counterparty_id is not null
  or (type='quote' and customer_id is not null)
  or (type='purchase_order' and supplier_id is not null)
);

alter table public.business_contacts enable row level security;
create policy business_contacts_select on public.business_contacts for select
  using (public.is_org_member(organization_id));
create policy business_contacts_insert on public.business_contacts for insert
  with check (public.has_org_role(organization_id,array['owner','admin','sales']::public.member_role[]));
create policy business_contacts_update on public.business_contacts for update
  using (public.has_org_role(organization_id,array['owner','admin','sales']::public.member_role[]))
  with check (public.has_org_role(organization_id,array['owner','admin','sales']::public.member_role[]));

alter table public.organizations add column if not exists email text;
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists job_title text;

update public.documents
set commercial_terms = jsonb_set(commercial_terms, '{validity}', '"2027-07-07"'::jsonb)
where number = 'ORC-2026-000014'
  and commercial_terms->>'validity' = '0277-07-07';
