import "server-only";

import { loadDashboardData } from "@/lib/dashboard/metrics";
import type { AgentToolContext } from "@/lib/ai/tools";
import type { MenuAction } from "@/lib/navigation/menu-engine";

const money = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);

const empty = "Nenhum registro encontrado nos últimos 30 dias.";

export async function handleWhatsAppMenuQuery(
  ctx: AgentToolContext,
  action: MenuAction,
): Promise<string | null> {
  const operationPeriod = action === "search_operations_7d" ? "7d" : action === "search_operations_month" ? "month" : "30d";
  if (
    [
      "query_confirmed_values",
      "search_purchase_orders",
      "query_documents_attention",
      "search_operations",
      "search_operations_7d",
      "search_operations_30d",
      "search_operations_month",
      "query_management_summary",
    ].includes(action)
  ) {
    const data = await loadDashboardData(ctx.supabase, ctx.organizationId, operationPeriod);
    const commercial = data.metrics;
    const operational = data.operationalMetrics;
    if (action === "query_confirmed_values")
      return commercial.confirmedQuoteCount
        ? `Últimos 30 dias:\n\n• ${commercial.confirmedQuoteCount} orçamento(s) confirmado(s)\n• Valor confirmado: ${money(commercial.confirmedQuoteValue)}`
        : empty;
    if (action === "search_purchase_orders")
      return commercial.purchaseOrderCount
        ? `Últimos 30 dias:\n\n• ${commercial.purchaseOrderCount} pedido(s) de compra\n• Valor total: ${money(commercial.purchaseOrderTotal)}\n• ${commercial.pendingPurchaseOrderCount} pendente(s)`
        : empty;
    if (action === "query_documents_attention")
      return commercial.attention.length
        ? `${commercial.attention.length} documento(s) aguardam confirmação nos últimos 30 dias.`
        : "Nenhum documento exige atenção nos últimos 30 dias.";
    if (["search_operations","search_operations_7d","search_operations_30d","search_operations_month"].includes(action))
      return operational&&operational.orderCount===0&&operational.inProgress===0&&operational.checklistsWithIssues===0&&operational.reportsPending===0
        ? "Ainda não existem operações registradas.\n\nOrdens de serviço, checklists e relatórios aparecerão aqui conforme forem criados."
        : operational
        ? `${operationPeriod === "7d" ? "Últimos 7 dias" : operationPeriod === "month" ? "Mês atual" : "Últimos 30 dias"}:\n\n• ${operational.orderCount} ordem(ns) de serviço\n• ${operational.inProgress} em andamento\n• ${operational.overdue} atrasada(s)\n• ${operational.checklistsWithIssues} checklist(s) com não conformidade\n• ${operational.reportsPending} relatório(s) pendente(s)`
        : "As métricas operacionais não estão disponíveis neste momento.";
    const hasManagementData=commercial.quoteCount+commercial.purchaseOrderCount+(operational?.orderCount??0)>0;
    if(action==="query_management_summary"&&!hasManagementData)return "Ainda não há informações suficientes para gerar um resumo gerencial.\n\nÀ medida que documentos, clientes, fornecedores e operações forem registrados, poderei apresentar indicadores como:\n\n• volume de documentos;\n• valores movimentados;\n• principais clientes e fornecedores;\n• atividades em andamento;\n• pendências.";
    return [
      "Resumo dos últimos 30 dias:",
      `• ${commercial.quoteCount} orçamento(s) criado(s)`,
      `• ${commercial.confirmedQuoteCount} orçamento(s) confirmado(s)`,
      `• ${money(commercial.negotiationValue)} em negociação`,
      `• ${commercial.purchaseOrderCount} pedido(s) de compra`,
      ...(operational
        ? [
            `• ${operational.inProgress} ordem(ns) em andamento`,
            `• ${operational.overdue + operational.checklistsWithIssues + operational.reportsPending} operação(ões) que exigem atenção`,
          ]
        : []),
    ].join("\n");
  }

  if (["query_customers", "query_suppliers", "query_catalog"].includes(action)) {
    const contacts = action !== "query_catalog";
    const query = contacts
      ? ctx.supabase
          .from("business_contacts")
          .select("legal_name,is_customer,is_supplier")
          .eq("organization_id", ctx.organizationId)
          .is("deleted_at", null)
          .eq(action === "query_customers" ? "is_customer" : "is_supplier", true)
          .order("legal_name")
          .limit(10)
      : ctx.supabase
          .from("catalog_items")
          .select("name,kind")
          .eq("organization_id", ctx.organizationId)
          .is("deleted_at", null)
          .order("name")
          .limit(10);
    const { data, error } = await query;
    if (error) throw new Error("MENU_QUERY_FAILED");
    if (!data?.length) {
      if(action==="query_customers")return "Ainda não existem clientes registrados nesta empresa.\n\nEles aparecerão aqui conforme você criar documentos, cadastrar contatos ou salvar clientes utilizados nos atendimentos.";
      if(action==="query_suppliers")return "Ainda não existem fornecedores registrados.\n\nVocê pode utilizar fornecedores avulsos em pedidos sem precisar cadastrá-los.\n\nQuando um fornecedor for salvo no cadastro, ele aparecerá aqui.";
      return "Ainda não existem produtos ou serviços cadastrados.\n\nItens utilizados em documentos podem ser reutilizados quando forem salvos no catálogo.";
    }
    return `${contacts ? (action === "query_customers" ? "Clientes" : "Fornecedores") : "Produtos e serviços"}:\n\n${data
      .map((row) => `• ${"legal_name" in row ? row.legal_name : row.name}`)
      .join("\n")}\n\nMostrando até 10 registros.`;
  }
  if(action==="query_documents"){
    const result=await ctx.supabase.from("documents").select("number,type,status,total,created_at,counterparty_snapshot").eq("organization_id",ctx.organizationId).is("deleted_at",null).order("created_at",{ascending:false}).limit(10);
    if(result.error)throw new Error("MENU_QUERY_FAILED");
    if(!result.data?.length)return "Ainda não existem documentos criados nesta empresa.\n\nQuando você gerar orçamentos, pedidos ou outros documentos, poderá consultá-los aqui por tipo, número, cliente, fornecedor ou data.";
    return `Documentos recentes:\n\n${result.data.map(row=>`• ${row.number} — ${row.type==="purchase_order"?"Pedido de compra":"Orçamento"} — ${row.status}`).join("\n")}\n\nMostrando até 10 registros.`;
  }
  return null;
}
