import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { validateAttachment } from "./domain";
import type { OperationalContext } from "./service";
export const MAX_OPERATIONAL_ATTACHMENTS = 20,
  MAX_OPERATIONAL_TOTAL_BYTES = 50 * 1024 * 1024;
export async function storeOperationalAttachment(
  ctx: OperationalContext,
  input: {
    documentId: string;
    itemId?: string;
    file: File;
    caption?: string;
    evidenceKind?: string;
  },
) {
  if (!["owner", "admin", "sales"].includes(ctx.role))
    throw new Error("OPERATION_FORBIDDEN");
  const documentId = z.uuid().parse(input.documentId),
    bytes = new Uint8Array(await input.file.arrayBuffer());
  validateAttachment({
    name: input.file.name,
    mimeType: input.file.type,
    size: input.file.size,
    bytes,
  });
  const { data: doc } = await ctx.supabase
    .from("operational_documents")
    .select("id")
    .eq("organization_id", ctx.organizationId)
    .eq("id", documentId)
    .is("deleted_at", null)
    .single();
  if (!doc) throw new Error("OPERATION_NOT_FOUND");
  const { data: current = [] } = await ctx.supabase
    .from("operational_attachments")
    .select("size_bytes")
    .eq("organization_id", ctx.organizationId)
    .eq("operational_document_id", documentId)
    .is("deleted_at", null);
  if ((current?.length ?? 0) >= MAX_OPERATIONAL_ATTACHMENTS)
    throw new Error("ATTACHMENT_COUNT_LIMIT");
  if (
    (current ?? []).reduce((sum, row) => sum + Number(row.size_bytes), 0) +
      bytes.length >
    MAX_OPERATIONAL_TOTAL_BYTES
  )
    throw new Error("ATTACHMENT_TOTAL_LIMIT");
  const extension = input.file.name
    .toLowerCase()
    .match(/\.(png|jpe?g|webp|pdf)$/)?.[0];
  if (!extension) throw new Error("INVALID_ATTACHMENT_TYPE");
  const path = `${ctx.organizationId}/${documentId}/${randomUUID()}${extension}`,
    checksum = createHash("sha256").update(bytes).digest("hex");
  const uploaded = await ctx.supabase.storage
    .from("operational-evidence")
    .upload(path, bytes, { contentType: input.file.type, upsert: false });
  if (uploaded.error) throw new Error("ATTACHMENT_STORAGE_FAILED");
  const { data, error } = await ctx.supabase
    .from("operational_attachments")
    .insert({
      organization_id: ctx.organizationId,
      operational_document_id: documentId,
      checklist_item_id: input.itemId ? z.uuid().parse(input.itemId) : null,
      storage_path: path,
      original_name: input.file.name.slice(0, 255),
      mime_type: input.file.type,
      size_bytes: bytes.length,
      checksum,
      caption: input.caption?.slice(0, 500),
      evidence_kind: input.evidenceKind?.slice(0, 50) ?? "document",
      created_by: ctx.userId,
    })
    .select("id")
    .single();
  if (error || !data) {
    await ctx.supabase.storage.from("operational-evidence").remove([path]);
    throw new Error("ATTACHMENT_RECORD_FAILED");
  }
  await ctx.supabase.from("operational_events").insert({
    organization_id: ctx.organizationId,
    operational_document_id: documentId,
    actor_id: ctx.userId,
    event_type: "evidence.added",
    metadata: {
      attachmentId: data.id,
      mimeType: input.file.type,
      size: bytes.length,
    },
  });
  return data;
}
export async function signedOperationalAttachmentUrl(
  ctx: OperationalContext,
  id: string,
) {
  const { data } = await ctx.supabase
    .from("operational_attachments")
    .select("storage_path,original_name")
    .eq("id", z.uuid().parse(id))
    .eq("organization_id", ctx.organizationId)
    .is("deleted_at", null)
    .single();
  if (!data) throw new Error("ATTACHMENT_NOT_FOUND");
  const signed = await ctx.supabase.storage
    .from("operational-evidence")
    .createSignedUrl(data.storage_path, 900);
  if (signed.error || !signed.data?.signedUrl)
    throw new Error("ATTACHMENT_SIGN_FAILED");
  return { url: signed.data.signedUrl, name: data.original_name };
}
