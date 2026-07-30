# Banco de dados

## Cadastros unificados

`business_contacts` é a fonte atual de clientes e fornecedores. Cada registro pertence a uma organização e possui os papéis `is_customer` e `is_supplier`, que podem ser marcados simultaneamente. `tax_id_normalized` mantém CPF/CNPJ somente com números e possui unicidade por `organization_id`.

A migration `202607300001_business_contacts.sql` consolida os registros antigos por organização e CPF/CNPJ, registra os vínculos em `business_contact_legacy_links` e preenche `documents.counterparty_id`. As tabelas `customers` e `suppliers` permanecem somente para compatibilidade histórica; documentos existentes preservam snapshots e FKs antigos.

Campos de endereço são estruturados em CEP, logradouro, número, complemento, bairro, cidade e estado. RLS em `business_contacts` usa as mesmas funções de associação e papel das demais entidades multiempresa.

O Supabase de desenvolvimento executa PostgreSQL 17.6. As três migrations versionadas foram aplicadas em 29/07/2026 e registradas em `ember_migrations.applied`. A tabela legada `public.websites` foi removida.

Estado validado: 14 tabelas de domínio, RLS habilitado nas 14, 43 policies públicas/Storage, 5 funções, 2 triggers, 25 índices e 2 buckets privados. O modelo cobre organizações, perfis, papéis, clientes, fornecedores, catálogo, documentos/itens/sequências, conversas, mensagens, arquivos, eventos e auditoria.

O teste integrado autenticou duas organizações diferentes e comprovou bloqueio de leitura, atualização e download cruzados. Também criou orçamento e pedido, confirmou ambos, registrou quatro eventos e armazenou um PDF privado.
