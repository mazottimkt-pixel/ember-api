# Decisões técnicas

1. Next.js 16 App Router e `proxy.ts`, conforme documentação local instalada.
2. Supabase Auth + PostgreSQL RLS como barreira principal de tenant; autorização também no servidor.
3. Zod na fronteira HTTP/IA; o modelo nunca escreve diretamente no banco.
4. Valores calculados em centavos na aplicação e armazenados como `numeric(14,2)`.
5. PDFs com `pdf-lib`, serviço puro e reutilizável, seguidos de Storage privado.
6. Integrações externas atrás de interfaces; mocks falham de forma explícita.
7. Documento definitivo somente após confirmação explícita registrada com usuário e horário.
