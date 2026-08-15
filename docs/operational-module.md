# Módulo Operacional Integrado da Lume

## Arquitetura

O módulo operacional é separado das tabelas comerciais para preservar `quote`, `purchase_order`, seus enums, cálculos, hashes, numeração, PDFs e idempotência. O registry comum publica as capacidades habilitadas. `operational_documents` representa ordem, checklist e relatório; tabelas auxiliares representam itens, modelos, evidências, eventos e sequências.

Vínculos opcionais conectam orçamento comercial (`source_document_id`), ordem (`service_order_id`) e checklist (`checklist_id`). Dados de cliente e local são snapshots: alterações cadastrais posteriores não reescrevem o histórico. `request_id` é único por organização.

## Tipos e ciclos

- Ordem de serviço: exige título, descrição compreensível, cliente, local, responsável e prioridade. Estados: `draft → pending_approval → approved → scheduled → in_progress ↔ paused → completed`; rejeição e cancelamento somente nas transições registradas. Conclusão exige responsável, data e checklist concluído quando vinculado. Exceção exige justificativa e papel gestor.
- Checklist: independente ou ligado a uma ordem. Estados: `draft → in_progress → completed|completed_with_issues`; pode ser cancelado antes do terminal. Itens usam `pending`, `completed`, `not_applicable`, `non_compliant` ou `blocked`. Obrigatório pendente/bloqueado impede conclusão; não aplicável obrigatório exige observação; não conformidade resulta em conclusão com problemas.
- Relatório: modalidade `service` ou `inspection`, com prefixos `REL` e `VIS`. Estados: `draft → under_review → ready_for_acceptance → accepted → completed`. Retorno de revisão é explícito. Conteúdo terminal é imutável pelo guard do banco.

As sequências `OS`, `CHK`, `REL` e `VIS` são atômicas e multiempresa. A numeração só é reservada durante a criação idempotente, nunca ao abrir menu ou formulário.

## Aceite

O aceite operacional registra nome, papel/relação, data, canal, usuário autenticado, versão e fingerprint SHA-256 canônico. Exige confirmação explícita e papel gestor. Ele representa concordância operacional registrada no sistema; não é apresentado como assinatura eletrônica avançada nem como garantia jurídica universal.

## Evidências e anexos

Bucket privado `operational-evidence`, paths `${organization_id}/${document_id}/${uuid}.${ext}` e URLs assinadas de 15 minutos. Formatos: PNG, JPEG/JPG, WEBP e PDF. São validados MIME declarado, extensão, magic bytes, arquivo vazio, tamanho e vínculo organizacional. Limites: 10 MB por arquivo, 20 arquivos e 50 MB por operação. Binários não são persistidos no banco nem registrados em logs; eventos guardam apenas metadados sanitizados.

## PDFs

Há PDFs A4 específicos para ordem, checklist, relatório de serviço e vistoria, com cabeçalho, rodapé, página, textos longos e quebra automática. O endpoint autenticado não armazena/regenera PDFs comerciais existentes. Evidências são referenciadas; miniaturas não são incorporadas nesta versão para evitar decodificação insegura e aumento imprevisível do arquivo.

## Painel e mobile

`/operations` oferece filtros, busca, paginação, alertas resumidos e lista unificada. `/operations/new` cria os três tipos. `/operations/[id]` reúne resumo, transições válidas, checklist, evidências, aceite, PDF e linha do tempo. `/operations/templates` cria versões imutáveis de modelos e permite reutilizar seus itens. Em telas pequenas, tabelas operacionais viram cards e itens do checklist passam a uma coluna com controles grandes.

Alertas internos derivam dos dados: atraso usa `due_at < agora` e estado não terminal; ausência de responsável, checklist em andamento/com problemas, relatório pendente e aceite pendente são exibíveis sem automação externa.

## Central da Lume e WhatsApp

A Central apresenta as opções operacionais habilitadas, consulta dados reais da organização e encaminha criação ao formulário quando faltam dados. Mutação crítica não é executada por texto livre. Fluxos conversacionais completos de coleta e mutação foram deliberadamente mantidos fora da Central nesta versão; isso evita que o modelo invente execução, aceite, materiais ou evidências.

O WhatsApp permanece inalterado. `operationalChannelPolicy.whatsapp.enabled` é `false`; a flag documentada é `WHATSAPP_OPERATIONAL_FLOWS_ENABLED`, mas não é lida nem deve ser cadastrada ainda. A habilitação futura exige homologação local de contratos textuais, botões/listas, anexos, duplicatas, retries, retomada e confirmação. Nenhuma opção operacional aparece no menu real atual.

## Permissões e auditoria

Papéis existentes são reutilizados: `owner/admin` equivalem a gestor, `sales` a operacional e `viewer` a leitura. Gestores aprovam, concluem, cancelam e aceitam; operacional cria, inicia, pausa, retoma, preenche checklist e cria relatório; viewer apenas consulta. RLS aplica isolamento multiempresa em todas as tabelas e no bucket. Guards no banco impedem transições inválidas, edição de conteúdo terminal e alteração de item após conclusão.

Eventos e audit log cobrem criação, mudança de estado, item de checklist, evidência, aceite e modelo. PDF é gerado sob demanda e não cria duplicidade persistida. Exclusão permanece lógica nos registros que possuem `deleted_at`.

## Limitações e próximos passos

- Conversão automática de orçamento confirmado em ordem: schema e vínculo estão prontos, mas não há botão até ser homologada a cópia idempotente de snapshots.
- Equipe, medições, equipamentos e recorrência permanecem em `content`/especificação, sem automação dedicada.
- Não há assinatura jurídica, captura de IP, notificações externas ou marketplace de modelos.
- A Central consulta e orienta, mas criação conversacional multietapa e transições críticas permanecem desabilitadas.
- Upload associa evidência ao documento; seleção direta de item do checklist pela interface será uma evolução posterior, embora o backend já aceite `itemId` validado.

## Rollback

As migrations são aditivas. Os scripts em `supabase/rollbacks/202608050001_operational_module.rollback.sql` e `202608050002_operational_guards.rollback.sql` documentam a reversão. O rollback do módulo remove dados operacionais e, por isso, só deve ser executado após exportação e autorização explícita; não foi executado nesta entrega.
