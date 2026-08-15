# Invariantes de prompts do WhatsApp

Um prompt registra ID, versão, tipo, flow, menu/ação opcionais, opções visíveis, estado esperado, apresentação, expiração e consumo. Apenas o prompt atual, não consumido, não expirado e compatível com o estado resolve números. A resolução consome o prompt e a próxima saída o substitui ou o limpa.

Comandos globais textuais têm prioridade, cancelam contexto terminal obsoleto e não dependem de números invisíveis. Continuidade genérica não é anexada a uma resposta que já contém prompt contextual.

A versão vigente é `2026-08-commercial-baseline-v3`. Personalização possui prompts distintos para escolha, logo, template e aprovação. Um contexto em `menu` com prompt de menu não pode conservar `pendingField`, correção ou personalização de outro fluxo. Versão antiga, estado desconhecido ou prompt incompatível recupera para navegação segura no próximo inbound, preservando histórico e documentos.

No prompt `commercial_value_scope`, 1 significa valor de cada unidade e 2 significa valor total. Texto, IDs persistidos e parser devem manter essa ordem. Botão de confirmação de versão antiga não é executável. Pedido legado sem `amount_scope` volta à desambiguação e invalida o resumo anterior.
