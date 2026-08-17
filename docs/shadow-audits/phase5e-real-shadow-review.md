# Phase 5E — revisão humana da segunda rodada Shadow

Data da extração: 2026-08-16/17. Fonte: `channel_message_jobs`, consulta somente leitura. O corpus contém os 56 inbounds usados no fechamento anterior. IDs estão mascarados; CNPJ foi substituído por `<ID>`; não há telefone, token ou secret.

## Limite probatório do corpus histórico

O runtime Phase 5D não persistiu resposta visível, interpretação, patch nem snapshots por evento. Portanto esses campos não podem ser reconstruídos com segurança a partir do estado final. Em **cada um dos 56 registros**:

| Campo obrigatório | Valor histórico disponível |
|---|---|
| `taskType` | `NOT_PERSISTED` |
| `LEGACY_VISIBLE_REPLY` | `NOT_PERSISTED` (o registro outbound contém apenas estado/indicador de botões) |
| `LEGACY_ACTIVE_STATE_BEFORE` / `AFTER` | `NOT_PERSISTED_PER_EVENT` |
| `LEGACY_NEXT_ACTION` | `NOT_PERSISTED` |
| `V2_INTERPRETATION` / `V2_PATCH` | `NOT_PERSISTED` |
| `V2_STATE_BEFORE` / `AFTER` | `NOT_PERSISTED_PER_EVENT` |
| `V2_INTERACTION` / `V2_NEXT_ACTION` | `NOT_PERSISTED` |

Consequentemente, nenhum evento recebe `CQ_PASS`. Isso preserva a evidência histórica em vez de fabricar uma avaliação. Os 54 eventos elegíveis são `STRUCTURAL_PASS` segundo o gate Phase 5D; os eventos 14 e 24 são `STRUCTURAL_FAIL` por perda pré-reducer. Todos permanecem `CQ_NEEDS_HUMAN_REVIEW`, motivo `HISTORICAL_VISIBLE_REPLY_AND_TRANSITION_NOT_PERSISTED`.

## Registros sanitizados

