# Pendências do proprietário

Nenhuma pendência do proprietário bloqueia o painel local. Conexão, migrations, proprietário, organização, RLS, Storage, dados de demonstração e fluxo de documentos foram validados no ambiente de desenvolvimento.

## OpenAI — necessário para ativar o agente

- `OPENAI_API_KEY`
- `OPENAI_TEXT_MODEL`
- `OPENAI_TRANSCRIPTION_MODEL`

Defaults recomendados: `gpt-4o-mini` e `gpt-4o-mini-transcribe`. A disponibilidade é conferida para a conta antes do uso; o sistema não lista o catálogo completo em logs ou no cliente.

Sem `OPENAI_API_KEY`, o `/agent-lab` usa fallback local e a transcrição fica indisponível.

## WhatsApp — próxima etapa manual

- Confirmar no painel da Meta se o número brasileiro é elegível ao fluxo oficial de coexistência.
- Concluir pessoalmente qualquer QR Code, SMS, ligação ou confirmação no WhatsApp Business App.
- Preencher localmente `META_APP_ID`, `WHATSAPP_NEW_PHONE_NUMBER_ID`, `WHATSAPP_NEW_BUSINESS_ACCOUNT_ID` e `WHATSAPP_NEW_TEST_RECIPIENT` após o onboarding.
- Executar e revisar `npm run whatsapp:switch-channel` antes de autorizar `--apply`.
- Autorizar o piloto somente depois da troca validada.

## Futuro

- Domínio e publicação.
- Identidade visual definitiva e textos jurídicos.
- Regras comerciais padrão e política de retenção/auditoria.
