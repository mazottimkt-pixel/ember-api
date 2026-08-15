# Modelo Conversacional da Lume

## Modelo mental

A Lume recebe um trabalho administrativo, entende o objetivo, consulta o que a organização já sabe, coleta somente lacunas, confirma ações relevantes, executa com idempotência, entrega o resultado e pode sugerir um único ganho contextual.

## Tarefa

`activeTask` é uma projeção do estado, draft e coleção existentes — não uma segunda máquina de estados. Registra tipo, objetivo, dados disponíveis/faltantes/confirmados, fontes, ambiguidades, riscos, próxima ação e estado de execução. Orçamentos, pedidos e busca documental usam os modelos persistidos atuais.

## Memória e confiança

Ordem de consulta: tarefa atual, organização, cadastros, documentos/snapshots, Cofre, histórico e ferramenta externa autorizada. Informação recém-informada, cadastro confirmado, documento confirmado e dado estruturado têm alta confiança. Histórico antigo ou fonte externa confiável têm confiança média e são confirmados antes de documento crítico. Inferências, conflitos e múltiplas correspondências têm baixa confiança e geram pergunta curta.

## Intenção e ferramentas

O orquestrador existente identifica objetivo e interrupção; o registry propõe a ferramenta. `external_lookup` é injetável, limita consulta/resultados e aceita somente fontes HTTPS. Sem provider, retorna indisponibilidade verificável; não faz scraping nem chamada paga silenciosa.

## Componentes interativos

- Botões: até três decisões fechadas, como emitir/corrigir/cancelar, incluir CNPJ ou personalizar/agora não.
- Listas: quatro a dez alternativas, como documentos e correspondências.
- Menu: catálogo opcional exibido somente quando solicitado.
- Fallback: todas as interações mantêm alternativa textual natural e contextual.

## Fallback humano

A Lume informa o que não conseguiu confirmar e oferece um próximo passo útil. Nunca expõe campo, estado, prompt, fila ou erro interno; nunca inventa dado para encerrar o fluxo.

## Revelação progressiva

O modelo padrão permite criar o primeiro documento imediatamente. Após PDF bem-sucedido, a Lume pode oferecer personalização. Cada tarefa importante recebe no máximo uma sugestão diretamente relacionada à redução de trabalho futuro.

## Interrupção e retomada

Consultas administrativas durante orçamento/pedido preservam estado, draft, documento e prompt. A resposta informa que o trabalho continua guardado e permite retomada natural. Mudanças destrutivas continuam exigindo confirmação.

## Segurança

RLS, organização, WAMID, job, lock, prompt consumível, hash do resumo, confirmação, idempotência, storage privado e auditoria permanecem fontes de integridade. Resultado externo nunca é usado silenciosamente em documento crítico.

## Exemplos

- “Preciso de um orçamento para a Alfa de 30 lâmpadas a 40 reais cada.” → extrair, consultar contraparte e perguntar somente pagamento, validade e execução.
- “Pode emitir.” → resolver contra o prompt atual e confirmar o documento.
- “Antes disso, qual é meu CNPJ?” → consultar organização, responder e preservar a tarefa.
- “Me manda aquele orçamento da Alfa.” → buscar documentos/Cofre e apresentar botões ou lista conforme a quantidade.
- “Pesquisa o endereço deles.” → usar provider autorizado; apresentar fonte e pedir confirmação.

## Contratos

Contrato é intenção reconhecida, mas não é anunciado como executável. Sua ativação exige schema seguro, campos necessários, cláusulas parametrizadas, aviso de não aconselhamento jurídico, resumo/hash, confirmação, renderer, PDF e testes de recuperação equivalentes aos documentos comerciais atuais.
