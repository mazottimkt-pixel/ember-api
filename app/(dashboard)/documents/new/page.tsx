import { randomUUID } from "node:crypto";
import { requireMembership } from "@/lib/auth/session";
import { DocumentForm } from "@/components/document-form";
export default async function NewDocument() {
  const { supabase } = await requireMembership();
  const [{ data: customers = [] }, { data: suppliers = [] }] =
    await Promise.all([
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
  return (
    <>
      <div className="topline">
        <div>
          <span className="eyebrow">NOVO DOCUMENTO</span>
          <h1>Comece pelo essencial.</h1>
          <p className="muted">Você poderá revisar tudo antes de confirmar.</p>
        </div>
      </div>
      <DocumentForm
        customers={customers ?? []}
        suppliers={suppliers ?? []}
        initial={{
          requestId: randomUUID(),
          type: "quote",
          counterpartyId: "",
          items: [
            {
              description: "",
              quantity: 1,
              unit: "un",
              unitPrice: 0,
              discount: 0,
            },
          ],
          shipping: 0,
          validity: "",
          deadline: "",
          paymentTerms: "",
          deliveryAddress: "",
          notes: "",
        }}
      />
    </>
  );
}
