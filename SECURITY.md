# Segurança

O MVP usa validação Zod, Supabase Auth, RLS por organização, Storage privado, confirmação explícita, idempotência e limites de upload. Segredos permanecem somente em `.env.local`, ignorado pelo Git.

## Painel web

- Ações persistentes recuperam a sessão no servidor e restringem consultas pelo `organization_id` da associação ativa.
- RLS foi exercitada com dois usuários de organizações distintas; leitura e escrita cruzadas são negadas.
- Logotipos aceitam somente PNG, JPEG ou WebP de até 5 MB e são gravados em bucket privado.
- PDFs são recuperados por endpoint autenticado; referências internas do Storage não são URLs públicas.
- Entradas são validadas por Zod no servidor e documentos usam `request_id` único por organização contra duplicidade.
- Playwright verifica redirecionamento de rotas protegidas, fluxo confirmado e download autenticado.

## Dependências

Em 29/07/2026, Next.js e `eslint-config-next` foram atualizados de 16.2.11 para 16.2.12. PostCSS foi fixado com override compatível em 8.5.25, eliminando seus alertas de produção. Permanece o alerta transitivo de Sharp 0.34.5: a correção 0.35 está fora da faixa principal declarada pelo Next. Nenhum downgrade, override de major ou `audit fix --force` foi aplicado.
