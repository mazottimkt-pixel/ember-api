# Lume Agent Architecture V1

## Objetivo

O Agent V1 transforma linguagem natural em uma decisão estruturada e em patches semânticos. Ele não grava banco, não escolhe SQL, não executa ferramentas e não devolve uma cópia livre do draft.

Fluxo: mensagem → decisão estruturada → patches → validador → `TaskStateV1` → tools determinísticas → adapter WhatsApp.

## Autoridade

`TaskStateV1` é a única representação nova da tarefa. Menus e botões apenas transportam ações associadas à tarefa e à revisão. Parsers de dinheiro, datas, pagamento e documentos permanecem determinísticos.

## Rollout

- `LUME_TASK_STATE_V1_ENABLED=true`: cria/persiste o estado canônico em paralelo.
- `LUME_AGENT_V1_ENABLED=true`: executa Agent V1 em shadow e registra divergências sanitizadas.
- Ausentes ou falsas: comportamento legado inalterado.

Nenhuma tool é executada pelo shadow.

## Processor V1

`lib/agent-v1/processor.ts` é o caminho exclusivo testável: decisão, patches, lifecycle, registry e renderer. Ele não importa menu, híbrido, `pendingField`, `expectedAnswer`, provider local ou bridge de aliases. Cada saída registra `legacyAuthorityInvoked=false`.
