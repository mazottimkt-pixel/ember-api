# Prontidão de lançamento

## Pronto tecnicamente

- prompt contextual consumível e números sem ação global implícita;
- readiness antes do anúncio de processamento;
- contraparte avulsa/CNPJ opcional com snapshot;
- Cofre privado com limites, hash, deduplicação, busca determinística, assinatura e auditoria;
- migrations aditivas e RLS.
- extração contextual de pedido de compra, pagamentos sem acento e linguagem de entrega;
- personalização com saída e retomada em todos os caminhos;
- Consultas e gestão com handlers e estados vazios.
- escopo unitário/total explícito, resumo comercial v2 e recuperação segura de confirmação legada;
- migration reparadora aditiva aplicada para `documents.branding_snapshot`;
- resultados terminais distintos para falha de criação e falha de PDF.

## Homologação restante

- homologar abertura natural, confirmações equivalentes, listas nativas e retomada de tarefa no WhatsApp real;
- definir provider e fontes permitidas para pesquisa administrativa externa;
- contratos continuam fora do escopo executável até existir modelo documental seguro e decisão sobre revisão jurídica.

- payload real de cada MIME permitido;
- reenvio real somente após autorização explícita de teste;
- extração/indexação assíncrona em carga real;
- monitoramento de armazenamento e falhas da Meta.
- jornada real v3 completa: escopo → resumo → confirmação → documento → PDF → entrega, ainda não homologada depois da reparação.
- quick tunnel local validado em 12/08/2026, mas continua sendo infraestrutura efêmera e não serve como endpoint de produção.

## Billing e trial — MANUAL/BUSINESS DECISION REQUIRED

Billing ainda não está implementado e não deve ser improvisado. Antes de qualquer código financeiro, definir provider, domínio público e política comercial/fiscal. A arquitetura alvo deve usar checkout hospedado, webhook autenticado e idempotente, e entitlement persistido separado do estado conversacional.

Estados mínimos: `trialing` (7 dias), `active`, `past_due`, `cancelled` e `expired`. Eventos mínimos: checkout concluído, pagamento aprovado/recusado, renovação e cancelamento. O WhatsApp consulta entitlement no servidor; nunca confia em parâmetros do cliente. Segredos ficam somente no servidor e eventos repetidos usam o ID do provider como chave idempotente.

Bloqueios externos: escolha/contrato do provider, credenciais, preços/impostos, URL HTTPS estável e páginas legais. Até essas decisões existirem, não há barreira de cobrança no onboarding e nenhuma função deve fingir que o trial está ativo.

## Produção — caminho preparado, não implantado

- hospedagem Node.js compatível com `after()` e graceful shutdown, ou fila/worker durável para processamento do webhook;
- endpoint HTTPS e domínio estáveis; quick tunnel é somente homologação;
- variáveis e segredos no cofre da plataforma, com rotação e ambientes separados;
- Supabase com migrations aplicadas, RLS validada, bucket privado, backup e restauração testados;
- logs estruturados correlacionando WAMID/job/conversa/outbound sem conteúdo sensível;
- monitoramento de webhook, jobs `processing`, locks vencidos, falhas Graph API, storage e latência;
- retry idempotente e recuperação operacional documentada;
- limites de requisição, mídia e organização acompanhados por alertas;
- Callback URL de produção e assinatura `messages` validadas manualmente na Meta;
- billing somente após as decisões acima e homologação do provider.

Nenhuma dessas pendências autoriza mensagem real ou alteração remota da Meta.
# Agent V1

Não habilitar autoridade do Agent V1 em homologação real até os transcripts de contraparte, interrupção/Cofre, confirmação/tool única e branding passarem no processor E2E.

Confirmação e tool única já passam nos testes puros de lifecycle, inclusive repetição após serialização/restart. Isso ainda não substitui o processor E2E com PDF e branding.
