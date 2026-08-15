# Estado atual do produto

Em 06/08/2026, orçamento e pedido de compra mantêm confirmação explícita, hash canônico, `request_id`, numeração idempotente e PDF privado. A conversa usa prompt ativo consumível e um único bloco numérico.

Contrapartes podem ser cadastradas ou avulsas. CNPJ é opcional e o documento persiste snapshot independente do cadastro.

O Cofre Administrativo MVP recebe PDF, JPEG, PNG, WEBP, DOCX, XLSX e TXT; valida tamanho/MIME/assinatura quando aplicável; guarda em bucket privado; deduplica por SHA-256 por organização; classifica deterministicamente; pesquisa metadados/texto; cria URL assinada de cinco minutos e registra auditoria. Extração/OCR assíncrono avançado permanece preparado por estados, sem OCR indiscriminado.

Vídeo, ZIP, executáveis, compartilhamento público, Drive, antivírus avançado e exclusão automática não fazem parte do MVP.

O pacote comercial baseline v3 diferencia fornecedor/item em pedidos de compra, utiliza prazo de entrega, normaliza pagamento sem acento e resolve explicitamente valor unitário ou total. “20 cadeiras por 250 reais” é ambíguo; “a 250 cada” é unitário; “total de R$ 250” é total. O rascunho mantém valor citado, escopo, quantidade, item normalizado e total, sem criar item financeiro enquanto houver ambiguidade.

O resumo `commercial-summary-v2` inclui fornecedor, CNPJ, item sem quantidade duplicada, quantidade, valor unitário, total, pagamento, prazo, endereço e observações antes das três ações de confirmação. CNPJ avulso não exige cadastro; telefone é removido do campo de endereço quando vier identificado no mesmo texto; o PDF lê o número documental do snapshot.

A falha real de 06/08/2026 13:42 BRT ocorreu antes da criação: o job mascarado `d4de2bbb***b426` terminou com `DRAFT_CREATE_FAILED` porque `documents.branding_snapshot` estava ausente no schema ativo. A migration aditiva `202608060002_commercial_branding_snapshot_repair.sql` foi aplicada. Não houve documento nem PDF; a sequência já havia avançado e não foi revertida. O contexto legado é recuperado para a pergunta de escopo, sem confirmar a premissa anterior.

Personalização visual retoma o documento em todas as saídas. As sete opções de Consultas e gestão possuem roteamento real e estados vazios profissionais. O lifecycle conversacional invalida prompts consumidos, incompatíveis ou com mais de 24 horas; saudações isoladas reiniciam contexto stale/inconsistente sem apagar frases compostas de um fluxo válido. Billing e trial não foram iniciados; dependem de decisão empresarial e credenciais de provider.

A interface principal agora é conversa natural. O contexto persiste uma representação derivada de `activeTask` com objetivo, dados disponíveis/faltantes, fontes, ambiguidades, riscos e próxima ação, sem substituir drafts ou estados existentes. Confirmações aceitam botões e equivalentes naturais. Quatro ou mais escolhas usam lista nativa do WhatsApp com fallback textual. Consultas ao Cofre ou aos dados da organização preservam a tarefa em andamento. Pesquisa externa possui contrato seguro e mockável, mas nenhum provider real está configurado.

O caminho real do processor agora aplica `expectedAnswer` como limite de escrita: pagamento não pode reinterpretar item ou quantidade, e correções possuem alvo explícito. Pagamentos preservam `display` semântico, produto e serviço usam linguagem distinta de prazo, e resumos de item único não repetem subtotal e total agregados. CNPJ e confirmação são enviados como um único componente com IDs semânticos; texto numerado aparece somente após rejeição real do interativo.

O adapter usa o contrato Graph real de reply buttons (`reply.id` + `reply.title`); `label` permanece apenas no contrato interno. A confirmação comercial abre uma decisão pré-emissão quando a organização ainda não possui identidade ativa. Documento, número e PDF só são criados após escolher modelo padrão, enviar uma logo válida ou cancelar a personalização em favor do padrão. `awaiting_logo` não aceita texto aleatório como confirmação.
# Motor conversacional

Agent V1 está disponível em shadow por feature flags, sem alteração do comportamento padrão. O estado canônico vive no JSON existente e não exigiu migration.
