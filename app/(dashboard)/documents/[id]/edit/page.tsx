import { notFound, redirect } from "next/navigation";
import { requireMembership } from "@/lib/auth/session";
import { DocumentForm } from "@/components/document-form";
export default async function EditDocument({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase } = await requireMembership();
  const [{ data: doc }, { data: customers = [] }, { data: suppliers = [] }] =
    await Promise.all([
      supabase
        .from("documents")
        .select("*,document_items(*)")
        .eq("id", id)
        .single(),
      supabase
        .from("customers")
        .select("id,name")
        .is("deleted_at", null)
        .order("name"),
      supabase
        .from("suppliers")
        .select("id,name")
        .is("deleted_at", null)
        .order("name"),
    ]);
  if (!doc) notFound();
  if (doc.status !== "draft") redirect(`/documents/${id}`);
  const terms = doc.commercial_terms as {
    validity?: string;
    deadline?: string;
    paymentTerms?: string;
    deliveryAddress?: string;
  };
  return (
    <>
      <div className="topline">
        <div>
          <span className="eyebrow">EDITAR RASCUNHO</span>
          <h1>{doc.number}</h1>
          <p className="muted">
            Alterações são salvas localmente enquanto você trabalha.
          </p>
        </div>
      </div>
      <DocumentForm
        customers={customers ?? []}
        suppliers={suppliers ?? []}
        initial={{
          id: doc.id,
          requestId: doc.request_id ?? crypto.randomUUID(),
          type: doc.type,
          counterpartyId:
            doc.type === "quote" ? doc.customer_id : doc.supplier_id,
          items: (doc.document_items ?? [])
            .sort(
              (a: { position: number }, b: { position: number }) =>
                a.position - b.position,
            )
            .map(
              (i: {
                description: string;
                quantity: number;
                unit: string;
                unit_price: number;
                discount: number;
              }) => ({
                description: i.description,
                quantity: Number(i.quantity),
                unit: i.unit,
                unitPrice: Number(i.unit_price),
                discount: Number(i.discount),
              }),
            ),
          shipping: Number(doc.shipping),
          validity: terms.validity ?? "",
          deadline: terms.deadline ?? "",
          paymentTerms: terms.paymentTerms ?? "",
          deliveryAddress: terms.deliveryAddress ?? "",
          notes: doc.notes ?? "",
        }}
      />
    </>
  );
}
