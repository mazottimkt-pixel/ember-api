# Troca segura do canal WhatsApp

O script não registra números na Meta. Ele valida IDs já criados pelo fluxo oficial e só atualiza o vínculo local após confirmação.

Preencha localmente, sem enviar valores por chat:

```dotenv
META_APP_ID=
WHATSAPP_NEW_PHONE_NUMBER_ID=
WHATSAPP_NEW_BUSINESS_ACCOUNT_ID=
WHATSAPP_NEW_TEST_RECIPIENT=
```

## Dry-run

`npm run whatsapp:switch-channel`

Consulta Phone Number ID/WABA, confirma pertencimento, aplicativo inscrito, permissões e destinatário brasileiro. Mostra apenas IDs mascarados e não escreve no banco.

## Aplicar

`npm run whatsapp:switch-channel -- --apply`

Exige a frase `CONFIRMAR TROCA DO CANAL`. A transação desativa logicamente o canal anterior, preserva histórico/jobs/conversas/auditoria, ativa ou reutiliza o novo canal e registra rollback. Tokens e segredos não vão ao banco.

Depois, atualize manualmente `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID` e `WHATSAPP_TEST_RECIPIENT` com os valores validados e reinicie o supervisor.

## Rollback

Dry-run: `npm run whatsapp:switch-channel -- --rollback`

Aplicar: `npm run whatsapp:switch-channel -- --rollback --apply`

Exige `CONFIRMAR RETORNO DO CANAL`. Reativa o canal anterior sem apagar o novo canal ou qualquer histórico.
