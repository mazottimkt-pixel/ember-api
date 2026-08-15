# Modelo de compreensão contextual da Lume

## Princípio

A Lume interpreta cada mensagem dentro da tarefa ativa. Antes de extrair entidades, o motor determina `expectedAnswer` a partir do rascunho, do campo pendente e do prompt ativo. Uma resposta esperada tem um conjunto explícito de campos que pode alterar; os demais permanecem protegidos.

## Ordem de decisão

1. Resolver ação semântica do prompt ativo.
2. Identificar tarefa, etapa e `expectedAnswer`.
3. Detectar correção explícita ou conflito de papéis.
4. Executar o parser restrito à resposta esperada.
5. Validar entidades, tipos e proveniência.
6. Atualizar somente os campos autorizados.
7. Calcular derivados deterministicamente.
8. Perguntar apenas a próxima lacuna ou apresentar a revisão.

O extrator comercial amplo é reservado à primeira mensagem composta. Ele não pode reinterpretar uma resposta curta a item, prazo ou pagamento.

Nenhum parser, provider ou merge executado depois do parser contextual pode sobrescrever um campo fora do escopo autorizado. Essa proteção vale no caminho completo do processor, não apenas em chamadas diretas ao turno.

## Escopos protegidos

| `expectedAnswer` | Pode atualizar | Deve preservar |
| --- | --- | --- |
| `item_bundle` | descrição, tipo, quantidade, unitário, total derivado | contraparte, prazo, pagamento |
| `delivery_deadline` | prazo | item, quantidade, valores, pagamento |
| `payment_terms` | forma, parcelas, entrada, saldo e exibição | item, quantidade, valores, prazo |
| `quote_validity` | validade | todo o conteúdo comercial confirmado |
| `address` | endereço | todo o conteúdo comercial confirmado |
| `correction` | somente o campo explicitamente corrigido | todos os demais campos |

Campos confirmados não são sobrescritos por inferência. Uma mudança exige correção explícita ou nova confirmação. Totais recebem proveniência `derived_calculation`; dados literais da mensagem atual recebem `user_current_message`.

No modo de correção, o turno identifica primeiro um alvo (`item`, `quantity`, `payment`, `deadline` ou `counterparty`). Somente esse alvo e seus campos derivados podem mudar; o resumo anterior é invalidado e reconstruído.

## Ambiguidades

“Orçamento para fornecedor” é um conflito de papel: orçamento é destinado a cliente, enquanto aquisição com fornecedor é pedido de compra. O motor não cria contraparte nem documento até o usuário escolher o objetivo.

Números isolados são resolvidos somente pelo prompt ativo. Pagamento ambíguo não pode virar quantidade; “cartão de crédito 2 vezes” atualiza apenas pagamento. No item composto, `unidades` é unidade de medida, nunca descrição.

## Produto e serviço

O rascunho registra `itemType` como `product`, `service`, `mixed` ou `unknown`. Produto conduz a pergunta de prazo de entrega; serviço conduz a prazo de execução; tipo desconhecido usa pergunta neutra.

## Componentes interativos

Duas ou três escolhas fechadas usam um único payload de reply buttons; quatro ou mais usam lista. As identidades internas são semânticas (`include_cnpj`, `skip_cnpj`, `confirm_document`, `correct_document`, `cancel_document`, `price_unit`, `price_total`). O corpo não repete as escolhas numericamente. Fallback textual numerado só é enviado depois de rejeição não transitória comprovada do componente pela Meta.

O adapter registra apenas metadados sanitizados: tentativa interativa, sucesso, uso de fallback e categoria do motivo. Nenhum detalhe técnico é exibido ao usuário.

## Observabilidade e privacidade

Metadados operacionais podem registrar tarefa, `expectedAnswer`, campos atualizados, preservados ou rejeitados, ambiguidades, ferramenta usada, confiança e próxima ação. Não se registra raciocínio interno, cadeia de pensamento, segredo, token ou conteúdo sensível desnecessário.

## Provas de regressão

A suíte cobre os três incidentes oficiais, proteção contra sobrescrita e 100 combinações sintéticas de item, quantidade e valor. Os testes são determinísticos e não enviam mensagens reais.
