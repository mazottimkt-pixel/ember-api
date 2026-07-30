# Banco de dados

As migrations versionadas criam organizações, perfis, papéis, clientes, fornecedores, catálogo, documentos e itens, sequências, conversas, mensagens, arquivos, eventos e auditoria. Toda entidade comercial possui `organization_id`; RLS usa membership e papéis. Há índices, triggers de atualização, onboarding transacional e numeração concorrente.

A migration `202607280000_remove_legacy.sql` remove somente `public.websites`, tabela do produto descontinuado. O schema REST remoto foi inspecionado em 29/07/2026 e continha apenas essa tabela.

As migrations novas ainda não foram aplicadas: o host direto fornece somente IPv6 e o pooler regional recusou a autenticação da URI atual. O runner `npm run db:migrate` é transacional e registra arquivos em `ember_migrations.applied`.
