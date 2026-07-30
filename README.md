# Ember Comercial

Assistente comercial multiempresa para criar orçamentos e pedidos de compra pelo painel ou pela API oficial do WhatsApp Business. O produto está em MVP local: integrações externas permanecem mockadas até suas credenciais serem configuradas.

## Executar

Requisitos: Node.js 20+, npm e um projeto Supabase para persistência real.

```bash
cp .env.example .env.local
npm install
npm run dev
```

Abra `http://localhost:3000`. Para popular o ambiente de desenvolvimento com clientes, fornecedores, catálogo e documentos realistas, execute `npm run db:seed`. Os testes de navegador usam `npm run test:e2e`.

Validação completa: `npm run check`. Aplique `supabase/migrations/202607290001_initial_schema.sql` em um projeto Supabase novo. Nunca use credenciais de produção durante o desenvolvimento.

## Estado do MVP

- Landing page e painel mobile-first com formulários de orçamento e pedido.
- Domínio validado com Zod; cálculos monetários, numeração e perguntas faltantes testados.
- PostgreSQL multiempresa com `organization_id`, papéis, RLS, auditoria e exclusão lógica.
- PDF reutilizável e endpoint de prévia.
- Editor de documentos com múltiplos itens, autosave, duplicação, confirmação e histórico.
- Listas com busca, filtros, ordenação, paginação, exclusão lógica e restauração.
- Cadastro comercial unificado: um contato pode ser cliente, fornecedor ou ambos, com endereço estruturado e busca de CEP.
- PDF A4 multipágina armazenado em bucket privado e entregue por rota autenticada.
- Datas validadas e PDFs com acentuação, dados completos das partes e identificação do responsável.
- Página interna `/demo` e cobertura Playwright em celular, tablet e desktop.
- webhook oficial da Meta com verificação de challenge, assinatura e chave idempotente no banco.
- provedores de IA e WhatsApp explicitamente mockados sem credenciais.

Banco remoto: `npm run db:inspect`, `npm run db:validate` e `npm run test:integration`.

Consulte [ARCHITECTURE.md](ARCHITECTURE.md), [DATABASE.md](DATABASE.md), [ROADMAP.md](ROADMAP.md), [SECURITY.md](SECURITY.md), [QA_CHECKLIST.md](QA_CHECKLIST.md), [docs/INTEGRATION_TESTS.md](docs/INTEGRATION_TESTS.md), [docs/WHATSAPP.md](docs/WHATSAPP.md), [docs/DECISIONS.md](docs/DECISIONS.md) e [PENDENCIAS_DO_PROPRIETARIO.md](PENDENCIAS_DO_PROPRIETARIO.md).
