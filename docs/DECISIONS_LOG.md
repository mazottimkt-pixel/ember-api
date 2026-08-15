# Registro de decisões

## 2026-08-12 — modelo de agente administrativo pessoal

A unidade conversacional passa a ser a tarefa administrativa derivada do estado/draft já existente. Não foi criada segunda state machine. Saudação não apresenta menu; menus aparecem sob solicitação. Botões representam decisões fechadas, listas representam quatro ou mais alternativas e ambos conservam fallback textual.

O primeiro documento usa o modelo padrão sem bloquear a execução. Personalização é sugestão pós-valor, no máximo uma vez no resultado relevante. Pesquisa externa é uma ferramenta injetável, limitada a fontes HTTPS e nunca transforma resultado em fato confirmado automaticamente. Contratos permanecem reconhecidos, mas indisponíveis até existirem schema, validação jurídica operacional, renderer e PDF seguros.

## 2026-08-06 — prompts e readiness

Uma mensagem possui um único conjunto numérico; número executa somente opção visível; prompt é consumido uma vez; navegação invalida prompt anterior; processamento só aparece após readiness.

## 2026-08-06 — contraparte

Cadastro e CNPJ são opcionais. Documentos usam snapshot `registered` ou `ad_hoc`; PDF não depende de `contact_id`.

## 2026-08-06 — Cofre Administrativo

Arquivos são privados e isolados por organização. Busca tenta arquivo e informação textual. O MVP tem limites, não aceita vídeo/ZIP/executável, não compartilha publicamente e não apaga automaticamente. O Cofre integra a proposta de secretaria executiva da Lume.

## 2026-08-06 — correções da homologação real v2 (superada parcialmente)

Pedidos de compra interpretam empresa como fornecedor, “pedido de compra” como intenção e o segmento quantitativo como item. Prazo de pedido usa entrega; pagamento à vista independe de acento. Personalização sempre persiste uma saída e retoma o fluxo. Consultas visíveis sempre possuem handler e estado vazio. A decisão antiga que tratava “20 cadeiras por 250 reais” como unitário foi revogada pela baseline v3.

## 2026-08-06 — baseline comercial v3

Preço com quantidade e sem “cada” ou “total” exige desambiguação: 1 é unitário e 2 é total. O item financeiro só é materializado depois da resposta. Confirmações v2 são invalidadas; rascunho legado sem escopo retorna à pergunta, preservando os demais campos.

O resumo integral e as ações Confirmar/Corrigir/Cancelar são uma única saída lógica. O anúncio de processamento exige resumo/hash, contraparte, CNPJ decidido, preço resolvido e campos obrigatórios. Falha anterior à criação informa que nenhum documento foi gerado; falha do PDF preserva número e oferece retry apenas do PDF.

A aplicação parcial da identidade visual deixou `documents.branding_snapshot` ausente e causou `DRAFT_CREATE_FAILED`. A reparação é aditiva, idempotente e registrada em `202608060002_commercial_branding_snapshot_repair.sql`; o número já consumido permanece como lacuna auditável.
# 2026-08-12 — Motor conversacional Agent V1

Decidido substituir incrementalmente as autoridades conversacionais concorrentes por `Lume Agent + TaskStateV1`, preservando domínio, tools e infraestrutura. O rollout começa em shadow sob flags e sem duplicar efeitos.
