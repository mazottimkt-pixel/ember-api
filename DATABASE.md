# Banco de dados

A migration inicial cria organizações, perfis, membros e papéis; clientes, fornecedores e catálogo; documentos, itens e sequências; conversas, mensagens e arquivos; eventos e auditoria. Toda entidade comercial carrega `organization_id`. Políticas RLS usam `auth.uid()` e associação em `organization_members`.

Valores monetários usam `numeric`; o servidor calcula em centavos antes de persistir. `messages.whatsapp_message_id` é único para idempotência. Documentos usam exclusão lógica e snapshots da contraparte para preservar histórico. PDFs e logotipos ficam em buckets privados com referência no banco.

Antes de produção, executar os testes de isolamento com dois usuários e duas organizações em um projeto Supabase descartável e revisar policies de Storage específicas por prefixo de organização.
