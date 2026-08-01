# Banco de dados

## Cadastros unificados

`business_contacts` é a fonte atual de clientes e fornecedores. Cada registro pertence a uma organização e possui os papéis `is_customer` e `is_supplier`, que podem ser marcados simultaneamente. `tax_id_normalized` mantém CPF/CNPJ somente com números e possui unicidade por `organization_id`.

A migration `202607300001_business_contacts.sql` consolida os registros antigos por organização e CPF/CNPJ, registra os vínculos em `business_contact_legacy_links` e preenche `documents.counterparty_id`. As tabelas `customers` e `suppliers` permanecem somente para compatibilidade histórica; documentos existentes preservam snapshots e FKs antigos.

Campos de endereço são estruturados em CEP, logradouro, número, complemento, bairro, cidade e estado. RLS em `business_contacts` usa as mesmas funções de associação e papel das demais entidades multiempresa.

O Supabase de desenvolvimento executa PostgreSQL 17.6. As três migrations versionadas foram aplicadas em 29/07/2026 e registradas em `ember_migrations.applied`. A tabela legada `public.websites` foi removida.

Estado validado: 14 tabelas de domínio, RLS habilitado nas 14, 43 policies públicas/Storage, 5 funções, 2 triggers, 25 índices e 2 buckets privados. O modelo cobre organizações, perfis, papéis, clientes, fornecedores, catálogo, documentos/itens/sequências, conversas, mensagens, arquivos, eventos e auditoria.

O teste integrado autenticou duas organizações diferentes e comprovou bloqueio de leitura, atualização e download cruzados. Também criou orçamento e pedido, confirmou ambos, registrou quatro eventos e armazenou um PDF privado.

## Canais WhatsApp

`whatsapp_channels` relaciona Phone Number ID e WABA à organização, sem guardar access token ou App Secret. `channel_message_jobs` deduplica por identificador externo e registra o processamento; `channel_conversation_locks` serializa cada conversa. RLS permite leitura por membro e administração por owner/admin; as funções de lock são exclusivas da service role do worker.

A migration `202608010001_whatsapp_channel_switch_history.sql` remove a suposição incorreta de uma única linha por WABA — uma WABA pode conter mais de um número — e acrescenta desativação lógica e referência ao canal anterior. Troca e rollback preservam jobs, conversas, mensagens, documentos e auditoria.
