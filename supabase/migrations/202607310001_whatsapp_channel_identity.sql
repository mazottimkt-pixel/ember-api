alter table public.whatsapp_channels
  add column if not exists name text not null default 'Lume WhatsApp';

create unique index if not exists whatsapp_channels_business_account_unique
  on public.whatsapp_channels(business_account_id)
  where business_account_id is not null;
