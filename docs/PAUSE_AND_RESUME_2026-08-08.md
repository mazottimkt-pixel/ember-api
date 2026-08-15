# Pausa e retomada — 08/08/2026

## Estado exato

Baseline documental interna: `lume-whatsapp-commercial-baseline-2026-08-06`. Conversação `2026-08-commercial-baseline-v3`; resumo `commercial-summary-v2`; checkpoint: 46 arquivos e 410 testes aprovados. Orçamento e pedido de compra preservam confirmação explícita, hash canônico, `request_id` determinístico, numeração, idempotência, PDF privado e nova sessão. Billing e trial não foram iniciados.

O teste real de 06/08 às 13:42 BRT chegou ao webhook e percorreu coleta e resumo. O job `d4de2bbb***b426` falhou com `DRAFT_CREATE_FAILED`. Não houve documento, arquivo ou PDF. A sequência de pedido avançou; a lacuna não deve ser reutilizada. A causa foi a ausência da coluna `documents.branding_snapshot` em uma aplicação parcial da identidade visual. A migration reparadora foi aplicada com retorno de sucesso.

## Homologado no WhatsApp real

- recebimento e processamento da frase de pedido;
- coleta de prazo, endereço e decisão/CNPJ;
- entrega e leitura dos outbounds até a confirmação;
- exibição das ações de confirmação na versão anterior.

Não considerar homologados no WhatsApp real: nova desambiguação de preço, resumo v2, criação após reparação, persistência/envio do PDF, recuperação do prompt v3, personalização v2 e novas consultas. Esses pontos passaram somente por testes automatizados.

## Correções desta rodada

- preço ambíguo preserva fornecedor, item limpo, quantidade, preço e pagamento;
- 1 = unitário; 2 = total; cálculo ocorre somente depois da resposta;
- confirmação legada retorna à desambiguação;
- resumo integral contém o snapshot efetivo e as três opções;
- telefone identificado não contamina endereço; CEP e texto bruto do endereço são preservados;
- CNPJ normalizado integra resumo/hash/snapshot e PDF usa `document_number`;
- falha de criação e falha de PDF possuem respostas e retries distintos;
- inbound que falha passa a `processing_status=failed` com código sanitizado;
- `documents.branding_snapshot` foi reparado por migration aditiva.

## Ambiente

- projeto: `C:\Users\mathe\Projetos\ember-api`;
- Next esperado: porta 3000;
- proxy esperado: porta 3100;
- última callback conhecida (agora inacessível): `https://proudly-gentle-korea-frog.trycloudflare.com/api/webhooks/whatsapp`;
- `.whatsapp-dev-url` está ausente porque o supervisor removeu corretamente a URL obsoleta; uma nova URL deve ser criada pelo Codex na retomada;
- processos necessários: um supervisor `whatsapp-dev`, um Next, um proxy e um `cloudflared`;
- `next.config.ts` limita builds a um CPU para evitar workers órfãos e pressão de memória; typecheck continua obrigatório e não foi desabilitado;
- não reiniciar túnel saudável; quick tunnel pode trocar de URL após reinício.

## Banco, migrations e buckets

Migrations operacionais `202608050001` a `202608050004` e Cofre `202608060001` já constavam aplicadas. Nesta rodada foi aplicada `202608060002_commercial_branding_snapshot_repair.sql`, com rollback documentado. A migration original de branding não constava no ledger, embora `document_branding_versions` existisse; não tentar reaplicá-la integralmente sem nova inspeção.

Buckets privados relevantes: `documents`, `organization-assets`, `administrative-vault`, `operational-pdfs` e `content-assets`, conforme os módulos instalados. Nenhuma URL pública permanente deve substituir URL assinada.

Variáveis necessárias, sem valores: `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_VERIFY_TOKEN`, `META_APP_SECRET`, `META_APP_ID`, `WHATSAPP_API_VERSION`, `WHATSAPP_TEST_RECIPIENT`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`. Não editar `.env.local` na retomada sem diagnóstico explícito.

## Limitações e riscos

- o fluxo v3 ainda precisa de um teste real autorizado;
- a lacuna de numeração causada pelo rollback natural do `INSERT` não deve ser corrigida manualmente;
- a conversa real ainda guarda histórico v2; o código deve conduzi-la à pergunta de escopo;
- uma segunda consulta remota pós-migration não foi executada por limite da ferramenta, embora a aplicação inicial tenha retornado sucesso;
- o sandbox confirmou Next, proxy e POST assinado, mas bloqueou a chamada do `cloudflared` à API externa; a tentativa autorizada fora do sandbox foi recusada pelo limite de uso até 08/08/2026 10:19 BRT;
- não iniciar billing, trial ou produção nacional nesta retomada.

## Checklist de retomada pelo Codex

1. Entrar no projeto e ler Constituição, estado, questões ativas e este documento.
2. Inspecionar somente processos deste projeto e manter uma instância de cada componente.
3. Encerrar somente as instâncias locais órfãs identificadas deste projeto e executar `npm run whatsapp:dev`; o túnel precisa ser recriado porque não há URL vigente.
4. Executar `npm run whatsapp:dev:check` e confirmar a URL em `.whatsapp-dev-url`; informar a única alteração manual de Callback URL, sem alterar Meta.
5. Executar os testes específicos comerciais e do processor antes de qualquer teste real.
6. Confirmar por leitura que `documents.branding_snapshot` existe e que `202608060002_commercial_branding_snapshot_repair.sql` está no ledger.
7. Com autorização explícita para teste real, usar a conversa existente e responder à pergunta de escopo; não repetir a confirmação antiga.
8. Verificar documento único, número, arquivo único, job, outbounds e status; mascarar dados no relatório.

## Próximo teste manual exato

Na conversa autorizada, enviar uma nova intenção completa: “Crie um pedido de compra para a empresa alfa de 20 cadeiras por 250 reais pagamento à vista”. Confirmar que a Lume pergunta unitário/total. Responder `1`, completar prazo, endereço e CNPJ opcional, conferir o resumo integral e somente então responder `1` para confirmar. Validar um documento, um número, um PDF e uma única entrega. Esta documentação não autoriza o Codex a enviar a mensagem.

## Go / no-go

Go para nova homologação controlada se o quick tunnel for recriado, o health check integral passar, os testes específicos, processor, PDF, idempotência, typecheck e lint permanecerem verdes, e a coluna reparada estiver confirmada. No-go para teste real enquanto `.whatsapp-dev-url` estiver ausente; também é no-go se houver HTTP 500, prompt v2 reaproveitado, preço sem escopo, resumo ausente, duplicidade, PDF sem registro ou alteração de callback não refletida manualmente na Meta.

Próximo pacote recomendado: homologação real v3 e observabilidade do ciclo documento/PDF. Billing permanece fora do escopo.
