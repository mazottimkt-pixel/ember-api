# Segurança

O MVP usa validação Zod, autenticação Supabase, RLS por organização, Storage privado, assinatura HMAC do webhook, idempotência por ID oficial, uploads limitados e mocks que não enviam dados. Nunca registre tokens, payloads comerciais completos ou dados sensíveis.

## Dependências

Em 29/07/2026, `npm audit --omit=dev` reportou três alertas altos transitivos em `postcss` e `sharp`, trazidos pelo Next.js 16.2.11. O audit sugeriu downgrade incompatível para Next 9.3.3; por isso a correção automática não foi aplicada. Reavaliar quando houver uma versão compatível corrigida do Next e antes de qualquer deploy.

## Relato

Não publique vulnerabilidades. Envie um relato privado ao proprietário com reprodução, impacto e versão afetada.
