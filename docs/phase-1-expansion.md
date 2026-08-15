# Fase 1 — expansão funcional e gerencial da Lume

## Base entregue

O registro em `lib/documents/registry.ts` é a fonte de capacidades documentais. Orçamento e pedido de compra estão habilitados e mantêm confirmação explícita, numeração apenas na criação idempotente, PDF e fluxos existentes. Os demais tipos estão registrados como `planned`; a interface não oferece ações que ainda não existem.

O painel calcula indicadores diretamente dos documentos da organização e do período (7 dias, 30 dias ou mês atual). Não há dados simulados. “Valor em negociação” soma orçamentos em `draft` e `awaiting_confirmation`; “valor confirmado” exige `confirmed_at` e estado confirmado/gerado/enviado.

## Especificações futuras

- Ordem de serviço: cliente, escopo, responsável, agenda, materiais, execução e aceite; estados rascunho, aguardando confirmação, confirmada, em execução, concluída e cancelada.
- Recibo: pagador, beneficiário, valor, referência e data; emissão somente após confirmação explícita, sem assumir liquidação bancária.
- Cobrança: devedor, vencimento, itens, instruções e status; integração financeira futura deve ser separada da emissão documental.
- Contrato: partes, objeto, vigência, cláusulas versionadas, aprovações e assinatura externa; nunca tratar confirmação conversacional como assinatura jurídica.
- Relatório de serviço/vistoria: vínculo opcional com ordem, evidências, ocorrências, responsáveis e aceite.
- Checklist: modelo versionado, itens obrigatórios, evidências e conclusão; contraparte opcional.
- Solicitação de compra: subfluxo de pedido de compra com estados `requested`, `under_review`, `approved`, `rejected`, `ordered`, `cancelled`; aprovação não cria pedido automaticamente sem comando idempotente.
- Recorrência: uma definição agenda ocorrências independentes; cada geração recebe seu próprio `request_id`, número e confirmação quando aplicável. Pausar a série não altera documentos já emitidos.
- Separação de canais: painel e WhatsApp compartilham serviços de domínio, registro e idempotência, mas mantêm adaptadores, sessões, mensagens e políticas de apresentação próprios.
- Central global Ember: escopo organizacional obrigatório, ferramentas allowlisted, autorização por ação, auditoria, confirmação de mutações críticas e respostas sem exposição de dados de outra organização.
- Cotação com fornecedores: requisição versionada, fornecedores convidados, propostas imutáveis por versão, mapa comparativo e aprovação antes da conversão em pedido.
- Vitrine: catálogo publicado por seleção explícita, preço/estoque com política própria, URL pública revogável e pedidos externos entrando como intenção não confirmada.

## Evolução de dados

Esta fase não exige migração. Quando os módulos planejados forem ativados, usar tabelas específicas para seus ciclos e referências ao documento comum; não ampliar enums em produção sem rollback, backfill e compatibilidade de leitura previamente definidos. Índices futuros devem começar por `(organization_id, created_at)`, estados abertos e chaves de vínculo usadas nas consultas reais.
