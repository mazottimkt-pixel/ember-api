# Constituição do Produto Lume

Este documento é a referência obrigatória para alterações na experiência central da Lume. Implementações futuras devem preservar estes invariantes e justificar explicitamente qualquer desvio.

## Princípios permanentes

- A Lume é uma agente administrativa pessoal, não um chatbot de atendimento.
- Conversa natural é a interface principal; menus servem para descoberta.
- Botões facilitam decisões fechadas e listas facilitam seleção entre várias alternativas.
- Estado técnico permanece invisível para o usuário.
- A Lume consulta tarefa, organização, cadastros, documentos, Cofre e histórico antes de perguntar.
- Fatos nunca são inventados; inferência e pesquisa externa exigem confiança e confirmação proporcionais ao risco.
- A Lume pergunta somente o necessário para concluir o objetivo.
- Primeiro entrega valor; personalização e enriquecimentos vêm depois.
- Capacidades são reveladas progressivamente e sugestões devem reduzir trabalho futuro.
- Uma tarefa pode ser pausada para uma consulta e retomada sem perda de contexto.
- Documentos e memória persistida formam continuidade operacional da organização.
- Segurança, isolamento, idempotência e confirmação prevalecem sobre conveniência.

- A conversa livre vem primeiro; o menu é um apoio opcional.
- Números são sempre contextuais e somente valem para o prompt ativo.
- Comandos globais têm prioridade máxima e nunca viram dados de formulário ou termos de busca.
- Uma mensagem composta é interpretada integralmente antes do parser do campo atual.
- A Lume pergunta apenas o que estiver faltando.
- Nenhuma informação pode ser inventada.
- Não existe confirmação sem resumo integral, atual e identificado por hash.
- Não existe criação definitiva sem confirmação explícita.
- Nenhuma ação crítica pode ser silenciosa.
- Nenhum menu é apresentado durante criação ou processamento de PDF.
- Função incompleta aparece apenas como informação, nunca como ação funcional.
- Sucesso, resultado vazio e erro recuperável sempre oferecem continuidade real.
- A linguagem oficial é centralizada e consistente.
- Idempotência é obrigatória para documento, numeração, PDF e outbound.
- Toda leitura e escrita respeita o isolamento por organização.
- Usuários que preferem menus e usuários que preferem linguagem natural usam a mesma cadeia de execução.
- Cada outbound apresenta no máximo um conjunto numérico contextual; números executam somente ações visíveis no prompt ativo.
- Antes de extrair entidades, a Lume determina a tarefa ativa e a resposta esperada; respostas contextuais só podem alterar os campos autorizados por essa etapa.
- Campos confirmados permanecem protegidos contra inferência e só mudam mediante correção explícita ou nova confirmação.
- Conflitos entre tipo de documento e papel da contraparte exigem esclarecimento; a Lume não inventa cliente, fornecedor, item ou condição comercial.
- Dados persistidos mantêm proveniência e confiança suficientes para auditoria operacional, sem registrar cadeia de pensamento.
- Um prompt é ligado ao outbound, possui versão/fluxo/estado esperado e é consumido uma única vez.
- Processamento documental só é anunciado após readiness integral; navegação invalida ações terminais pendentes.
- Cadastro de contraparte e CNPJ são opcionais; o snapshot emitido é a fonte histórica do documento.
- Arquivos administrativos são privados, isolados por organização, limitados e recuperados por acesso temporário.
- A interpretação de contraparte, item e linguagem depende do tipo documental; pedido de compra usa fornecedor e entrega.
- Pagamentos são normalizados semanticamente sem depender de acento.
- Personalização visual sempre termina em personalização, padrão, adiamento ou cancelamento com retomada explícita.
- Toda opção funcional de consulta possui handler e estado vazio contextual.
- Fallbacks nunca expõem chaves ou nomes internos de campos.
- Preço com quantidade distingue valor citado, escopo (`amount_scope_pending`, `unit` ou `total`), quantidade, valor unitário e total. Nenhum item financeiro definitivo nasce enquanto o escopo estiver pendente.
- Um snapshot comercial completo e sua confirmação pertencem ao mesmo turno lógico; qualquer mudança de preço, CNPJ, endereço, prazo ou pagamento invalida o resumo.
- Falha anterior à criação, falha posterior à criação e falha de PDF possuem resultados terminais diferentes.

## Precedência oficial

Uma mensagem percorre exatamente esta ordem:

1. comando global;
2. resposta inequívoca ao prompt ativo;
3. detecção de interrupção ou mudança de intenção;
4. detecção de mensagem composta;
5. orquestrador híbrido;
6. extração e validação de entidades;
7. aplicação ao rascunho;
8. parser simples do campo atual;
9. fallback profissional.

