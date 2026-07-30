import Link from "next/link";
import { requireMembership } from "@/lib/auth/session";
export default async function Demo() {
  const { supabase } = await requireMembership();
  const [
    { count: customers },
    { count: suppliers },
    { count: catalog },
    { count: quotes },
    { count: orders },
    { count: pdfs },
  ] = await Promise.all([
    supabase
      .from("business_contacts")
      .select("id", { head: true, count: "exact" })
      .eq("is_customer", true)
      .is("deleted_at", null),
    supabase
      .from("business_contacts")
      .select("id", { head: true, count: "exact" })
      .eq("is_supplier", true)
      .is("deleted_at", null),
    supabase
      .from("catalog_items")
      .select("id", { head: true, count: "exact" })
      .is("deleted_at", null),
    supabase
      .from("documents")
      .select("id", { head: true, count: "exact" })
      .eq("type", "quote")
      .is("deleted_at", null),
    supabase
      .from("documents")
      .select("id", { head: true, count: "exact" })
      .eq("type", "purchase_order")
      .is("deleted_at", null),
    supabase
      .from("files")
      .select("id", { head: true, count: "exact" })
      .eq("mime_type", "application/pdf")
      .is("deleted_at", null),
  ]);
  const checks = [
    {
      label: "Cliente cadastrado",
      ok: (customers ?? 0) > 0,
      href: "/contacts?role=customer",
    },
    {
      label: "Fornecedor cadastrado",
      ok: (suppliers ?? 0) > 0,
      href: "/contacts?role=supplier",
    },
    {
      label: "Produto ou serviço no catálogo",
      ok: (catalog ?? 0) > 0,
      href: "/catalog",
    },
    { label: "Orçamento criado", ok: (quotes ?? 0) > 0, href: "/documents" },
    {
      label: "Pedido de compra criado",
      ok: (orders ?? 0) > 0,
      href: "/documents",
    },
    { label: "PDF armazenado", ok: (pdfs ?? 0) > 0, href: "/documents" },
  ];
  return (
    <>
      <div className="topline">
        <div>
          <span className="eyebrow">ROTEIRO GUIADO</span>
          <h1>Demonstração do MVP</h1>
          <p className="muted">
            Use este checklist para percorrer o fluxo completo.
          </p>
        </div>
        <Link className="button" href="/documents/new">
          Criar documento
        </Link>
      </div>
      <section className="panel demo-list">
        {checks.map((item, index) => (
          <Link className="demo-item" href={item.href} key={item.label}>
            <b>{item.ok ? "✓" : index + 1}</b>
            <div>
              <strong>{item.label}</strong>
              <div className="help">
                {item.ok
                  ? "Pronto para demonstrar"
                  : "Clique para concluir esta etapa"}
              </div>
            </div>
          </Link>
        ))}
      </section>
    </>
  );
}
