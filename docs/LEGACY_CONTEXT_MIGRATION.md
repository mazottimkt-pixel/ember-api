# Legacy Context Migration

O mapper lê `draft`, `state` e `collection` antigos e classifica o contexto como `VALID`, `MIGRATABLE`, `STALE`, `CORRUPTED_RECOVERABLE` ou `CORRUPTED_FATAL`.

Estados recuperáveis são reconstruídos sem apagar histórico. O caso `description=vezes` remove somente o item contaminado, preserva dados seguros e normaliza `cartao` para a estrutura de pagamento. Cópias antigas (`summary`, `expectedAnswer`, `pendingField`, híbrido) são reportadas como conflito, mas não se tornam autoridade do estado novo.

Durante shadow, nenhuma tool é executada e o banco de negócio não é alterado. Rollback: desligar as flags; o motor legado continua disponível.
