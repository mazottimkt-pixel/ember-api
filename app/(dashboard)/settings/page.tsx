import { requireMembership } from "@/lib/auth/session";
import { saveProfile, saveSettings } from "./actions";
import { MaskedInput, SubmitButton } from "@/components/ui";
export default async function Page() {
  const { supabase, organizationId, user } = await requireMembership();
  const [{ data: org }, { data: profile }] = await Promise.all([supabase
    .from("organizations")
    .select("name,legal_name,tax_id,phone,email,address,logo_path")
    .eq("id", organizationId)
    .single(), supabase.from("profiles").select("full_name,email,job_title").eq("id", user.id).single()]);
  const address = (org?.address ?? {}) as Record<string,string>;
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
        <div className="field"><label htmlFor="org-email">E-mail da empresa</label><input id="org-email" name="email" type="email" defaultValue={org?.email ?? ""} /></div>
        <div className="field"><label htmlFor="org-cep">CEP</label><MaskedInput id="org-cep" name="postal_code" mask="cep" defaultValue={address.postal_code ?? ""} /></div>
        <div className="field"><label htmlFor="org-street">Logradouro</label><input id="org-street" name="street" defaultValue={address.street ?? ""} /></div>
        <div className="field"><label htmlFor="org-number">Número</label><input id="org-number" name="street_number" defaultValue={address.number ?? ""} /></div>
        <div className="field"><label htmlFor="org-city">Cidade</label><input id="org-city" name="city" defaultValue={address.city ?? ""} /></div>
        <div className="field"><label htmlFor="org-state">Estado</label><input id="org-state" name="state" maxLength={2} defaultValue={address.state ?? ""} /></div>
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
      <form action={saveProfile} className="panel form-grid" style={{ marginTop: 16 }}>
        <div className="field"><label htmlFor="responsible-name">Nome do responsável *</label><input id="responsible-name" name="full_name" required defaultValue={profile?.full_name ?? ""} /></div>
        <div className="field"><label htmlFor="responsible-email">E-mail do responsável</label><input id="responsible-email" name="email" type="email" defaultValue={profile?.email ?? user.email ?? ""} /></div>
        <div className="field"><label htmlFor="responsible-title">Cargo</label><input id="responsible-title" name="job_title" defaultValue={profile?.job_title ?? ""} /></div>
        <SubmitButton>Salvar responsável</SubmitButton>
      </form>
    </>
  );
}