| eventIndex | maskedEventId | USER_MESSAGE | STRUCTURAL_CLASSIFICATION | CONVERSATIONAL_CLASSIFICATION | CONVERSATIONAL_REASON |
|---:|---|---|---|---|---|
| 1 | `…MjlDRDEA` | Preciso de 20 cadeiras ergonômicas. Pretas. Na verdade são 30. Entrega em São José. Pagamento no cartão em 3 vezes. | STRUCTURAL_PASS | CQ_NEEDS_HUMAN_REVIEW | Evidência conversacional histórica incompleta |
| 2 | `…Mzg4MTkA` | Voltar ao meu | STRUCTURAL_PASS | CQ_NEEDS_HUMAN_REVIEW | Evidência conversacional histórica incompleta |
| 3 | `…QTM3RkMA` | Preciso de 20 cadeiras ergonômicas. | STRUCTURAL_PASS | CQ_NEEDS_HUMAN_REVIEW | Evidência conversacional histórica incompleta |
| 4 | `…MTAxRTMA` | Voltar ao meu | STRUCTURAL_PASS | CQ_NEEDS_HUMAN_REVIEW | Evidência conversacional histórica incompleta |
| 5 | `…MDU2MkYA` | Menu | STRUCTURAL_PASS | CQ_NEEDS_HUMAN_REVIEW | Evidência conversacional histórica incompleta |
| 6 | `…MzJDQTkA` | Retomar ao menu | STRUCTURAL_PASS | CQ_NEEDS_HUMAN_REVIEW | Evidência conversacional histórica incompleta |
| 7 | `…MEI0M0MA` | Boa noite Lume | STRUCTURAL_PASS | CQ_NEEDS_HUMAN_REVIEW | Evidência conversacional histórica incompleta |
| 8 | `…ODA0MzIA` | Comercial | STRUCTURAL_PASS | CQ_NEEDS_HUMAN_REVIEW | Evidência conversacional histórica incompleta |
| 9 | `…MUM3MwA=` | Preciso de 20 cadeiras ergonômicas. | STRUCTURAL_PASS | CQ_NEEDS_HUMAN_REVIEW | Evidência conversacional histórica incompleta |
| 10 | `…MkQzNwA=` | Pretas. | STRUCTURAL_PASS | CQ_NEEDS_HUMAN_REVIEW | Evidência conversacional histórica incompleta |
| 11 | `…RkIxNgA=` | Na verdade são 30. | STRUCTURAL_PASS | CQ_NEEDS_HUMAN_REVIEW | Evidência conversacional histórica incompleta |
| 12 | `…NUNCNQA=` | Preciso de 20 cadeiras ergonômicas. Pretas. Na verdade são 30. Entrega em São José. Pagamento no cartão em 3 vezes. | STRUCTURAL_PASS | CQ_NEEDS_HUMAN_REVIEW | Evidência conversacional histórica incompleta |
| 13 | `…Q0RFQwA=` | Preciso fazer um orçamento para a Alfa de 20 lâmpadas a R$30 cada. | STRUCTURAL_PASS | CQ_NEEDS_HUMAN_REVIEW | Evidência conversacional histórica incompleta |
| 14 | `…NEUyMQA=` | Antes disso, qual foi meu último pedido? | STRUCTURAL_FAIL | CQ_NEEDS_HUMAN_REVIEW | `expectedInput` inválido perdeu a trajetória V2 |
| 15 | `…QjY3QQA=` | Beleza, continua. | STRUCTURAL_PASS | CQ_NEEDS_HUMAN_REVIEW | Evidência conversacional histórica incompleta |
| 16 | `…QTdFRgA=` | Na verdade são 25 lâmpadas. | STRUCTURAL_PASS | CQ_NEEDS_HUMAN_REVIEW | Evidência conversacional histórica incompleta |
| 17 | `…MTAzRgA=` | Começar orçamento | STRUCTURAL_PASS | CQ_NEEDS_HUMAN_REVIEW | Evidência conversacional histórica incompleta |
| 18 | `…MTU1MwA=` | Preciso de 20 cadeiras ergonômicas. | STRUCTURAL_PASS | CQ_NEEDS_HUMAN_REVIEW | Evidência conversacional histórica incompleta |
| 19 | `…QzMxOAA=` | Pretas. | STRUCTURAL_PASS | CQ_NEEDS_HUMAN_REVIEW | Evidência conversacional histórica incompleta |
| 20 | `…QjlBNgA=` | Na verdade são 30. Entrega em São José. Pagamento no cartão em 3 vezes. | STRUCTURAL_PASS | CQ_NEEDS_HUMAN_REVIEW | Evidência conversacional histórica incompleta |
| 21 | `…MUIyMQA=` | Voltar ao menu | STRUCTURAL_PASS | CQ_NEEDS_HUMAN_REVIEW | Evidência conversacional histórica incompleta |
| 22 | `…MUUwMwA=` | Falar com a Lume | STRUCTURAL_PASS | CQ_NEEDS_HUMAN_REVIEW | Evidência conversacional histórica incompleta |
| 23 | `…MkRDNgA=` | Preciso fazer um orçamento para a Alfa de 20 lâmpadas a R$30 cada. Antes disso, qual foi meu último pedido? Beleza, continua. Na verdade são 25 lâmpadas. | STRUCTURAL_PASS | CQ_NEEDS_HUMAN_REVIEW | Evidência conversacional histórica incompleta |
| 24 | `…NTk5NwA=` | Na verdade são 25 lâmpadas. | STRUCTURAL_FAIL | CQ_NEEDS_HUMAN_REVIEW | `expectedInput` inválido perdeu a trajetória V2 |
| 25 | `…OEE3QgA=` | 30 dias | STRUCTURAL_PASS | CQ_NEEDS_HUMAN_REVIEW | Evidência conversacional histórica incompleta |
| 26 | `…ODhFNAA=` | Na verdade altere, são 20 lâmpadas. | STRUCTURAL_PASS | CQ_NEEDS_HUMAN_REVIEW | Evidência conversacional histórica incompleta |
| 27 | `…Q0ZDNAA=` | Você alterou o pedido? | STRUCTURAL_PASS | CQ_NEEDS_HUMAN_REVIEW | Evidência conversacional histórica incompleta |
| 28 | `…Q0Q5QwA=` | Cartão de crédito 2x | STRUCTURAL_PASS | CQ_NEEDS_HUMAN_REVIEW | Evidência conversacional histórica incompleta |
| 29 | `…RkU3NgA=` | 14/06/2025 | STRUCTURAL_PASS | CQ_NEEDS_HUMAN_REVIEW | Evidência conversacional histórica incompleta |
| 30 | `…MTExQgA=` | Coloca 2 dias então | STRUCTURAL_PASS | CQ_NEEDS_HUMAN_REVIEW | Evidência conversacional histórica incompleta |
| 31 | `…ODNDQgA=` | Sim | STRUCTURAL_PASS | CQ_NEEDS_HUMAN_REVIEW | Evidência conversacional histórica incompleta |
| 32 | `…MDkyRQA=` | Pesquise no Google | STRUCTURAL_PASS | CQ_NEEDS_HUMAN_REVIEW | Evidência conversacional histórica incompleta |
| 33 | `…Q0MxRgA=` | Retornar ao menu anterior | STRUCTURAL_PASS | CQ_NEEDS_HUMAN_REVIEW | Evidência conversacional histórica incompleta |
| 34 | `…OTA3MQA=` | `<ID>` | STRUCTURAL_PASS | CQ_NEEDS_HUMAN_REVIEW | Evidência conversacional histórica incompleta |
| 35 | `…QTExRAA=` | Corrigir informações | STRUCTURAL_PASS | CQ_NEEDS_HUMAN_REVIEW | Evidência conversacional histórica incompleta |
| 36 | `…QzhBMgA=` | Validade | STRUCTURAL_PASS | CQ_NEEDS_HUMAN_REVIEW | Evidência conversacional histórica incompleta |
| 37 | `…MEU3MwA=` | Alterar a validade | STRUCTURAL_PASS | CQ_NEEDS_HUMAN_REVIEW | Evidência conversacional histórica incompleta |
| 38 | `…NUUyNgA=` | Alterar o valor para 15 reais | STRUCTURAL_PASS | CQ_NEEDS_HUMAN_REVIEW | Evidência conversacional histórica incompleta |
| 39 | `…QTJDQwA=` | Voltar ao menu | STRUCTURAL_PASS | CQ_NEEDS_HUMAN_REVIEW | Evidência conversacional histórica incompleta |
| 40 | `…QjlDRgA=` | Operacional | STRUCTURAL_PASS | CQ_NEEDS_HUMAN_REVIEW | Evidência conversacional histórica incompleta |
| 41 | `…QjNDQwA=` | 2 | STRUCTURAL_PASS | CQ_NEEDS_HUMAN_REVIEW | Evidência conversacional histórica incompleta |
| 42 | `…ODhCOAA=` | Comercial | STRUCTURAL_PASS | CQ_NEEDS_HUMAN_REVIEW | Evidência conversacional histórica incompleta |
| 43 | `…ODA3RQA=` | Criar orçamento | STRUCTURAL_PASS | CQ_NEEDS_HUMAN_REVIEW | Evidência conversacional histórica incompleta |
| 44 | `…Njg1QgA=` | `<COUNTERPARTY>` | STRUCTURAL_PASS | CQ_NEEDS_HUMAN_REVIEW | Contraparte anonimizada; evidência histórica incompleta |
| 45 | `…NTNBQQA=` | 200 reais cada | STRUCTURAL_PASS | CQ_NEEDS_HUMAN_REVIEW | Evidência conversacional histórica incompleta |
| 46 | `…MzU2NgA=` | 20 unidades, 45 reais cada lâmpada | STRUCTURAL_PASS | CQ_NEEDS_HUMAN_REVIEW | Evidência conversacional histórica incompleta |
| 47 | `…QzZDNgA=` | 60 dias úteis | STRUCTURAL_PASS | CQ_NEEDS_HUMAN_REVIEW | Evidência conversacional histórica incompleta |
| 48 | `…NDBDRAA=` | Vamos mudar o item | STRUCTURAL_PASS | CQ_NEEDS_HUMAN_REVIEW | Evidência conversacional histórica incompleta |
| 49 | `…RjhBNQA=` | Altere por favor [erro de digitação preservado] | STRUCTURAL_PASS | CQ_NEEDS_HUMAN_REVIEW | Evidência conversacional histórica incompleta |
| 50 | `…MTQ4NAA=` | Cartão de crédito 2 x | STRUCTURAL_PASS | CQ_NEEDS_HUMAN_REVIEW | Evidência conversacional histórica incompleta |
| 51 | `…NkNFMQA=` | Pix | STRUCTURAL_PASS | CQ_NEEDS_HUMAN_REVIEW | Evidência conversacional histórica incompleta |
| 52 | `…NDE5QwA=` | Altere o item | STRUCTURAL_PASS | CQ_NEEDS_HUMAN_REVIEW | Evidência conversacional histórica incompleta |
| 53 | `…QTYyNAA=` | Até 10/09/2027 | STRUCTURAL_PASS | CQ_NEEDS_HUMAN_REVIEW | Evidência conversacional histórica incompleta |
| 54 | `…MzJGQwA=` | Não precisa | STRUCTURAL_PASS | CQ_NEEDS_HUMAN_REVIEW | Evidência conversacional histórica incompleta |
| 55 | `…MjBGQgA=` | Cancelar | STRUCTURAL_PASS | CQ_NEEDS_HUMAN_REVIEW | Evidência conversacional histórica incompleta |
| 56 | `…OURBNAA=` | Cancelar | STRUCTURAL_PASS | CQ_NEEDS_HUMAN_REVIEW | Evidência conversacional histórica incompleta |

## Reclassificação

- Resultado histórico preservado: `BOTH_CORRECT=36`, `AMBIGUOUS=18`, dois eventos sem classificação por perda pré-reducer.
- Gate estrutural Phase 5E: `PASS=54`, `FAIL=2`.
- Gate conversacional Phase 5E: `PASS=0`, `FAIL=0`, `NEEDS_REVIEW=56`.
- A ausência de `FAIL` conversacional não significa qualidade aprovada: significa que o runtime anterior não guardou a evidência mínima para atribuir uma classe de falha por evento sem inventá-la.

## O que `BOTH_CORRECT` significava

Sem transcript catalogado, significava apenas que legado e V2 concordaram em intenção e estado final. Não media resposta visível, informação aproveitada, pergunta repetida, naturalidade, avanço, botões inadequados ou coerência humana. Por isso a experiência podia estar ruim mesmo com `BOTH_CORRECT`.
