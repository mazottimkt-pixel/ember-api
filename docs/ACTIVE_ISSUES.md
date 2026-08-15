# Questões ativas

- Selecionar e homologar provider confiável para `external_lookup`; nenhuma consulta externa real está ativa sem essa decisão/credencial.
- Projetar schema, cláusulas parametrizadas, avisos, renderer e revisão de risco antes de ativar contratos como documento de primeira classe.
- Homologar novamente reply buttons e list messages no número real autorizado. O contrato automatizado agora garante payload único, IDs semânticos e fallback somente após rejeição real; nenhum envio real foi feito nesta correção.
- Repetir no WhatsApp real o fluxo contextual lâmpadas → prazo → cartão 2x → validade → CNPJ → correção de item, confirmando que o ambiente público esteja saudável antes do teste.
- Homologar o payload corrigido `interactive/button` (`reply.title`) e os cenários pré-emissão padrão, logo e emissão sem logo. Os logs anteriores comprovam rejeição `META_REQUEST_REJECTED`, mas não preservaram o código Graph numérico; a instrumentação nova passa a registrá-lo sanitizadamente.

- Homologar com payloads reais, sem envio automatizado, o recebimento de DOCX/XLSX e a renovação de mídia da Meta.
- Implementar worker dedicado de extração TXT/PDF nativo e interface OCR sob demanda; arquivos já permanecem recuperáveis sem indexação.
- Avaliar antivírus gerenciado antes de ampliar tipos/tamanho.
- Acompanhar consumo real antes de alterar os defaults de 10 MB por arquivo e 500 MB por organização.
- Homologar no número autorizado a versão `2026-08-commercial-baseline-v3`, sem reutilizar o fluxo v2 como evidência. O teste deve começar pela conversa existente, resolver o escopo do preço, reapresentar o resumo v2 e confirmar uma única vez.
- Confirmar em teste real, sem automação de envio, que criação, persistência do PDF e entrega de mídia passam após a reparação de `documents.branding_snapshot`.
- Confirmar no WhatsApp real a separação de telefone/endereço e a presença do CNPJ mascarado no PDF; os testes automatizados já cobrem parsing e snapshot.
- Substituir o quick tunnel de homologação por endpoint HTTPS estável antes do lançamento; a URL local atual não é arquitetura de produção.
# Migração Agent V1

- TaskStateV1, validator, mapper legado, patches e shadow implementados.
- Autoridade do tráfego real permanece no motor legado até concluir confirmação, contraparte, Cofre e branding nos transcripts.
- `pendingField`, `expectedAnswer`, híbrido e menus ainda existem temporariamente para rollback.
- Confirmação, toolExecution idempotente, ações vinculadas e interrupção canônica estão implementadas no núcleo V1; ainda falta conectar o caminho exclusivo de autoridade ao processor e concluir branding/interfaces antes de ativação.
- O processor V1 isolado e o renderer estão implementados e afirmam `legacyAuthorityInvoked=false`. O corte no processor WhatsApp permanece bloqueado até contraparte/CNPJ, persistência+PDF e branding formarem transações recuperáveis no registry.
