import { NextResponse } from "next/server";
import { requireMembership } from "@/lib/auth/session";
import { generateOperationalPdf } from "@/lib/operations/pdf";
import { z } from "zod";
import { operationalPdfRequestId, storeOperationalPdf } from "@/lib/operations/pdf-store";
export const runtime = "nodejs";
export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  z.uuid().parse(id);
  const { supabase, organizationId, user } = await requireMembership();
  const { data: doc } = await supabase
    .from("operational_documents")
    .select(
      "*,organizations(name),profiles!operational_documents_responsible_id_fkey(full_name),operational_checklist_items(title,status,required,notes)",
    )
    .eq("id", id)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .single();
  if (!doc)
    return NextResponse.json(
      { error: "Operação não encontrada." },
      { status: 404 },
    );
  const party = doc.counterparty_snapshot as Record<string, unknown>,
    location = doc.location_snapshot as Record<string, unknown>;
  const bytes = await generateOperationalPdf({
    type: doc.type,
    modality: doc.modality,
    number: doc.number,
    status: doc.status,
    title: doc.title,
    description: doc.description,
    organizationName: String(
      (doc.organizations as { name?: string })?.name ?? "Empresa",
    ),
    counterpartyName: String(party.name ?? ""),
    location: String(location.label ?? ""),
    responsibleName: String(
      (doc.profiles as { full_name?: string })?.full_name ?? "",
    ),
    priority: doc.priority,
    scheduledAt: doc.scheduled_at,
    dueAt: doc.due_at,
    content: doc.content as Record<string, unknown>,
    items: doc.operational_checklist_items,
    acceptance: doc.acceptance as Record<string, unknown> | null,
  });
  await storeOperationalPdf({supabase,organizationId,userId:user.id},{documentId:id,requestId:operationalPdfRequestId(id,String(doc.content_fingerprint??doc.updated_at)),bytes,brandingSnapshot:{organizationName:String((doc.organizations as {name?:string})?.name??"Empresa")}});
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${doc.number}.pdf"`,
      "cache-control": "private, no-store",
    },
  });
}
