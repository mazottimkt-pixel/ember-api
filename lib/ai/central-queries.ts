import type { SupabaseClient } from "@supabase/supabase-js";

export type CentralQueryContext = {
  supabase: SupabaseClient;
  organizationId: string;
};
const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

export async function centralReadOnlyReply(
  ctx: CentralQueryContext,
  text: string,
): Promise<string | null> {
  const input = normalize(text);
  if (input.includes("valor em negociacao"))
    return "Valor em negociação é a soma dos orçamentos em rascunho ou aguardando confirmação no período selecionado.";
  if (
    input.includes("consultar clientes") ||
    input.includes("consultar fornecedores")
  ) {
    const supplier = input.includes("fornecedores");
    const { data, error } = await ctx.supabase
      .from("business_contacts")
      .select("legal_name")
      .eq("organization_id", ctx.organizationId)
      .eq(supplier ? "is_supplier" : "is_customer", true)
      .eq("active", true)
      .is("deleted_at", null)
      .order("legal_name")
      .limit(5);
    if (error) throw new Error("CENTRAL_CONTACT_QUERY_FAILED");
    if (!data?.length)
      return `Não há ${supplier ? "fornecedores" : "clientes"} ativos cadastrados.`;
    return `${supplier ? "Fornecedores" : "Clientes"} ativos (até 5):\n${data.map((row) => `• ${row.legal_name}`).join("\n")}`;
  }
  if (input.includes("consultar catalogo")) {
    const { data, error } = await ctx.supabase
      .from("catalog_items")
      .select("name,kind,unit_price")
      .eq("organization_id", ctx.organizationId)
      .eq("active", true)
      .is("deleted_at", null)
      .order("name")
      .limit(5);
    if (error) throw new Error("CENTRAL_CATALOG_QUERY_FAILED");
    if (!data?.length) return "Não há produtos ou serviços ativos no catálogo.";
    return `Catálogo ativo (até 5):\n${data.map((row) => `• ${row.name} — ${row.kind === "service" ? "serviço" : "produto"}`).join("\n")}`;
  }
  if (
    input.includes("consultar ordens") ||
    input.includes("consultar operacoes") ||
    input.includes("preencher checklist") ||
    input.includes("consultar relatorio")
  ) {
    const type = input.includes("ordens")
      ? "service_order"
      : input.includes("checklist")
        ? "checklist"
        : input.includes("relatorio")
          ? "service_report"
          : null;
    let query = ctx.supabase
      .from("operational_documents")
      .select("number,title,type,status")
      .eq("organization_id", ctx.organizationId)
      .is("deleted_at", null);
    if (type) query = query.eq("type", type);
    const { data, error } = await query
      .order("created_at", { ascending: false })
      .limit(5);
    if (error) throw new Error("CENTRAL_OPERATION_QUERY_FAILED");
    if (!data?.length) return "Não há operações correspondentes cadastradas.";
    return `Operações recentes (até 5):\n${data.map((row) => `• ${row.number} — ${row.title} [${row.status}]`).join("\n")}\n\nAbra Operações no painel para executar ações críticas.`;
  }
  if (
    input.includes("criar ordem de servico") ||
    input.includes("criar relatorio")
  )
    return "O formulário operacional está disponível em Operações → Nova operação. A Central não cria o documento sem todos os dados e a confirmação explícita.";
  if (
    [
      "criar post",
      "criar legenda",
      "criar roteiro",
      "criar imagem",
      "criar campanha",
    ].some((command) => input.includes(command))
  )
    return "O módulo Conteúdo está disponível no painel em Conteúdo → Criar conteúdo. A geração usa o perfil da marca e exige seus dados antes de executar; imagens requerem confirmação explícita.";
  if (input.includes("ver conteudos")) {
    const { data, error } = await ctx.supabase
      .from("content_projects")
      .select("type,objective,status")
      .eq("organization_id", ctx.organizationId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(5);
    if (error) throw new Error("CENTRAL_CONTENT_QUERY_FAILED");
    return data?.length
      ? `Conteúdos recentes:\n${data.map((row) => `• ${row.objective || row.type} [${row.status}]`).join("\n")}`
      : "Ainda não há projetos de conteúdo.";
  }
  return null;
}
