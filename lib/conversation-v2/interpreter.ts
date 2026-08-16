import { extractCnpj } from "@/lib/domain/cnpj";
import { parseItemBundle, parseDeadlineAnswer, paymentOnlyUpdate, parseExplicitCorrection } from "@/lib/ai/contextual-understanding";
import { interpretationV2Schema, statePatchV2Schema, type InterpretationV2, type StatePatchV2 } from "./contracts";
import type { ConversationStateV2 } from "./schema";

const normalize=(value:string)=>value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("pt-BR").trim();
const provenance=(path:string,value:unknown,confidence=.99)=>({op:"set" as const,path:path as "draft.party",value,source:"user_current_message" as const,confidence});
export function interpretInboundV2(state:ConversationStateV2,text:string):{interpretation:InterpretationV2;patch:StatePatchV2}{const n=normalize(text),evidence=[text],operations:StatePatchV2["operations"]=[];let intent:InterpretationV2["intent"]="continue_task",switchIntent:InterpretationV2["switchIntent"]=null,interruptionIntent:InterpretationV2["interruptionIntent"]=null,correction:InterpretationV2["correction"]=null;
  if(state.activeTask.type==="none"&&/\b(?:orcamento|cotacao)\b/.test(n))intent="start_quote";
  else if(state.activeTask.type==="none"&&/\bpedido de compra\b/.test(n))intent="start_purchase_order";
  else if(/\b(?:cancelar|desistir)\b/.test(n)&&!/\b(?:orcamento|pedido de compra)\b/.test(n))intent="cancel";
  else if(/\bpedido de compra\b/.test(n)&&state.activeTask.type==="quote"){intent="switch_task";switchIntent="purchase_order";}
  else if(/\borcamento\b/.test(n)&&state.activeTask.type==="purchase_order"){intent="switch_task";switchIntent="quote";}
  else if(/\b(?:ultimo pedido|cnpj da minha empresa|qual foi meu)\b/.test(n)){intent="interrupt";interruptionIntent="administrative_query";}
  else if(/\b(?:continuar|retomar)\b/.test(n)&&state.interruption)intent="resume";
  else if(/^(?:sim|pode emitir|confirmar|confirmo)$/.test(n))intent="confirm";
  const expected=state.interaction?.expectedInput;
  if(expected==="counterparty"&&intent==="continue_task"&&text.trim().length>=2)operations.push(provenance("draft.party",{name:text.trim(),role:state.activeTask.type==="purchase_order"?"supplier":"client",source:"ad_hoc"}));
  if(expected==="tax_id"&&state.draft.party){try{const taxId=extractCnpj(text);if(taxId)operations.push(provenance("draft.party",{...state.draft.party,taxId}));}catch{/* invalid identifiers remain interpretation-only */}}
  if(expected==="item_bundle"){const item=parseItemBundle(text);if(item)operations.push({op:"set",path:"draft.items",value:[{description:item.description,quantity:item.quantity,unit:"un",unitPrice:item.unitPrice,discount:0,itemType:item.itemType}],source:"user_current_message",confidence:.99});}
  if(expected==="delivery_deadline"){const deadline=parseDeadlineAnswer(text);if(deadline)operations.push({op:"set",path:"draft.deadline",value:deadline,source:"user_current_message",confidence:.99});}
  if(expected==="payment"){const payment=paymentOnlyUpdate(text);if(payment)operations.push({op:"set",path:"draft.payment",value:payment,source:"user_current_message",confidence:.99});}
  if(expected==="validity"&&/^\d+\s+dias?$/i.test(text.trim()))operations.push({op:"set",path:"draft.validity",value:text.trim(),source:"user_current_message",confidence:.99});
  if(expected==="address"&&text.trim().length>=5)operations.push({op:"set",path:"draft.address",value:text.trim(),source:"user_current_message",confidence:.99});
  if(expected==="correction"){const parsed=parseExplicitCorrection(text);if(parsed){const mapping={item:"draft.items",quantity:"draft.items",payment:"draft.payment",deadline:"draft.deadline",counterparty:"draft.party"} as const;correction={field:mapping[parsed.target],value:parsed};intent="correct";}}
  return{interpretation:interpretationV2Schema.parse({intent,entities:{},correction,interruptionIntent,switchIntent,confidence:operations.length||intent!=="continue_task"?.99:.5,rawEvidence:evidence}),patch:statePatchV2Schema.parse({baseRevision:state.revision,operations})};}
