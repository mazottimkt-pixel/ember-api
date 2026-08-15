# TaskStateV1

`TaskStateV1` contém `id`, `version`, `type`, `status`, `collectedData`, `missingData`, `ambiguities`, `currentQuestion`, `confirmation`, `toolExecution`, `revision`, `provenance` e timestamps.

`confirmation` contém task/revision, snapshot apresentado, fingerprint e timestamps. `toolExecution` possui ferramenta registrada, requestId estável, estados de execução e referência do resultado. Interrupções guardam a pergunta de retomada dentro da própria tarefa.

Invariantes:

- uma tarefa e uma pergunta canônicas;
- `currentQuestion.taskId` e `revision` devem coincidir com a tarefa;
- correções incrementam a revisão e invalidam confirmação anterior;
- pagamento não pode ser descrição de item;
- cálculo é sempre refeito pelo domínio;
- patches fora do escopo da pergunta são rejeitados;
- inferência não equivale a fato confirmado.

O estado vive inicialmente em `conversations.context.collection.taskStateV1`; não exige migration.
