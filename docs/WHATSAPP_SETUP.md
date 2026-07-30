# Configuração do WhatsApp de teste

Este guia configura somente o ambiente de teste da WhatsApp Business Platform Cloud API oficial. O Ember não usa WhatsApp Web.

## 1. Criar o aplicativo

1. Acesse [Meta for Developers](https://developers.facebook.com/apps/) e entre com sua conta.
2. Clique em **Criar aplicativo**.
3. Se a tela perguntar o caso de uso, escolha **Outro** e depois **Empresa**. A Meta pode alterar os nomes dessa tela.
4. Informe um nome, e-mail de contato e selecione ou crie um portfólio empresarial de teste.
5. No painel do aplicativo, localize **WhatsApp** e clique em **Configurar**.

## 2. Anotar os identificadores de teste

Abra **WhatsApp > Configuração da API**. Copie apenas para o `.env.local`:

- **Token de acesso temporário** → `WHATSAPP_ACCESS_TOKEN`;
- **ID do número de telefone** → `WHATSAPP_PHONE_NUMBER_ID`;
- **ID da conta do WhatsApp Business** → `WHATSAPP_BUSINESS_ACCOUNT_ID`.

Em **Configurações > Básico**, use o segredo do aplicativo em `META_APP_SECRET`. Nunca envie esses valores por chat, e-mail, captura de tela ou commit.

## 3. Adicionar o telefone destinatário

1. Ainda em **Configuração da API**, vá a **Para** e escolha **Gerenciar lista de números de telefone**.
2. Adicione seu celular com DDI e DDD.
3. Digite no painel o código recebido no celular.
4. Use **Enviar mensagem** para enviar o template de teste fornecido pela Meta. Isso valida o número sem usar o Ember.

## 4. Expor o webhook local com HTTPS

O servidor local deve estar em execução e acessível por uma URL HTTPS pública. Use um túnel confiável, como Cloudflare Tunnel ou ngrok, apontando para `http://localhost:3000`. Não publique o painel inteiro como ambiente de produção.

A URL de callback será:

`https://SEU-ENDERECO-HTTPS/api/webhooks/whatsapp`

## 5. Configurar a verificação

1. Crie localmente uma frase longa e aleatória para `WHATSAPP_VERIFY_TOKEN`.
2. Em **WhatsApp > Configuração > Webhook**, clique em **Editar**.
3. Cole a URL de callback.
4. Cole exatamente a mesma frase no campo **Token de verificação**.
5. Clique em **Verificar e salvar**.
6. Assine o campo/evento **messages**. Ele inclui mensagens recebidas e atualizações de envio, entrega e leitura.

Configure `WHATSAPP_API_VERSION` com uma versão da Graph API disponível no painel do aplicativo, por exemplo no formato `vNN.0`. Reinicie o servidor após alterar o `.env.local`.

## 6. Primeiro teste pelo Ember

Cadastre no banco o vínculo entre o `WHATSAPP_PHONE_NUMBER_ID` de teste e a organização. Envie uma mensagem do telefone destinatário para o número de teste. A Lume responderá pelo mesmo motor do `/agent-lab`. Documentos definitivos continuam exigindo o botão **Confirmar**.

## 7. Substituir o token temporário

O token da tela de teste expira. Posteriormente, crie um usuário de sistema no Gerenciador de Negócios, conceda somente os ativos e permissões necessários ao WhatsApp e gere um token duradouro. Troque apenas `WHATSAPP_ACCESS_TOKEN` no ambiente seguro e reinicie o servidor. Não coloque tokens em arquivos versionados.

## Nunca compartilhe

- token de acesso;
- segredo do aplicativo;
- token de verificação;
- chaves OpenAI ou Supabase;
- conteúdo de mensagens, áudios ou documentos reais em tickets e logs.

O webhook rejeita assinaturas inválidas, processa por fila após responder à Meta e não guarda o áudio permanentemente.
