# WhatsApp Business Platform — configuração segura

O Ember usa exclusivamente a WhatsApp Business Platform Cloud API oficial. Não há automação de WhatsApp Web.

Referências oficiais: [WhatsApp Business Platform](https://developers.facebook.com/docs/whatsapp/), [Cloud API](https://developers.facebook.com/docs/whatsapp/cloud-api/get-started/), [Embedded Signup](https://developers.facebook.com/docs/whatsapp/embedded-signup/) e [onboarding de usuários do Business App](https://developers.facebook.com/docs/whatsapp/embedded-signup/custom-flows/onboarding-business-app-users/).

> A interface e a elegibilidade da Meta mudam. Confirme no painel atual se coexistência é oferecida; nunca trate migração como coexistência por suposição.

## Ambiente local

Execute `npm run whatsapp:dev`. O supervisor limpa somente o cache gerado `.next`, inicia Next.js em `127.0.0.1:3000`, o proxy restrito em `127.0.0.1:3100`, valida um POST local assinado e só então abre o Cloudflare Tunnel para `3100`. O painel web não é exposto.

O ambiente só fica pronto após validar aplicação, proxy, POST assinado, URL pública e GET público com HTTP 200 e challenge exato. A Callback URL aparece no terminal e em `.whatsapp-dev-url` enquanto o processo estiver ativo. Quick Tunnels geram nova URL; atualize a Meta manualmente.

## Caminho A — coexistência (preferencial)

Use somente quando o painel oferecer explicitamente conectar um número que permanece no WhatsApp Business App.

- O número continua utilizável no Business App.
- A Cloud API é vinculada pelo fluxo oficial de onboarding/coexistência.
- QR Code, confirmação no aplicativo, SMS/ligação e permissões são etapas manuais.
- Histórico sincronizado, dispositivos e recursos dependem das condições exibidas pela Meta; o Ember não presume importação integral.

### Checklist manual literal

- [ ] Confirmar que o Business App funciona no telefone principal.
- [ ] Fazer backup pelas opções do aplicativo.
- [ ] Confirmar acesso administrativo ao portfólio, aplicativo Meta e WABA corretos.
- [ ] Abrir o aplicativo correto em Meta for Developers e o produto WhatsApp.
- [ ] Abrir Embedded Signup/adicionar número.
- [ ] Procurar texto explícito como **conectar o WhatsApp Business App** ou **coexistência**.
- [ ] Confirmar que o painel mostra o número brasileiro parcialmente mascarado esperado.
- [ ] Ler impactos sobre histórico, dispositivos e recursos.

**PARE AQUI se a Meta não mencionar coexistência. Não migre, remova nem desconecte.**

- [ ] Prosseguir manualmente apenas no caminho identificado como coexistência.
- [ ] Concluir QR Code, confirmação no aplicativo, SMS ou ligação sem compartilhar códigos.
- [ ] Confirmar no aplicativo que a sessão permaneceu ativa.
- [ ] Copiar localmente o novo Phone Number ID e a WABA exibida.
- [ ] Confirmar WABA inscrita no aplicativo atual e campo `messages` assinado.
- [ ] Não disparar mensagens pelo Ember.
- [ ] Executar primeiro o dry-run descrito em [WHATSAPP_CHANNEL_SWITCH.md](./WHATSAPP_CHANNEL_SWITCH.md).

## Caminho B — migração completa

O número deixa o Business App e passa a operar exclusivamente pela Cloud API. Há risco de indisponibilidade, perda de recursos/sessões e limitações de histórico. Antes, confirme backup, política de histórico, desconexão exigida, janela de validação, dispositivos vinculados e rollback. O Codex não deve iniciar esse caminho sem autorização específica.

## Webhook

1. Inicie `npm run whatsapp:dev`.
2. Copie a Callback URL exibida.
3. Informe-a manualmente em **WhatsApp > Configuração > Webhook**.
4. Use o mesmo `WHATSAPP_VERIFY_TOKEN` local.
5. Verifique, salve e assine `messages`.

Nunca compartilhe tokens, segredos, chaves, código SMS, ligação, QR Code, payload real, áudio, documento, número completo ou `.env.local`.
