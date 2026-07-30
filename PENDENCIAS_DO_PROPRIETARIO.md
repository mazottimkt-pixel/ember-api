# Pendências do proprietário

Nenhuma pendência do proprietário bloqueia o painel local. Conexão, migrations, proprietário, organização, RLS, Storage, dados de demonstração e fluxo de documentos foram validados no ambiente de desenvolvimento.

## OpenAI — necessário para ativar o agente

- `OPENAI_API_KEY`
- `OPENAI_TEXT_MODEL`
- `OPENAI_TRANSCRIPTION_MODEL`

Defaults recomendados: `gpt-4o-mini` e `gpt-4o-mini-transcribe`. A disponibilidade é conferida para a conta antes do uso; o sistema não lista o catálogo completo em logs ou no cliente.

Sem `OPENAI_API_KEY`, o `/agent-lab` usa fallback local e a transcrição fica indisponível.

## Futuro — não conectar agora

- Meta/WhatsApp.
- Domínio e publicação.
- Identidade visual definitiva e textos jurídicos.
- Regras comerciais padrão e política de retenção/auditoria.
