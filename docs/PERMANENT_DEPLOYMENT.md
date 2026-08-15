# Deployment permanente da Lume

## Decisão

- `RECOMMENDED_PROVIDER=Railway`
- `RECOMMENDED_PLAN=Hobby` para homologação e primeiros clientes; migrar para Pro quando suporte, retenção de logs e disponibilidade comercial justificarem.
- `WEB_SERVICE_COMMAND=npm run start:production`
- `WORKER_REQUIRED=false` no primeiro deployment.
- `LUME_AGENT_V1_ENABLED=false` no primeiro deployment.

O runtime atual recebe o webhook, persiste jobs e mensagens no Supabase, usa lock com lease no banco e processa os eventos no mesmo serviço Next.js por `after()`. Não existe consumidor contínuo independente. Criar um worker agora exigiria um protocolo adicional de claim/recovery e poderia duplicar processamento. Se volume ou latência tornarem isso necessário, o próximo passo é extrair um consumidor do `channel_message_jobs`, preservando Supabase como fila e fonte de verdade; não adicionar Redis por padrão.

## Topologia inicial

Um serviço Railway always-on executa Next.js, páginas, APIs, webhook, processor, geração de PDF e outbound. Supabase continua responsável por PostgreSQL, RLS, jobs, locks e Storage. OpenAI e Meta permanecem externos.

O filesystem do container é efêmero e não é fonte de verdade. `.next` contém somente artefatos de build. PDFs, logos, anexos operacionais, conteúdo e arquivos do Cofre são gravados no Supabase Storage; metadados, conversas, TaskState, jobs, locks e idempotency keys ficam no Supabase DB.

## Domínios

- Fase A: `https://<serviço>.up.railway.app/api/webhooks/whatsapp`.
- Fase B: `https://api.<domínio-real-da-lume>/api/webhooks/whatsapp`.

O domínio Railway é HTTPS e estável entre deploys enquanto o serviço existir. Não inventar nem configurar domínio próprio antes da definição empresarial e do DNS.

## Health checks

- `/api/health/live`: processo HTTP vivo; não consulta dependências.
- `/api/health/ready`: valida configuração obrigatória e uma consulta barata ao Supabase; é o health check de deploy.
- `/api/health/webhook`: confirma que os quatro parâmetros server-side do canal estão configurados, sem acessar Meta.
- `/api/webhooks/whatsapp`: o GET real valida verify token e o POST real exige assinatura Meta.

OpenAI e Graph API não participam de probes simples. Railway usa o readiness somente durante o deploy; para monitoramento contínuo deve-se configurar posteriormente um monitor HTTP externo.

## Variáveis de ambiente

### Obrigatórias em produção

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` — somente server-side
- `OPENAI_API_KEY` — somente server-side
- `OPENAI_TEXT_MODEL`
- `OPENAI_TRANSCRIPTION_MODEL`
- `WHATSAPP_VERIFY_TOKEN` — somente server-side
- `WHATSAPP_ACCESS_TOKEN` — somente server-side
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_BUSINESS_ACCOUNT_ID`
- `META_APP_SECRET` — somente server-side
- `APP_URL` — domínio público permanente do serviço
- `NODE_ENV=production`
- `LUME_AGENT_V1_ENABLED=false`

`PORT` é injetada pela Railway. Não fixar um valor na plataforma.

### Opcionais

- `WHATSAPP_API_VERSION`
- `OPENAI_MAX_OUTPUT_TOKENS`
- `OPENAI_TIMEOUT_MS`
- `OPENAI_MAX_AUDIO_BYTES`
- `WHATSAPP_MAX_AUDIO_BYTES`
- `LUME_FILE_MAX_SIZE_MB`
- `LUME_FILE_RETENTION_DAYS`
- `LUME_ORGANIZATION_STORAGE_LIMIT_MB`
- `CONTENT_FAILURE_COOLDOWN_MINUTES`
- `CONTENT_FAILURES_BEFORE_COOLDOWN`
- `CONTENT_MAX_CONSECUTIVE_REGENERATIONS`
- `CONTENT_MAX_GENERATIONS_PER_ORG_HOUR`
- `CONTENT_MAX_GENERATIONS_PER_SESSION`
- `CONTENT_MAX_GENERATIONS_PER_USER_HOUR`
- `OPENAI_IMAGE_MODEL`
- `HYBRID_HIGH_CONFIDENCE`
- `HYBRID_MEDIUM_CONFIDENCE`

### Feature flags de produção

- `LUME_TASK_STATE_V1_ENABLED=false`
- `LUME_AGENT_V1_ENABLED=false`
- `CENTRAL_HYBRID_ORCHESTRATOR_ENABLED`
- `WHATSAPP_HYBRID_ORCHESTRATOR_ENABLED`
- `WHATSAPP_CONTENT_FLOWS_ENABLED`
- `WHATSAPP_OPERATIONAL_FLOWS_ENABLED`
- `WHATSAPP_INBOUND_ONLY=false`

### Desenvolvimento/homologação controlada apenas

- `WHATSAPP_TEST_RECIPIENT`
- `META_APP_ID`
- `WHATSAPP_NEW_PHONE_NUMBER_ID`
- `WHATSAPP_NEW_BUSINESS_ACCOUNT_ID`
- `WHATSAPP_NEW_TEST_RECIPIENT`
- `WHATSAPP_PILOT_AUTHORIZATION`
- `SUPABASE_DB_URL` — scripts administrativos locais, não runtime Web

Nunca registrar valores reais em Git, logs ou documentação.

## Persistência e recuperação

O WAMID e o `request_id` impedem criação lógica duplicada; documentos, PDFs e outbound possuem checkpoints persistidos. Locks têm lease no Supabase. Um restart durante `after()` pode deixar um job em `processing`; antes de extrair um worker, a operação deve detectar e recuperar jobs expirados de forma controlada. Essa é uma limitação conhecida do deployment de serviço único, não uma razão para duplicar banco ou fila.

## Segurança operacional

- Meta POST exige `X-Hub-Signature-256`.
- Service role fica apenas no servidor.
- Consultas e mutações filtram `organization_id`; RLS permanece ativa para usuários.
- Buckets críticos devem permanecer privados; downloads usam signed URLs curtas.
- Logs devem usar request/job ID, taskId, versão do agente, tool, duração, status e somente sufixo mascarado do WAMID.
- Não registrar telefone completo, tokens, payload textual sensível ou binários.
- O proxy de túnel local não faz parte do deployment permanente.

## Deploy e rollback

1. Criar um projeto Railway e um único serviço a partir do repositório.
2. Selecionar plano Hobby e região adequada ao MVP.
3. Cadastrar os secrets no serviço, mantendo Agent V1 desligado.
4. Confirmar `railway.json`, build e readiness.
5. Gerar domínio Railway e testar live, ready, webhook health, handshake e POST assinado.
6. Só então substituir manualmente a Callback URL na Meta.
7. Validar inbound e outbound com o número homologador autorizado.
8. Rollback: restaurar o deployment anterior na Railway; se o domínio permanecer igual, a Meta não muda. Se necessário, manter a Callback anterior até a nova homologação terminar.

Após contratar, o Codex pode instalar/usar a CLI autorizada, criar o projeto/serviço, cadastrar configuração não secreta, orientar a inclusão segura dos secrets, acompanhar build/logs e executar probes. Ações humanas mínimas: criar/autorizar a conta Railway, escolher o plano, fornecer os secrets pelo painel seguro e, após a validação, alterar a Callback URL na Meta.
