export const MENU_VERSION = "2026-08-homologation-v2";
export type MenuId =
  | "main"
  | "commercial"
  | "operations"
  | "finance_documents"
  | "content_marketing"
  | "management_queries"
  | "talk";
export type MenuAction =
  | "show_main"
  | "show_commercial"
  | "show_operations"
  | "show_finance"
  | "show_content"
  | "show_management"
  | "talk_to_lume"
  | "create_quote"
  | "create_purchase_order"
  | "search_document"
  | "search_operations"
  | "query_confirmed_values"
  | "search_purchase_orders"
  | "query_documents_attention"
  | "query_customers"
  | "query_suppliers"
  | "query_catalog"
  | "query_documents"
  | "query_management_summary"
  | "create_content"
  | "choose_operations_period"
  | "search_operations_7d"
  | "search_operations_30d"
  | "search_operations_month"
  | "back"
  | "cancel";
export type MenuNavigationState = {
  current_menu: MenuId;
  previous_menu?: MenuId;
  pending_menu_action?: MenuAction;
  menu_version: string;
  last_menu_presented_at: string;
  continuation_actions?: Array<{ action: MenuAction; label: string }>;
};
type Item = {
  id: string;
  label: string;
  action: MenuAction;
  equivalents: string[];
  available: boolean;
};
type Menu = {
  id: MenuId;
  title: string;
  description?: string;
  items: Item[];
  comingSoon?: string;
};
const item = (
  id: string,
  label: string,
  action: MenuAction,
  equivalents: string[],
  available = true,
): Item => ({ id, label, action, equivalents, available });
export const menus: Record<MenuId, Menu> = {
  main: {
    id: "main",
    title: "Menu de soluções",
    description: "Estas são as principais soluções disponíveis:",
    items: [
      item("menu_commercial", "Comercial", "show_commercial", ["comercial"]),
      item("menu_operations", "Operacional", "show_operations", [
        "operacional",
        "operacoes",
      ]),
      item(
        "menu_finance_documents",
        "Financeiro e documentos",
        "show_finance",
        ["financeiro", "documentos"],
      ),
      item("menu_content_marketing", "Conteúdo e marketing", "show_content", [
        "conteudo",
        "marketing",
        "criar post",
      ]),
      item("menu_management_queries", "Consultas e gestão", "show_management", [
        "consultas",
        "gestao",
      ]),
      item("talk_to_lume", "Falar com a Lume", "talk_to_lume", [
        "falar com a lume",
      ]),
    ],
  },
  commercial: {
    id: "commercial",
    title: "Como posso ajudar na área comercial?",
    items: [
      item("create_quote", "Criar orçamento", "create_quote", [
        "orcamento",
        "criar orcamento",
      ]),
      item(
        "create_purchase_order",
        "Criar pedido de compra",
        "create_purchase_order",
        ["pedido", "pedido de compra"],
      ),
      item(
        "search_commercial_documents",
        "Consultar documentos comerciais",
        "search_document",
        ["consultar documentos comerciais"],
      ),
      item("back_to_main_menu", "Voltar ao menu principal", "show_main", [
        "menu principal",
      ]),
    ],
    comingSoon:
      "Em breve: contratos, recibos, cobranças e cotações com fornecedores.",
  },
  operations: {
    id: "operations",
    title: "Como posso ajudar na operação da empresa?",
    items: [
      item("search_operations", "Consultar operações", "search_operations", [
        "consultar operacoes",
      ]),
      item("back_to_main_menu", "Voltar ao menu principal", "show_main", [
        "menu principal",
      ]),
    ],
    comingSoon:
      "Criação e transições operacionais pelo WhatsApp estão disponíveis no painel e aguardam homologação conversacional.",
  },
  finance_documents: {
    id: "finance_documents",
    title: "O que deseja consultar ou organizar?",
    items: [
      item("search_documents", "Consultar documentos", "search_document", [
        "consultar documentos",
      ]),
      item(
        "query_confirmed_values",
        "Consultar valores confirmados",
        "query_confirmed_values",
        ["valores confirmados"],
      ),
      item(
        "search_purchase_orders",
        "Consultar pedidos de compra",
        "search_purchase_orders",
        ["pedidos de compra"],
      ),
      item(
        "query_documents_attention",
        "Documentos que exigem atenção",
        "query_documents_attention",
        ["exigem atencao"],
      ),
      item("back_to_main_menu", "Voltar ao menu principal", "show_main", [
        "menu principal",
      ]),
    ],
    comingSoon: "Em breve: recibos, cobranças e acompanhamento financeiro.",
  },
  content_marketing: {
    id: "content_marketing",
    title: "Conteúdo e marketing está disponível no painel da Ember.",
    items: [
      item(
        "create_instagram_post",
        "Post para Instagram",
        "create_content",
        ["post", "instagram"],
        false,
      ),
      item("create_caption", "Legenda", "create_content", ["legenda"], false),
      item(
        "create_reels_script",
        "Roteiro para Reels",
        "create_content",
        ["reels"],
        false,
      ),
      item("create_stories", "Stories", "create_content", ["stories"], false),
      item(
        "create_campaign",
        "Campanha promocional",
        "create_content",
        ["campanha"],
        false,
      ),
      item(
        "content_ideas",
        "Ideias de conteúdo",
        "create_content",
        ["ideias"],
        false,
      ),
      item("back_to_main_menu", "Voltar ao menu principal", "show_main", [
        "menu principal",
      ]),
    ],
    comingSoon:
      "Os fluxos de criação e imagem pelo WhatsApp aguardam homologação. Nenhuma geração paga será iniciada aqui.",
  },
  management_queries: {
    id: "management_queries",
    title: "O que deseja consultar?",
    items: [
      item("query_customers", "Clientes", "query_customers", ["clientes"]),
      item("query_suppliers", "Fornecedores", "query_suppliers", [
        "fornecedores",
      ]),
      item("query_catalog", "Produtos e serviços", "query_catalog", [
        "catalogo",
        "produtos",
      ]),
      item("search_documents", "Documentos", "query_documents", ["documentos"]),
      item("search_operations", "Operações", "search_operations", [
        "operacoes",
      ]),
      item(
        "query_management_summary",
        "Resumo gerencial",
        "query_management_summary",
        ["resumo gerencial"],
      ),
      item("back_to_main_menu", "Voltar ao menu principal", "show_main", [
        "menu principal",
      ]),
    ],
  },
  talk: {
    id: "talk",
    title: "Pode me contar o que precisa.",
    description: "Vou identificar a área correta e orientar o próximo passo.",
    items: [
      item("back_to_main_menu", "Voltar ao menu principal", "show_main", [
        "menu principal",
      ]),
    ],
  },
};
const normalize = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
export function resolveGlobalNavigation(raw:string):MenuAction|undefined{const value=normalize(raw),has=(values:string[])=>values.map(normalize).includes(value);if(has(["menu principal","retornar ao menu principal","voltar ao menu principal","voltar ao menu","volta ao menu","retorne ao menu","retornar ao menu","ir ao menu","ir para o menu principal","quero o menu principal","mostra o menu principal","abre o menu principal","abrir o menu","volta para o inicio","voltar ao inicio","inicio","menu","menu de solucoes","solucoes","ver solucoes","mostrar solucoes","mostrar opcoes","quais sao as opcoes","o que voce faz","quero conhecer as funcionalidades","quero ver o menu","quero o menu","opcoes principais","voltar para as opcoes"]))return"show_main";if(has(["voltar","retorna","retornar","volte","voltar uma etapa","menu anterior","opcao anterior","voltar para tras","sair desta consulta"]))return"back";if(has(["falar com a lume","quero falar com a lume","preciso de ajuda","pode me ajudar","quero fazer outra coisa","preciso de outra coisa","tenho outra solicitacao","quero falar com a inteligencia artificial","nao sei qual opcao escolher","pode me ajudar com outra coisa"]))return"talk_to_lume";if(has(["cancelar","cancela","parar","sair","encerrar","desistir","nao quero continuar"]))return"cancel";}
export function renderMenu(id: MenuId) {
  const menu = menus[id];
  return [menu.title, menu.description, "Escolha uma opção na lista abaixo ou simplesmente me diga o que precisa.", menu.comingSoon]
    .filter(Boolean)
    .join("\n\n");
}
export function safePreviousMenu(value:unknown):MenuId{return typeof value==="string"&&value in menus?value as MenuId:"main";}
export function navigationState(
  current_menu: MenuId,
  previous_menu?: MenuId,
  pending_menu_action?: MenuAction,
): MenuNavigationState {
  return {
    current_menu,
    previous_menu,
    pending_menu_action,
    menu_version: MENU_VERSION,
    last_menu_presented_at: new Date().toISOString(),
  };
}
export function resolveMenuInput(
  raw: string,
  state?: Partial<MenuNavigationState>,
) {
  const value = normalize(raw), global = resolveGlobalNavigation(raw);
  if (global) return { action: global };
  const id =
      (state?.menu_version === MENU_VERSION ? state.current_menu : "main") ??
      "main",
    items = menus[id].items.filter((i) => i.available);
  const continuation = state?.menu_version === MENU_VERSION ? state.continuation_actions : undefined;
  const continued = /^\d+$/.test(value) ? continuation?.[Number(value)-1] : continuation?.find((item)=>normalize(item.label)===value);
  if (continued) return { action: continued.action, menuId: id };
  const numeric = /^\d+$/.test(value) ? items[Number(value) - 1] : undefined;
  if (numeric) return { action: numeric.action, item: numeric, menuId: id };
  for (const candidate of items)
    if (
      normalize(candidate.id) === value ||
      normalize(candidate.label) === value ||
      candidate.equivalents.some((e) => normalize(e) === value)
    )
      return { action: candidate.action, item: candidate, menuId: id };
  const direct: Record<string, MenuAction> = {
    "quero fazer um orcamento": "create_quote",
    "quero criar um post": "show_content",
    "preciso fazer uma vistoria": "show_operations",
  };
  return direct[value] ? { action: direct[value], menuId: id } : null;
}
export function destination(action: MenuAction): MenuId | undefined {
  return (
    {
      show_main: "main",
      show_commercial: "commercial",
      show_operations: "operations",
      show_finance: "finance_documents",
      show_content: "content_marketing",
      show_management: "management_queries",
      talk_to_lume: "talk",
    } as Partial<Record<MenuAction, MenuId>>
  )[action];
}
export function validateMenuGraph(){const ids=new Set(Object.keys(menus)),known=new Set<MenuAction>(["show_main","show_commercial","show_operations","show_finance","show_content","show_management","talk_to_lume","create_quote","create_purchase_order","search_document","search_operations","query_confirmed_values","search_purchase_orders","query_documents_attention","query_customers","query_suppliers","query_catalog","query_documents","query_management_summary","create_content","choose_operations_period","search_operations_7d","search_operations_30d","search_operations_month","back","cancel"]),errors:string[]=[];for(const menu of Object.values(menus)){if(menu.id!=="main"&&!menu.items.some(i=>i.available&&(i.action==="show_main"||i.action==="back")))errors.push(`${menu.id}:missing_exit`);for(const item of menu.items){if(!known.has(item.action))errors.push(`${menu.id}:${item.id}:unknown_action`);const target=destination(item.action);if(target&&!ids.has(target))errors.push(`${menu.id}:${item.id}:unknown_target`);}}return{valid:errors.length===0,errors};}
