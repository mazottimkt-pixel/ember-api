import { requireMembership } from "@/lib/auth/session";
import { saveContentBrand } from "../actions";
export default async function ContentBrand() {
  const { supabase, organizationId } = await requireMembership(),
    { data } = await supabase
      .from("content_brand_profiles")
      .select("*")
      .eq("organization_id", organizationId)
      .maybeSingle();
  return (
    <>
      <div className="topline">
        <div>
          <span className="eyebrow">IDENTIDADE DE CONTEÚDO</span>
          <h1>Perfil da marca</h1>
          <p className="muted">
            Preferências reutilizadas pela Lume sem presumir informações
            ausentes.
          </p>
        </div>
      </div>
      <form className="panel form-grid" action={saveContentBrand}>
        <label className="field">
          Segmento
          <input name="segment" required defaultValue={data?.segment ?? ""} />
        </label>
        <label className="field">
          Público
          <input name="audience" required defaultValue={data?.audience ?? ""} />
        </label>
        <label className="field">
          Tom
          <select
            name="voice_tone"
            defaultValue={data?.voice_tone ?? "professional"}
          >
            <option value="professional">Profissional</option>
            <option value="friendly">Próxima e amigável</option>
            <option value="modern">Moderna</option>
            <option value="sophisticated">Sofisticada</option>
            <option value="direct">Direta e comercial</option>
            <option value="custom">Personalizar</option>
          </select>
        </label>
        <label className="field">
          CTA padrão
          <input name="default_cta" defaultValue={data?.default_cta ?? ""} />
        </label>
        <label className="field">
          Cores hex, separadas por vírgula
          <input
            name="colors"
            defaultValue={
              Array.isArray(data?.colors) ? data.colors.join(", ") : ""
            }
          />
        </label>
        <label className="field">
          Estilo visual
          <input name="visual_style" defaultValue={data?.visual_style ?? ""} />
        </label>
        <label className="field">
          Objetivo principal
          <input name="primary_goal" defaultValue={data?.primary_goal ?? ""} />
        </label>
        <label className="field">
          Redes utilizadas
          <input
            name="networks"
            defaultValue={data?.networks?.join(", ") ?? "Instagram"}
          />
        </label>
        <label className="field full">
          Observações
          <textarea name="notes" defaultValue={data?.notes ?? ""} />
        </label>
        <button className="button">Salvar perfil</button>
      </form>
    </>
  );
}
