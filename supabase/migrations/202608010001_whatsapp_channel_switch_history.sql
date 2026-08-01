drop index if exists public.whatsapp_channels_business_account_unique;

alter table public.whatsapp_channels
  add column if not exists deactivated_at timestamptz,
  add column if not exists previous_channel_id uuid references public.whatsapp_channels(id);

create index if not exists whatsapp_channels_business_account_idx
  on public.whatsapp_channels(business_account_id);

create index if not exists whatsapp_channels_previous_idx
  on public.whatsapp_channels(previous_channel_id)
  where previous_channel_id is not null;
