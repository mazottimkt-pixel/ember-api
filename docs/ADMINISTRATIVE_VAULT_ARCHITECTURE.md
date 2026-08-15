# Arquitetura do Cofre Administrativo

Fluxo: webhook normalizado → claim/lock → download oficial da mídia → validação de limite/MIME/assinatura → SHA-256 → deduplicação organizacional → bucket privado `administrative-vault` → metadados em `administrative_files` → auditoria → classificação determinística → indexação posterior.

A busca determinística cobre título, filename, categoria e texto extraído. Um resultado gera URL assinada de 300 segundos; múltiplos resultados criam um prompt numérico consumível. O filtro `organization_id` é obrigatório em leitura, escrita e assinatura.

Estados `pending`, `completed`, `failed` e `stored_not_indexed` permitem armazenar e reenviar mesmo quando extração falha. OCR e busca semântica não são dependências do MVP.
