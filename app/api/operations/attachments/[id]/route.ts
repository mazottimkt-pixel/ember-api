import { NextResponse } from "next/server";
import { requireMembership } from "@/lib/auth/session";
import { signedOperationalAttachmentUrl } from "@/lib/operations/attachments";
export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params,
    { supabase, organizationId, user, role } = await requireMembership();
  const signed = await signedOperationalAttachmentUrl(
    { supabase, organizationId, userId: user.id, role },
    id,
  );
  return NextResponse.redirect(signed.url);
}
