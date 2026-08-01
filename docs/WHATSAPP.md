# Integração oficial do WhatsApp

A implementação usa exclusivamente a WhatsApp Cloud API oficial, com assinatura `X-Hub-Signature-256`, normalização, deduplicação, lock e fila persistente.

Consulte:

- [WHATSAPP_SETUP.md](./WHATSAPP_SETUP.md) para coexistência, migração e ambiente local;
- [WHATSAPP_CHANNEL_SWITCH.md](./WHATSAPP_CHANNEL_SWITCH.md) para dry-run, troca e rollback;
- [WHATSAPP_PILOT.md](./WHATSAPP_PILOT.md) para a bateria supervisionada.

O número brasileiro da Ember ainda não foi registrado na Cloud API. Nenhuma etapa automática pode desconectar o WhatsApp Business App.
