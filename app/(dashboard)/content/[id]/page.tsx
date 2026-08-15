import { notFound } from "next/navigation";
import { requireMembership } from "@/lib/auth/session";
import { approveContent, archiveContent, createContentImage, duplicateContent, newContentVersion, restoreContent } from "../actions";
import { CopyContentButton } from "@/components/copy-content-button";
export default async function ContentDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params,
    { supabase, organizationId } = await requireMembership();
  const [{ data: project }, { data: images = [] }] = await Promise.all([
    supabase
      .from("content_projects")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("id", id)
      .single(),
    supabase
      .from("content_images")
      .select("id,status,width,height,created_at")
      .eq("organization_id", organizationId)
      .eq("project_id", id)
      .order("created_at", { ascending: false }),
  ]);
  if (!project) notFound();
  const text = project.text_content as Record<string, unknown>;
  return (
    <>
      <div className="topline">
        <div>
          <span className="eyebrow">{project.type}</span>
          <h1>{project.objective}</h1>
          <span className={`status ${project.status}`}>{project.status}</span>
        </div>
        <div className="actions">
          <form action={duplicateContent}><input type="hidden" name="id" value={id}/><input type="hidden" name="request_id" value={crypto.randomUUID()}/><button className="button secondary">Duplicar</button></form>
          <form action={newContentVersion}><input type="hidden" name="id" value={id}/><input type="hidden" name="request_id" value={crypto.randomUUID()}/><button className="button secondary">Nova versão</button></form>
          {project.status === "ready_for_review" && (
            <form action={approveContent}>
              <input type="hidden" name="id" value={id} />
              <button className="button">Aprovar conteúdo</button>
            </form>
          )}
          {project.status === "archived" ? <form action={restoreContent}><input type="hidden" name="id" value={id}/><button className="button secondary">Restaurar</button></form> : <form action={archiveContent}>
            <input type="hidden" name="id" value={id} />
            <button className="button secondary">Arquivar</button>
          </form>}
        </div>
      </div>
      <section className="panel content-preview">
        <h2>{String(text.title ?? "Conteúdo")}</h2>
        <p className="prewrap">{String(text.body ?? "")}</p>
        {Boolean(text.caption) && (
          <>
            <h3>Legenda</h3>
            <p className="prewrap">{String(text.caption)}</p>
            <CopyContentButton text={String(text.caption)} />
          </>
        )}
        <h3>CTA</h3>
        <p>{String(text.cta ?? "")}</p>
        {Array.isArray(text.hashtags) && <p>{text.hashtags.join(" ")}</p>}
      </section>
      <form
        className="panel form-grid"
        style={{ marginTop: 16 }}
        action={createContentImage}
      >
        <h2 className="full">Gerar imagem com IA</h2>
        <input type="hidden" name="project_id" value={id} />
        <input type="hidden" name="request_id" value={crypto.randomUUID()} />
        <input type="hidden" name="confirm_cost" value="yes" />
        <label className="field">
          Objetivo
          <input name="objective" required defaultValue={project.objective} />
        </label>
        <label className="field">
          Assunto
          <input
            name="subject"
            required
            defaultValue={String(
              (project.briefing as Record<string, unknown>).subject ?? "",
            )}
          />
        </label>
        <label className="field">
          Público
          <input
            name="audience"
            required
            defaultValue={String(
              (project.briefing as Record<string, unknown>).audience ?? "",
            )}
          />
        </label>
        <label className="field">
          Formato
          <select name="format">
            <option value="square">Post quadrado</option>
            <option value="vertical">Post vertical</option>
            <option value="story">Story vertical</option>
            <option value="reels_cover">Capa de Reels</option>
            <option value="horizontal">Horizontal</option>
          </select>
        </label>
        <label className="field">
          Estilo
          <select name="style">
            <option value="professional">Profissional</option>
            <option value="modern">Moderno</option>
            <option value="minimalist">Minimalista</option>
            <option value="sophisticated">Sofisticado</option>
            <option value="vibrant">Vibrante</option>
            <option value="promotional">Promocional</option>
            <option value="photographic">Fotográfico</option>
            <option value="illustrated">Ilustrado</option>
          </select>
        </label>
        <label className="field">
          Cores
          <input name="colors" />
        </label>
        <label className="field">
          Título curto
          <input name="short_title" maxLength={60} />
        </label>
        <label className="field">
          CTA curto
          <input name="cta" maxLength={40} />
        </label>
        <label className="field full">
          Restrições
          <textarea name="restrictions" />
        </label>
        <p className="help full">
          Esta ação pode consumir a API de imagem. Só execute manualmente quando
          desejar gerar uma imagem real.
        </p>
        <button className="button">Confirmar geração de imagem</button>
      </form>
      <section className="panel" style={{ marginTop: 16 }}>
        <h2>Imagens</h2>
        {images?.length ? (
          images.map((image) => (
            <p key={image.id}>
              {image.status} · {image.width}×{image.height}
              {" · "}<a href={`/api/content/images/${image.id}`} download>Baixar</a>
            </p>
          ))
        ) : (
          <p className="muted">Nenhuma imagem gerada.</p>
        )}
      </section>
    </>
  );
}
