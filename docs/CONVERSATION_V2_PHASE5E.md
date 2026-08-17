# Conversation V2 — Phase 5E

## Inventário de `expectedInput`

Produtores auditados: `runAgentTurn`/`expectedAnswerFor`, `pendingField`, `activePrompt` (greeting, menu, confirmation, branding, continuation), navegação/menu, troca de intenção, branding, documentos, Cofre e consultas administrativas. Menu/branding/Cofre não declaram um campo material próprio; quando só existe prompt ativo, o mapper usa `free_text`. Confirmação usa `confirmation`; fluxo de CNPJ usa `tax_id`.

Valores legados conhecidos:

`document_type`, `tipo de documento`, `counterparty`, `cliente`, `fornecedor`, `tax_id`, `cnpj`, `item_bundle`, `itens`, `price_scope`, `delivery_deadline`, `prazo`, `payment`, `payment_terms`, `condição de pagamento`, `validity`, `quote_validity`, `validade`, `address`, `endereço de entrega`, `confirmation`, `confirmação`, `correction`, `correção`, `document_selection`, `free_text`, `none`.

Vocabulário V2 canônico:

`document_type`, `counterparty`, `tax_id`, `item_bundle`, `delivery_deadline`, `payment`, `validity`, `address`, `confirmation`, `correction`, `free_text`, `none`.

| Legado | V2 |
|---|---|
| `tipo de documento` | `document_type` |
| `cliente`, `fornecedor` | `counterparty` |
| `cnpj` | `tax_id` |
| `itens`, `price_scope` | `item_bundle` |
| `prazo` | `delivery_deadline` |
| `payment_terms`, `condição de pagamento` | `payment` |
| `quote_validity`, `validade` | `validity` |
| `endereço de entrega` | `address` |
| `confirmação` | `confirmation` |
| `correção` | `correction` |
| `document_selection` | `free_text` |
| valores já canônicos | identidade |

O mapa executável e testado está em `lib/conversation-v2/expected-input.ts`. Valor desconhecido produz `EXPECTED_INPUT_UNSUPPORTED`, valor sanitizado/origem no audit e interação recuperável `free_text`; não existe cast de string arbitrária.

## Trajetória pré-reducer

A migration `202608160002_conversation_v2_phase5e.sql` adiciona ao job compartilhado o instante de tentativa, outcome, código e instante final. Os outcomes permitidos são exatamente `PROCESSED`, `REJECTED_WITH_REASON`, `DEFERRED`, `RECOVERABLE_FAILURE` e `TERMINAL_FAILURE`. A tentativa nasce atomicamente como `DEFERRED/V2_SHADOW_ATTEMPT_STARTED`, de modo que até uma falha posterior de telemetria deixa trajetória recuperável; o outcome é então substituído pelo resultado final. A correlação usa organização + WAMID/external message + job + conversation. O legado permanece autoridade única e falha de Shadow não bloqueia sua persistência nem cria efeitos.

Esta migration é aditiva e precisa ser aplicada antes de publicar/reativar o candidato. Nenhuma flag ou ambiente remoto foi alterado nesta implementação.

## Dois gates independentes

O oracle estrutural histórico continua registrando concordância/divergência. `BOTH_CORRECT` sem transcript significa apenas igualdade de intenção e estado final; não é aprovação da conversa.

O oracle conversacional usa, nesta ordem: invariantes determinísticas, transcript catalogado, Constituição Conversacional, regras de domínio e revisão humana. Apenas um transcript determinístico previamente aprovado pode conceder `CQ_PASS`; LLM não concede aprovação. Sem resposta/snapshot histórico suficiente, o resultado obrigatório é `CQ_NEEDS_HUMAN_REVIEW`.

O corpus da rodada real está em `docs/shadow-audits/phase5e-real-shadow-review.md`.
