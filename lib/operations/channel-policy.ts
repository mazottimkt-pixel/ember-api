export const operationalChannelPolicy = {
  panel: { enabled: true, mutations: true },
  central: { enabled: true, mutations: "explicit_confirmation_only" as const },
  whatsapp: {
    enabled: false,
    featureFlag: "WHATSAPP_OPERATIONAL_FLOWS_ENABLED",
    reason: "Aguardando homologação local dos fluxos operacionais",
  },
} as const;