`processor.ts` coordena a precedência. `menu-engine.ts` reconhece somente comandos globais e navegação de menu. `conversation-prompts.ts` resolve somente a resposta do prompt ativo. `orchestrator.ts` classifica intenção e interrupção. `entities.ts` extrai e aplica dados comerciais. `runAgentTurn` valida o rascunho, escolhe a próxima pergunta, constrói o resumo e executa confirmação. Nenhum desses arquivos pode reimplementar uma precedência concorrente.

## Estados conceituais

O banco preserva os estados compatíveis atuais; os estados abaixo descrevem o ciclo de produto e podem ser representados pelo estado persistido mais o contexto:

| Estado conceitual | Representação atual |
|---|---|
| `idle` | conversa ainda inexistente |
| `greeting_presented` | `menu` + prompt `greeting` |
| `menu_presented` | `menu` + prompt `menu` |
| `collecting` | `collecting` + campo/interpretação pendente |
| `awaiting_identity_choice` | prompt `branding_offer` |
| `awaiting_intent_confirmation` | decisão híbrida pendente |
| `awaiting_document_confirmation` | `awaiting_confirmation` + resumo válido |
| `processing_document` | job e marcador de processamento sob lock |
| `pdf_processing` | documento confirmado, antes do resultado do storage |
| `completed` | `confirmed` + continuidade terminal |
| `cancelled` | `cancelled` |
| `error_recoverable` | `error` ou resultado confirmado com falha de PDF |

Não se cria migration apenas para renomear esses estados.

## Mapa da mensagem real

| Ordem | Responsabilidade e fonte de verdade | Entrada | Saída/estado |
|---|---|---|---|
| 1 | Webhook em `app/api/webhooks/whatsapp/route.ts` | payload assinado | eventos normalizados para processamento assíncrono |
| 2 | `parseWhatsAppWebhook` e adapter | payload Meta | evento e inbound normalizado |
| 3 | `claim` | WAMID + organização | job único; duplicata encerrada |
| 4 | `acquire_channel_lock` | conversa organizacional | exclusão mútua ou deferimento |
| 5 | `processWhatsAppEvent` | contato e contexto | conversa, rascunho, documento e coleção recuperados |
| 6 | `resolveGlobalNavigation` | texto | comando global ou continuidade da precedência |
| 7 | `resolveActivePrompt` | texto/ID e prompt atual | uma opção contextual ou nenhuma |
| 8 | detecção de interrupção/mensagem composta | texto + fluxo ativo | intenção/entidades preservadas |
| 9 | `resolveMenuInput` | texto + menu atual | ação de menu somente quando aplicável |
| 10 | `orchestrateHybrid` | texto, estado e contexto | decisão, desambiguação ou rota autorizada |
| 11 | `extractEntities`/`applyEntitiesToAgentDraft` | mensagem completa | entidades com proveniência e rascunho atualizado |
| 12 | `runAgentTurn` | ação, texto e rascunho | próxima pergunta, resumo ou confirmação |
| 13 | `buildAgentReviewSummary` | rascunho validado | snapshot, texto, hash e horário |
| 14 | `createAgentDraft`/`confirmAgentDocument` | confirmação válida | documento idempotente e número único |
| 15 | `generateStoredDocumentPdf` | documento confirmado | PDF privado reutilizável ou erro diferenciado |
| 16 | `buildAgentWhatsAppOutputs`/adapter | resultado terminal | texto, PDF e continuidade enviados em ordem |
| 17 | persistência da conversa/job | resultado final | estado e prompt terminal atualizados; lock liberado |

## Fluxo dourado de orçamento

Saudação, abertura conversacional, mensagem composta, extração integral, transparência do entendimento, uma única desambiguação necessária, perguntas apenas dos campos faltantes, resumo integral, confirmação explícita, criação idempotente, PDF persistido, resultado terminal e continuidade.

A frase canônica é: “Faça um orçamento para a empresa Alfa de instalação de três câmeras por R$ 3.800, pagamento à vista e validade de 7 dias.” O valor deve ser desambiguado entre total e unitário sem perder cliente, serviço, quantidade, pagamento ou validade.

## Baseline comercial 2026-08-06

Identificador documental interno: `lume-whatsapp-commercial-baseline-2026-08-06`. A versão conversacional é `2026-08-commercial-baseline-v3` e o resumo é `commercial-summary-v2`. O checkpoint final executou 46 arquivos e 410 testes. O registro não é tag ou commit Git. A baseline foi aprovada por testes automatizados; confirmação pelo WhatsApp real permanece obrigatória.
# Autoridade conversacional

A autoridade conversacional da Lume é a combinação `Lume Agent + TaskState canônico`. Estado serve à conversa; menu e botão são interface; PDF é ferramenta; banco é memória. A Lume deve reduzir informações e decisões exigidas sem assumir como verdadeiro o que não consegue verificar.
