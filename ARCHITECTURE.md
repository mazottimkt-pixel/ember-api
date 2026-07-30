# Arquitetura

O Next.js 16 (App Router) concentra painel e backend-for-frontend. Server Components fazem leitura; Route Handlers recebem webhooks e geram arquivos; qualquer mutação deve autenticar, autorizar e validar novamente no servidor. Supabase fornece Auth, PostgreSQL com RLS e Storage privado.

O domínio em `lib/domain` não depende de UI ou banco. Integrações em `lib/ai`, `lib/pdf` e `lib/whatsapp` usam limites explícitos: a IA retorna dados não confiáveis, Zod valida, regras calculam e apenas então um rascunho pode ser persistido. A transição para definitivo exige `confirmed_at` e `confirmed_by`.

Fluxo: webhook validado → deduplicação por `whatsapp_message_id` → identificação do membro/organização → intenção/transcrição → extração validada → perguntas faltantes → resumo → confirmação explícita → transação de documento → PDF → Storage privado → envio oficial → evento/auditoria.

Não registrar payloads brutos, tokens, áudio ou dados comerciais em logs de aplicação. Service role é exclusiva para workers confiáveis e nunca chega ao navegador.
