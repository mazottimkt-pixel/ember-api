import { randomUUID } from "node:crypto";
import { requireMembership } from "@/lib/auth/session";
import { DocumentForm } from "@/components/document-form";

export default async function NewDocument() {
  const { supabase } = await requireMembership();
  const { data: rows = [] } = await supabase.from("business_contacts").select("id,legal_name,is_customer,is_supplier").eq("active", true).is("deleted_at", null).order("legal_name");
  const contacts = (rows ?? []).map((row) => ({ id: row.id, name: row.legal_name, isCustomer: row.is_customer, isSupplier: row.is_supplier }));
  return <><div className="topline"><div><span className="eyebrow">NOVO DOCUMENTO</span><h1>Comece pelo essencial.</h1><p className="muted">Você poderá revisar tudo antes de confirmar.</p></div></div><DocumentForm contacts={contacts} initial={{ requestId: randomUUID(), type: "quote", counterpartyId: "", items: [{ description: "", quantity: 1, unit: "un", unitPrice: 0, discount: 0 }], shipping: 0, validity: "", deadline: "", paymentTerms: "", deliveryAddress: "", notes: "" }} /></>;
}
