# Testes integrados do Supabase

Execute `npm run db:validate` para verificar metadados estruturais e `npm run test:integration` para executar o cenário real com duas organizações.

O cenário valida autenticação, onboarding idempotente, criação de cadastros, RLS de leitura e atualização, numeração, orçamento, pedido de compra, confirmação explícita, histórico, geração/upload/download de PDF e bloqueio de Storage entre tenants. O script nunca imprime tokens, senhas ou IDs.
