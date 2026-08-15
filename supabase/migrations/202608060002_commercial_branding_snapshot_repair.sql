-- Repara uma aplicação parcial da identidade visual sem reescrever documentos.
alter table public.documents
  add column if not exists branding_snapshot jsonb;

comment on column public.documents.branding_snapshot is
  'Immutable visual identity snapshot used when this document was created.';
