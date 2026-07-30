import { requireMembership } from "@/lib/auth/session";
import { saveSettings } from "./actions";
import { MaskedInput, SubmitButton } from "@/components/ui";
export default async function Page() {
  const { supabase, organizationId } = await requireMembership();
  const { data: org } = await supabase
    .from("organizations")
    .select("name,legal_name,tax_id,phone,logo_path")
    .eq("id", organizationId)
    .single();
  return (
    <>
      <div className="topline">
        <div>
          <span className="eyebrow">SUA MARCA</span>
          <h1>Configurações</h1>
          <p className="muted">Estes dados aparecem nos documentos.</p>
        </div>
      </div>
      <form action={saveSettings} className="panel form-grid">
        <div className="field">
          <label htmlFor="name">Nome da empresa *</label>
          <input id="name" name="name" defaultValue={org?.name} required />
        </div>
        <div className="field">
          <label htmlFor="legal-name">Razão social</label>
          <input
            id="legal-name"
            name="legal_name"
            defaultValue={org?.legal_name ?? ""}
          />
        </div>
        <div className="field">
          <label htmlFor="tax-id">CNPJ</label>
          <MaskedInput
            id="tax-id"
            name="tax_id"
            mask="document"
            defaultValue={org?.tax_id ?? ""}
          />
        </div>
        <div className="field">
          <label htmlFor="phone">Telefone</label>
          <MaskedInput
            id="phone"
            name="phone"
            mask="phone"
            defaultValue={org?.phone ?? ""}
          />
        </div>
        <div className="field full">
          <label htmlFor="logo">Logotipo</label>
          <input
            id="logo"
            name="logo"
            type="file"
            accept="image/png,image/jpeg,image/webp"
          />
          <span className="help">
            PNG, JPEG ou WebP, até 5 MB.{" "}
            {org?.logo_path
              ? "Logotipo atual configurado."
              : "Nenhum logotipo enviado."}
          </span>
        </div>
        <SubmitButton>Salvar configurações</SubmitButton>
      </form>
    </>
  );
}
