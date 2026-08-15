-- Executar somente se nenhum documento depender do snapshot visual.
alter table public.documents drop column if exists branding_snapshot;
