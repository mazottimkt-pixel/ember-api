"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMembership } from "@/lib/auth/session";
import { digits, isValidTaxId } from "@/lib/domain/brazil";

const schema = z.object({
  id: z.preprocess((v) => (v === "" ? undefined : v), z.uuid().optional()),
  legal_name: z.string().trim().min(2).max(160),
  trade_name: z.string().trim().max(160).optional(),
  tax_id: z.string().trim().refine(isValidTaxId, "CPF ou CNPJ inválido"),
  person_type: z.enum(["individual", "company"]),
  is_customer: z.preprocess((v) => v === "on", z.boolean()),
  is_supplier: z.preprocess((v) => v === "on", z.boolean()),
  phone: z.string().trim().max(30).optional(),
  whatsapp: z.string().trim().max(30).optional(),
  email: z.union([z.email(), z.literal("")]).optional(),
  postal_code: z.string().trim().max(9).optional(),
  street: z.string().trim().max(160).optional(),
  street_number: z.string().trim().max(30).optional(),
  address_extra: z.string().trim().max(100).optional(),
  district: z.string().trim().max(100).optional(),
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().length(2).optional().or(z.literal("")),
  notes: z.string().trim().max(1000).optional(),
  active: z.preprocess((v) => v === "on", z.boolean()),
}).refine((data) => data.is_customer || data.is_supplier, { message: "Marque Cliente, Fornecedor ou ambos", path: ["is_customer"] });

export type ContactActionState = { ok: boolean; message: string };

export async function saveContact(formData: FormData): Promise<ContactActionState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Revise os campos." };
  const { organizationId, supabase } = await requireMembership();
  const data = parsed.data;
  const payload = { ...data, id: undefined, organization_id: organizationId, tax_id: digits(data.tax_id), trade_name: data.trade_name || null, email: data.email || null };
  const result = data.id
    ? await supabase.from("business_contacts").update(payload).eq("id", data.id).eq("organization_id", organizationId)
    : await supabase.from("business_contacts").insert(payload);
  if (result.error) {
    console.error("contact.save_failed", { organizationId, code: result.error.code });
    return { ok: false, message: result.error.code === "23505" ? "Já existe um cadastro com este CPF ou CNPJ nesta empresa." : "Não foi possível salvar o cadastro." };
  }
  revalidatePath("/contacts");
  return { ok: true, message: data.id ? "Cadastro atualizado." : "Cadastro criado." };
}

export async function setContactDeleted(formData: FormData) {
  const id = z.uuid().parse(formData.get("id"));
  const restore = formData.get("restore") === "true";
  const { organizationId, supabase } = await requireMembership();
  const { error } = await supabase.from("business_contacts").update({ deleted_at: restore ? null : new Date().toISOString(), active: restore }).eq("id", id).eq("organization_id", organizationId);
  if (error) throw new Error("Não foi possível alterar o cadastro");
  revalidatePath("/contacts");
}
