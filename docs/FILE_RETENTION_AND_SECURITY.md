# Retenção e segurança de arquivos

Defaults: 10 MB por arquivo (`LUME_FILE_MAX_SIZE_MB`), 500 MB por organização (`LUME_ORGANIZATION_STORAGE_LIMIT_MB`) e 365 dias de referência (`LUME_FILE_RETENTION_DAYS`). A retenção não executa exclusão automática nesta fase.

Bucket privado, RLS por organização, service role somente no backend, paths derivados de organização/hash, filename sanitizado, SHA-256, MIME permitido, magic bytes para PDF/PNG/JPEG, URLs temporárias e exclusão lógica. Executáveis, ZIP e vídeo são rejeitados. Binários e dados pessoais não entram em logs.

Risco residual: não há antivírus complexo nem OCR de imagem automático; ampliar tipos exige revisão de segurança.
