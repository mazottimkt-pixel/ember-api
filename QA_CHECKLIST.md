# Checklist de QA

## Fluxo funcional

- [x] Login, logout, sessão protegida e onboarding.
- [x] Cadastro persistido de cliente, fornecedor, produto e serviço.
- [x] Orçamento e pedido de compra com múltiplos itens.
- [x] Edição e autosave local de rascunho, com aviso antes de sair.
- [x] Duplicação idempotente, confirmação explícita e histórico.
- [x] PDF privado real, armazenado no Supabase Storage e baixado por rota autenticada.
- [x] Busca, ordenação, paginação, itens excluídos e restauração nas listas.
- [x] Dados de demonstração idempotentes com `npm run db:seed`.

## Interface e acessibilidade

- [x] Rotas principais verificadas com Playwright em desktop, tablet e celular.
- [x] Layout mobile-first, tabelas roláveis e navegação compacta.
- [x] Labels, foco visível, navegação por teclado e regiões de status/alerta.
- [x] Estados de carregamento, erro, sucesso e vazio.
- [x] Máscaras de CPF/CNPJ e telefone; moeda e datas em padrão brasileiro na exibição.
- [x] Respeito a `prefers-reduced-motion`.

## Segurança

- [x] Autorização e `organization_id` em todas as ações persistentes.
- [x] RLS testada com duas organizações reais.
- [x] Upload restrito a PNG/JPEG/WebP e 5 MB.
- [x] Bucket privado e download por rota autenticada.
- [x] Schemas Zod no servidor e chave de idempotência para documentos.
- [x] `.env.local`, relatórios e artefatos E2E ignorados pelo Git.
- [x] Ausência de chaves secretas no código cliente e bundle.

## PDF

- [x] A4, paginação, cabeçalho repetido, textos longos e múltiplos itens.
- [x] Logotipo opcional validado, BRL, datas, totais e rodapé de validação.
- [x] Teste automatizado de documento com várias páginas.

## Comandos de aceite

```bash
npm run db:validate
npm run test:integration
npm run test:e2e
npm run check
```

Integrações OpenAI, Meta/WhatsApp, domínio e produção estão deliberadamente fora deste ciclo.
