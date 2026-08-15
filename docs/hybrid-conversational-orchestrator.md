# Orquestrador conversacional híbrido

O orquestrador complementa menus e nunca substitui as validações dos serviços. Ele produz `OrchestratorDecision`, validado por Zod, contendo intenção, confiança, entidades com proveniência, campos faltantes, alternativas, confirmação, proposta de ferramenta e códigos de razão. Texto apresentado e execução permanecem separados.

## Rollout

- Central: ativa quando `CENTRAL_HYBRID_ORCHESTRATOR_ENABLED` está ausente ou diferente de `false`.
- WhatsApp: desativado quando `WHATSAPP_HYBRID_ORCHESTRATOR_ENABLED` está ausente ou diferente de `true`.
- Para homologação futura do WhatsApp, configurar `WHATSAPP_HYBRID_ORCHESTRATOR_ENABLED=true` no ambiente do servidor. Não editar `.env.local` para testes automatizados.
- Rollback imediato: remover a variável ou defini-la como `false`.

Comandos globais continuam sendo resolvidos antes do orquestrador. Menus e números continuam válidos em ambos os modos.

## Segurança

O registry de intenções define disponibilidade, área, campos, risco, confirmação, feature flag e ferramenta. O registry de ferramentas contém somente IDs permitidos e schemas. O modelo ou o texto do usuário não pode fornecer nomes arbitrários de funções.

Padrões de tentativa de alterar permissões, ignorar confirmação, acessar outra organização, revelar prompt ou executar função escondida produzem uma decisão `blocked`. Logs guardam somente metadados sanitizados.

## Contexto

O JSON da conversa guarda no máximo um fluxo pausado, a decisão pendente, entidades recentes, última intenção e última pergunta. Mudança de assunto não mistura rascunhos. Retomada precisa ser explícita. Não foi necessária migration.

## Limitações atuais

- A classificação automatizada é determinística e local; o schema está preparado para provider estruturado futuro, mas nenhum classificador pago foi acionado.
- Extração inicial cobre cliente, quantidade, descrição, valor, pagamento, datas relativas simples, número de documento e período. Correções complexas continuam no parser comercial existente.
- A flag do WhatsApp permanece desligada até teste manual em ambiente controlado.
- Operações críticas e conteúdo por WhatsApp continuam obedecendo suas flags próprias e não são liberados pelo orquestrador.
