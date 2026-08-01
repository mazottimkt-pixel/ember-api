# Arquitetura

## Canais e agente

Lume é a assistente comercial inteligente da Ember. Entradas de canal são convertidas para `NormalizedInbound` e respostas para `NormalizedOutbound`. Agent Lab e WhatsApp Cloud API usam a mesma máquina de estados e ferramentas autorizadas. O adapter oficial valida allowlist, assinatura, mídia e erros sanitizados; credenciais permanecem exclusivamente no servidor.

`ChannelMessageProcessor` aplica claim persistente por identificador externo, lock por organização e conversa, estados `received`, `processing`, `responded` e `failed`, retry somente recuperável e fallback humano. `whatsapp_channels` vincula Phone Number ID à organização sem armazenar token ou segredo. Trocas são lógicas, preservam o canal anterior e mantêm referência transacional de rollback.

O motor de estado e as ferramentas continuam independentes do canal. Adapters apenas normalizam entrada e saída; eles não gravam documentos nem acessam diretamente as ferramentas comerciais.

## Camada de inteligência artificial

`lib/ai` separa contratos, provider e ferramentas autorizadas. O provider OpenAI usa exclusivamente a Responses API com Structured Outputs e `store: false`; o áudio usa o endpoint de transcrição. O modelo nunca recebe um cliente Supabase e nunca executa mutações. A rota autenticada `/api/agent` valida entrada e saída, aplica rate limiting, deduplica por chave idempotente, persiste estado e mensagens e registra auditoria sem payload comercial.

Estados persistidos: `menu` → `collecting` → `awaiting_confirmation` → `confirmed`, com saídas `cancelled` e `error`. Somente a ação explícita `confirm` pode criar e confirmar o documento; as regras do servidor voltam a validar organização, contato, itens, totais e status.

## Contatos e documentos

O painel usa uma única entidade `business_contacts`. O formulário filtra o mesmo conjunto pelo papel necessário: cliente para orçamento e fornecedor para pedido de compra. O servidor repete essa validação antes de persistir e grava um snapshot completo no documento.

Rascunhos novos recebem uma chave idempotente exclusiva. A chave de armazenamento local inclui o UUID do rascunho, impedindo que um orçamento anterior seja reutilizado ao iniciar um pedido. Server Actions retornam resultados tipados para o componente cliente; navegação não é mais tratada como exceção de erro.

O PDF é regenerado sob autenticação, usa dados persistidos da organização, contraparte e responsável, valida datas ISO em faixa razoável e apresenta datas em `DD/MM/AAAA`.

O Next.js 16 (App Router) concentra painel e backend-for-frontend. Server Components fazem leitura; Route Handlers recebem webhooks e geram arquivos; qualquer mutação deve autenticar, autorizar e validar novamente no servidor. Supabase fornece Auth, PostgreSQL com RLS e Storage privado.

O domínio em `lib/domain` não depende de UI ou banco. Integrações em `lib/ai`, `lib/pdf` e `lib/whatsapp` usam limites explícitos: a IA retorna dados não confiáveis, Zod valida, regras calculam e apenas então um rascunho pode ser persistido. A transição para definitivo exige `confirmed_at` e `confirmed_by`.

Fluxo: webhook validado → deduplicação por `whatsapp_message_id` → identificação do membro/organização → intenção/transcrição → extração validada → perguntas faltantes → resumo → confirmação explícita → transação de documento → PDF → Storage privado → envio oficial → evento/auditoria.

Não registrar payloads brutos, tokens, áudio ou dados comerciais em logs de aplicação. Service role é exclusiva para workers confiáveis e nunca chega ao navegador.
