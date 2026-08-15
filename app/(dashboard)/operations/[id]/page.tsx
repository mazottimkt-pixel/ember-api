import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMembership } from "@/lib/auth/session";
import {
  acceptReport,
  finishChecklist,
  saveChecklistItem,
  transitionOperation,
  uploadOperationalEvidence,
} from "../actions";
import {
  checklistTransitions,
  reportTransitions,
  serviceOrderTransitions,
} from "@/lib/operations/domain";
export default async function OperationDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params,
    { supabase, organizationId, role } = await requireMembership();
  const [
    { data: doc },
    { data: items = [] },
    { data: events = [] },
    { data: attachments = [] },
  ] = await Promise.all([
    supabase
      .from("operational_documents")
      .select("*,profiles!operational_documents_responsible_id_fkey(full_name)")
      .eq("organization_id", organizationId)
      .eq("id", id)
      .is("deleted_at", null)
      .single(),
    supabase
      .from("operational_checklist_items")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("checklist_id", id)
      .order("position"),
    supabase
      .from("operational_events")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("operational_document_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("operational_attachments")
      .select("id,original_name,mime_type,caption,created_at")
      .eq("organization_id", organizationId)
      .eq("operational_document_id", id)
      .is("deleted_at", null),
  ]);
  if (!doc) notFound();
  const map =
    doc.type === "service_order"
      ? serviceOrderTransitions
      : doc.type === "checklist"
        ? checklistTransitions
        : reportTransitions;
  const next = (map[doc.status] ?? []).filter(
      (target) =>
        role !== "viewer" &&
        !(
          role === "sales" &&
          (["approved", "cancelled", "rejected", "accepted"].includes(target) ||
            (target === "completed" && doc.type !== "checklist"))
        ),
    ),
    party = doc.counterparty_snapshot as Record<string, unknown>,
    location = doc.location_snapshot as Record<string, unknown>,
    content = doc.content as Record<string, unknown>;
  return (
    <>
      <div className="topline">
        <div>
          <span className="eyebrow">{doc.number}</span>
          <h1>{doc.title}</h1>
          <p className="muted">
            {doc.type} ·{" "}
            <span className={`status ${doc.status}`}>{doc.status}</span>
          </p>
        </div>
        <Link
          className="button secondary"
          href={`/api/operations/${doc.id}/pdf`}
          target="_blank"
        >
          Abrir PDF
        </Link>
      </div>
      <div className="dashboard-columns">
        <section className="panel">
          <h2>Resumo</h2>
          <dl className="detail-grid">
            <dt>Cliente</dt>
            <dd>{String(party.name ?? "—")}</dd>
            <dt>Local</dt>
            <dd>{String(location.label ?? "—")}</dd>
            <dt>Responsável</dt>
            <dd>
              {(doc.profiles as unknown as { full_name?: string })?.full_name ??
                "—"}
            </dd>
            <dt>Prioridade</dt>
            <dd>{doc.priority}</dd>
            <dt>Data prevista</dt>
            <dd>
              {doc.scheduled_at
                ? new Date(doc.scheduled_at).toLocaleString("pt-BR")
                : "—"}
            </dd>
            <dt>Prazo</dt>
            <dd>
              {doc.due_at ? new Date(doc.due_at).toLocaleString("pt-BR") : "—"}
            </dd>
          </dl>
          {doc.description && (
            <>
              <h3>Descrição</h3>
              <p>{doc.description}</p>
            </>
          )}
          {Object.entries(content).map(([key, value]) =>
            value ? (
              <div key={key}>
                <h3>{key.replace(/([A-Z])/g, " $1")}</h3>
                <p>{Array.isArray(value) ? value.join("; ") : String(value)}</p>
              </div>
            ) : null,
          )}
          {doc.acceptance && (
            <div className="notice">
              <strong>Aceite operacional registrado</strong>
              <p>
                {String((doc.acceptance as { name?: string }).name ?? "")} ·{" "}
                {new Date(doc.accepted_at).toLocaleString("pt-BR")}
              </p>
              <small>
                Concordância operacional registrada no sistema; não representa
                assinatura eletrônica avançada.
              </small>
            </div>
          )}
        </section>
        <aside className="panel">
          <h2>Ações permitidas</h2>
          {!next.length ? (
            <p className="muted">Este estado não possui novas transições.</p>
          ) : (
            next.map((to) => (
              <form
                action={transitionOperation}
                className="transition-form"
                key={to}
              >
                <input type="hidden" name="id" value={doc.id} />
                <input type="hidden" name="to" value={to} />
                <input type="hidden" name="confirm" value="yes" />
                <label>
                  Observação para {to}
                  <input name="observation" />
                </label>
                {to === "completed" && (
                  <label>
                    Justificativa de exceção, se necessária
                    <input name="override_reason" />
                  </label>
                )}
                <button
                  className={
                    to === "cancelled" ? "danger-button" : "button secondary"
                  }
                >
                  Confirmar: {to}
                </button>
              </form>
            ))
          )}
        </aside>
      </div>
      {doc.type === "checklist" && (
        <section className="panel operation-checklist">
          <div className="topline compact">
            <h2>Itens do checklist</h2>
            <span className="status">
              {items?.filter((i) => i.status !== "pending").length}/
              {items?.length}
            </span>
          </div>
          {items?.map((item) => (
            <form
              action={saveChecklistItem}
              className="checklist-row"
              key={item.id}
            >
              <input type="hidden" name="checklist_id" value={doc.id} />
              <input type="hidden" name="item_id" value={item.id} />
              <div>
                <strong>
                  {item.position}. {item.title}
                </strong>
                <div className="help">
                  {item.required ? "Obrigatório" : "Opcional"}
                </div>
              </div>
              <select name="status" defaultValue={item.status}>
                <option value="pending">Pendente</option>
                <option value="completed">Concluído</option>
                <option value="not_applicable">Não aplicável</option>
                <option value="non_compliant">Não conforme</option>
                <option value="blocked">Bloqueado</option>
              </select>
              <input
                name="notes"
                defaultValue={item.notes ?? ""}
                placeholder="Observação"
              />
              <input
                name="non_compliance_reason"
                defaultValue={item.non_compliance_reason ?? ""}
                placeholder="Motivo da não conformidade"
              />
              <input
                name="corrective_action"
                defaultValue={item.corrective_action ?? ""}
                placeholder="Ação corretiva"
              />
              <button className="button secondary">Salvar</button>
            </form>
          ))}
          {doc.status === "in_progress" && (
            <form action={finishChecklist}>
              <input type="hidden" name="id" value={doc.id} />
              <input type="hidden" name="confirm" value="yes" />
              <button className="button">Concluir checklist</button>
            </form>
          )}
        </section>
      )}
      {["owner", "admin"].includes(role) &&
        doc.type === "service_report" &&
        doc.status === "ready_for_acceptance" && (
          <form className="panel form-grid" action={acceptReport}>
            <h2 className="full">Aceite operacional</h2>
            <input type="hidden" name="id" value={doc.id} />
            <input type="hidden" name="confirm" value="yes" />
            <label className="field">
              Nome de quem aceita
              <input name="name" required />
            </label>
            <label className="field">
              Papel ou relação
              <input name="acceptance_role" required />
            </label>
            <label className="field full">
              Observação
              <input name="observation" />
            </label>
            <p className="help full">
              Ao confirmar, o sistema registra nome, papel, horário, canal,
              versão e fingerprint do conteúdo.
            </p>
            <button className="button">Registrar aceite</button>
          </form>
        )}
      <div className="dashboard-columns">
        <section className="panel">
          <h2>Anexos e evidências</h2>
          {attachments?.length ? (
            attachments.map((file) => (
              <p key={file.id}>
                <Link
                  href={`/api/operations/attachments/${file.id}`}
                  target="_blank"
                >
                  {file.original_name}
                </Link>{" "}
                <span className="help">{file.mime_type}</span>
              </p>
            ))
          ) : (
            <p className="muted">Nenhum anexo ou evidência registrado.</p>
          )}
          <form action={uploadOperationalEvidence} className="transition-form">
            <input type="hidden" name="document_id" value={doc.id} />
            <label>
              Arquivo
              <input
                type="file"
                name="file"
                accept="image/png,image/jpeg,image/webp,application/pdf"
                required
              />
            </label>
            <label>
              Legenda
              <input name="caption" maxLength={500} />
            </label>
            <select name="evidence_kind">
              <option value="document">Documento</option>
              <option value="service">Serviço</option>
              <option value="non_compliance">Não conformidade</option>
              <option value="completion">Conclusão</option>
              <option value="acceptance">Aceite</option>
            </select>
            <button className="button secondary">Adicionar evidência</button>
            <small className="help">
              PNG, JPG, WEBP ou PDF; até 10 MB por arquivo, 20 arquivos e 50 MB
              por operação. Armazenamento privado.
            </small>
          </form>
        </section>
        <section className="panel">
          <h2>Linha do tempo</h2>
          {events?.map((e) => (
            <div className="timeline-item" key={e.id}>
              <strong>{e.event_type}</strong>
              <div className="help">
                {new Date(e.created_at).toLocaleString("pt-BR")} ·{" "}
                {e.from_status ?? "—"} → {e.to_status ?? "—"}
              </div>
              {e.observation && <p>{e.observation}</p>}
            </div>
          ))}
        </section>
      </div>
    </>
  );
}
