# Ember Comercial

Assistente comercial multiempresa para criar orçamentos e pedidos de compra pelo painel ou pela API oficial do WhatsApp Business. O produto está em MVP local: integrações externas permanecem mockadas até suas credenciais serem configuradas.

## Executar

Requisitos: Node.js 20+, npm e um projeto Supabase para persistência real.

```bash
cp .env.example .env.local
npm install
npm run dev
```

Validação completa: `npm run check`. Aplique `supabase/migrations/202607290001_initial_schema.sql` em um projeto Supabase novo. Nunca use credenciais de produção durante o desenvolvimento.

## Estado do MVP

- Landing page e painel mobile-first com formulários de orçamento e pedido.
- Domínio validado com Zod; cálculos monetários, numeração e perguntas faltantes testados.
- PostgreSQL multiempresa com `organization_id`, papéis, RLS, auditoria e exclusão lógica.
- PDF reutilizável e endpoint de prévia.
- webhook oficial da Meta com verificação de challenge, assinatura e chave idempotente no banco.
- provedores de IA e WhatsApp explicitamente mockados sem credenciais.

Consulte [ARCHITECTURE.md](ARCHITECTURE.md), [DATABASE.md](DATABASE.md), [ROADMAP.md](ROADMAP.md), [docs/WHATSAPP.md](docs/WHATSAPP.md), [docs/DECISIONS.md](docs/DECISIONS.md) e [PENDENCIAS_DO_PROPRIETARIO.md](PENDENCIAS_DO_PROPRIETARIO.md).
