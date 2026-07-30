# Banco de dados

O Supabase de desenvolvimento executa PostgreSQL 17.6. As três migrations versionadas foram aplicadas em 29/07/2026 e registradas em `ember_migrations.applied`. A tabela legada `public.websites` foi removida.

Estado validado: 14 tabelas de domínio, RLS habilitado nas 14, 43 policies públicas/Storage, 5 funções, 2 triggers, 25 índices e 2 buckets privados. O modelo cobre organizações, perfis, papéis, clientes, fornecedores, catálogo, documentos/itens/sequências, conversas, mensagens, arquivos, eventos e auditoria.

O teste integrado autenticou duas organizações diferentes e comprovou bloqueio de leitura, atualização e download cruzados. Também criou orçamento e pedido, confirmou ambos, registrou quatro eventos e armazenou um PDF privado.
