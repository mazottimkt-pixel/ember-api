import { notFound, redirect } from "next/navigation";
import { requireMembership } from "@/lib/auth/session";
import { DocumentForm } from "@/components/document-form";

export default async function EditDocument({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireMembership();
  const [{ data: doc }, { data: rows = [] }] = await Promise.all([
    supabase.from("documents").select("*,document_items(*)").eq("id", id).single(),
    supabase.from("business_contacts").select("id,legal_name,is_customer,is_supplier").eq("active", true).is("deleted_at", null).order("legal_name"),
  ]);
  if (!doc) notFound();
  if (doc.status !== "draft") redirect(`/documents/${id}`);
  const contacts = (rows ?? []).map((row) => ({ id: row.id, name: row.legal_name, isCustomer: row.is_customer, isSupplier: row.is_supplier }));
  const terms = doc.commercial_terms as { validity?: string; deadline?: string; paymentTerms?: string; deliveryAddress?: string };
  return <><div className="topline"><div><span className="eyebrow">EDITAR RASCUNHO</span><h1>{doc.number}</h1><p className="muted">Alterações são salvas localmente enquanto você trabalha.</p></div></div><DocumentForm contacts={contacts} initial={{ id: doc.id, requestId: doc.request_id ?? crypto.randomUUID(), type: doc.type, counterpartyId: doc.counterparty_id ?? "", items: (doc.document_items ?? []).sort((a: { position: number }, b: { position: number }) => a.position - b.position).map((item: { description: string; quantity: number; unit: string; unit_price: number; discount: number }) => ({ description: item.description, quantity: Number(item.quantity), unit: item.unit, unitPrice: Number(item.unit_price), discount: Number(item.discount) })), shipping: Number(doc.shipping), validity: terms.validity ?? "", deadline: terms.deadline ?? "", paymentTerms: terms.paymentTerms ?? "", deliveryAddress: terms.deliveryAddress ?? "", notes: doc.notes ?? "" }} /></>;
}
