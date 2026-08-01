# Piloto controlado do WhatsApp

O piloto exige `WHATSAPP_PILOT_AUTHORIZATION=AUTORIZO_PILOTO_WHATSAPP_EMBER` e `npm run whatsapp:dev` ativo. `npm run whatsapp:pilot` cria estado local supervisionado; não inicia mensagens automaticamente.

## Bateria única

1. Consultar novo número.
2. Validar webhook GET.
3. Receber texto real.
4. Validar assinatura POST.
5. Validar organização/canal.
6. Validar fila e lock.
7. Responder texto pela Lume.
8. Observar `sent/delivered/read/failed`.
9. Validar deduplicação.
10. Receber e transcrever áudio.
11. Corrigir dados na conversa.
12. Confirmar por botão.
13. Criar orçamento.
14. Criar pedido de compra.
15. Gerar e enviar PDF.
16. Cancelar.
17. Acionar fallback humano.
18. Validar isolamento multiempresa.
19. Recuperar após reinício.
20. Validar dry-run de retorno ao canal anterior.

Cada etapa registra apenas IDs mascarados, HTTP, status, latência, tokens/custo e erro sanitizado. Interrompa na primeira falha de assinatura, allowlist, RLS, idempotência ou confirmação explícita.
