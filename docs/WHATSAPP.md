# Integração oficial do WhatsApp

Use exclusivamente WhatsApp Cloud API. Configure na Meta o callback `https://SEU_DOMINIO/api/webhooks/whatsapp`, o verify token e o App Secret. `GET` responde ao challenge; `POST` exige `X-Hub-Signature-256`. A implementação não envia mensagens reais sem `WHATSAPP_ACCESS_TOKEN`.

Variáveis: `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID` e `META_APP_SECRET`. Para áudio, baixar a mídia somente após validar o webhook, impor limite/tipo, transcrever e apagar temporários. O ID oficial da mensagem é a chave idempotente. Responder rapidamente ao webhook e mover trabalho pesado para fila é obrigatório antes de produção.
