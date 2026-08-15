# Navegação WhatsApp e Conteúdo e Marketing

## Navegação

`lib/navigation/menu-engine.ts` centraliza menus, itens, disponibilidade, equivalentes textuais, destinos e versão. O contexto existente da conversa persiste `current_menu`, `previous_menu`, `pending_menu_action`, `menu_version` e `last_menu_presented_at`; nenhuma migration de conversa foi necessária.

O menu principal usa fallback textual numerado porque reply buttons aceitam apenas três opções. Números são resolvidos exclusivamente dentro do menu atual. IDs ou labels atrasados de outro submenu não são aceitos. Voltar, Menu principal, Início e Cancelar são globais. A versão `2026-08-content-v1` impede estado híbrido.

Toda consulta passa por `renderNavigableResponse`, que persiste as ações exibidas em `continuation_actions`. Assim, números apresentados após uma consulta são resolvidos antes dos números do submenu. Sucesso, vazio, erro recuperável, conclusão e cancelamento recebem saídas coerentes para repetir, voltar, abrir o menu principal ou falar com a Lume. Consultas operacionais também permitem escolher últimos 7 dias, últimos 30 dias ou mês atual.

Comandos globais são normalizados antes da coleta de campos e incluem variações naturais de Menu principal, Voltar, Falar com a Lume e Cancelar. `safePreviousMenu` evita falha quando um menu antigo deixa de existir. `validateMenuGraph` audita destinos, ações e saídas de todos os submenus nos testes.

Comercial reutiliza os fluxos existentes de orçamento, pedido de compra e consulta. Operacional expõe somente consulta; mutações continuam no painel. Financeiro usa apenas documentos reais. Conteúdo informa que os fluxos criativos estão no painel: ações de geração pelo WhatsApp permanecem ocultas até homologação. Falar com a Lume é orientação, não atendimento humano.

## Conteúdo

As tabelas `content_brand_profiles`, `content_projects` e `content_images` são isoladas por organização com RLS. O bucket `content-assets` é privado. Projetos usam estados `draft`, `generating`, `ready_for_review`, `approved`, `archived`, `failed` e `cancelled`; não existe `published`.

O painel `/content` lista projetos; `/content/new` gera post, legenda, roteiro de Reels, Stories, campanha, ideias ou calendário; `/content/brand` salva segmento, público, tom, CTA, cores, estilo e redes; `/content/[id]` revisa, aprova, arquiva e permite geração de imagem explicitamente confirmada.

O provider reutiliza `OPENAI_API_KEY` somente no servidor. Texto usa `OPENAI_TEXT_MODEL` ou o default existente. Imagem usa `OPENAI_IMAGE_MODEL` ou `gpt-image-1`. A geração é idempotente por `request_id`; retry reutiliza o resultado. Imagens vão ao Storage, nunca ao banco em base64. Logo e textos comerciais não são redesenhados pelo modelo; composição controlada de logo/texto fica como próxima evolução.

## Segurança e custos

Briefings são validados, moderados e limitados. O prompt proíbe preço, desconto, urgência, alcance ou publicação inventados. Geração de imagem exige confirmação manual no painel. Testes usam domínio/provider mockável e não chamam a API. A feature reservada `WHATSAPP_CONTENT_FLOWS_ENABLED` não deve ser cadastrada antes da homologação de envio de imagem, retry, legenda e duplicidade.

## Limitações

- Não há publicação em redes sociais, credenciais do Instagram, métrica de alcance ou status publicado.
- Geração textual e de imagem no WhatsApp permanece desabilitada.
- Composição final de logo e texto sobre a imagem ainda não foi implementada.
- Duplicação e download direto no painel ficam para a próxima iteração; Storage e URL assinada estão preparados no serviço.
- Contrato, recibo, cobrança e cotação permanecem planejados.

## Pacote de fechamento

O renderer `visual-renderer.ts` compõe SVG determinístico no servidor, com formatos quadrado, vertical, Story, capa de Reels e horizontal. Os templates Minimalista, Promocional e Editorial preservam proporção da logo, aplicam área segura e escolhem texto claro ou escuro por contraste. Texto acima do limite é rejeitado, nunca truncado silenciosamente. A imagem-base usa corte central `slice`; a logo usa `meet`.

Projetos podem ser duplicados ou versionados sem reaproveitar `request_id`, arquivados/restaurados e suas imagens são baixadas por uma rota autenticada que emite URL assinada de 15 minutos. A Central conduz objetivo, assunto, público e tom, mostra resumo e exige Confirmar; imagem continua remetida ao painel para confirmação explícita de custo.

O adapter aceita contrato de imagem e foi homologado somente com mocks. A flag `WHATSAPP_CONTENT_FLOWS_ENABLED` ausente ou diferente de `true` mantém texto, imagem e envio desabilitados. Limites técnicos são configuráveis por `CONTENT_MAX_GENERATIONS_PER_SESSION`, `CONTENT_MAX_CONSECUTIVE_REGENERATIONS`, `CONTENT_MAX_GENERATIONS_PER_USER_HOUR`, `CONTENT_MAX_GENERATIONS_PER_ORG_HOUR`, `CONTENT_FAILURES_BEFORE_COOLDOWN` e `CONTENT_FAILURE_COOLDOWN_MINUTES`.

PDFs operacionais são persistidos no bucket privado `operational-pdfs`, versionados por hash e reutilizados quando o conteúdo não muda. A conversão de orçamento confirmado em ordem abre uma revisão, exige local e responsável e somente reserva numeração após a confirmação. O orçamento original permanece imutável e um índice impede conversão duplicada.
