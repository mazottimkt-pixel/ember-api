export function normalizePaymentTerms(value: string | null) {
  if (!value) return value;
  const normalized = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").replace(/\s+/g, " ").trim();
  if (/^(?:(?:pagamento|em dinheiro|pix) )?a ?vista$/.test(normalized) || /^(?:pagamento )?(?:imediato|no ato)$/.test(normalized)) return "À vista";
  return value.trim();
}

export function parsePaymentTerms(value: string) {
  const normalized = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").replace(/\s+/g, " ").trim();
  if (/^(?:(?:pagamento|em dinheiro|pix) )?a ?vista$/.test(normalized) || /^(?:pagamento )?(?:imediato|no ato)$/.test(normalized)) return "À vista";
  if (/\b(?:pix|boleto|cartao)\b/.test(normalized) || /\b(?:\d+\s*x|\d+\s+vezes|parcelado|entrada|saldo)\b/.test(normalized)) return value.trim();
  return undefined;
}

export function parsePaymentDetails(value:string){const normalized=value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("pt-BR").replace(/\s+/g," ").trim(),installment=/\b(\d+)\s*(?:x|vezes?)\b/.exec(normalized),wordInstallment=/\b(?:em\s+)?(duas|tres)\s+vezes\b/.exec(normalized),installments=installment?Number(installment[1]):wordInstallment?.[1]==="duas"?2:wordInstallment?.[1]==="tres"?3:undefined,down=/\b(\d{1,3})%\s+(?:de\s+)?entrada\b/.exec(normalized);if(/\bcartao(?: de credito)?\b/.test(normalized)){const display=`Cartão de crédito${installments?` em ${installments} vezes`:""}`;return{method:"credit_card"as const,installments,display};}if(/\bpix\b/.test(normalized)){return{method:"pix"as const,installments:1,display:/a ?vista/.test(normalized)?"PIX à vista":"PIX"};}if(down&&/\b(?:restante|saldo)\b/.test(normalized)){return{method:"split_payment"as const,downPaymentPercent:Number(down[1]),balance:/entrega/.test(normalized)?"na entrega":"conforme informado",display:value.trim()};}if(/\bboleto\b/.test(normalized))return{method:"boleto"as const,installments,display:value.trim()};if(/\bdinheiro\b/.test(normalized))return{method:"cash"as const,installments:1,display:"Dinheiro à vista"};if(/^(?:a ?vista|avista|pagamento a ?vista)$/.test(normalized))return{method:"other"as const,installments:1,display:"À vista"};return undefined;}

export function isPaymentOnlyDescription(value:string){
 const normalized=value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("pt-BR").replace(/[^a-z0-9\s]/g," ").replace(/\s+/g," ").trim();
 return /^(?:vez|vezes|parcela|parcelas|cartao|cartao de credito|pix|boleto|dinheiro|entrada|a vista|avista)$/.test(normalized);
}
