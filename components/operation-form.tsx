"use client";
import { useState } from "react";
import { createOperation } from "@/app/(dashboard)/operations/actions";
type Option = { id: string; label: string };
export function OperationForm({
  contacts,
  people,
  orders,
  checklists,
  templates,
  requestId,
}: {
  contacts: Option[];
  people: Option[];
  orders: Option[];
  checklists: Option[];
  templates: Option[];
  requestId: string;
}) {
  const [type, setType] = useState("service_order");
  return (
    <form className="panel form-grid" action={createOperation}>
      <input type="hidden" name="request_id" value={requestId} />
      <div className="field">
        <label>Tipo</label>
        <select
          name="type"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="service_order">Ordem de serviço</option>
          <option value="checklist">Checklist</option>
          <option value="service_report">Relatório ou vistoria</option>
        </select>
      </div>
      {type === "service_report" && (
        <Field label="Modalidade">
          <select name="modality">
            <option value="service">Relatório de serviço</option>
            <option value="inspection">Relatório de vistoria</option>
          </select>
        </Field>
      )}
      <Field label="Título *">
        <input name="title" required />
      </Field>
      {type !== "checklist" && (
        <Field label="Cliente *">
          <select name="counterparty_id" required>
            <option value="">Selecione</option>
            {contacts.map((o) => (
              <option value={o.id} key={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Responsável *">
        <select name="responsible_id" required>
          <option value="">Selecione</option>
          {people.map((o) => (
            <option value={o.id} key={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Local">
        <input name="location" required={type !== "checklist"} />
      </Field>
      {type === "service_order" && (
        <>
          <Field label="Descrição do serviço *" full>
            <textarea name="description" required rows={4} />
          </Field>
          <Field label="Prioridade">
            <select name="priority">
              <option value="low">Baixa</option>
              <option value="normal">Normal</option>
              <option value="high">Alta</option>
              <option value="urgent">Urgente</option>
            </select>
          </Field>
          <Field label="Data prevista">
            <input name="scheduled_at" type="datetime-local" />
          </Field>
          <Field label="Prazo">
            <input name="due_at" type="datetime-local" />
          </Field>
          <Field label="Materiais (um por linha)" full>
            <textarea name="materials" rows={4} />
          </Field>
          <Field label="Observações" full>
            <textarea name="notes" rows={3} />
          </Field>
        </>
      )}
      {type === "checklist" && (
        <>
          <Field label="Descrição" full>
            <textarea name="description" />
          </Field>
          <Field label="Ordem vinculada">
            <select name="service_order_id">
              <option value="">Independente</option>
              {orders.map((o) => (
                <option value={o.id} key={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Modelo reutilizável">
            <select name="template_id">
              <option value="">Sem modelo</option>
              {templates.map((o) => (
                <option value={o.id} key={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Itens obrigatórios (um por linha)" full>
            <textarea
              name="items"
              rows={8}
              placeholder="Preencha itens aqui ou selecione um modelo"
            />
          </Field>
        </>
      )}
      {type === "service_report" && (
        <>
          <Field label="Ordem vinculada">
            <select name="service_order_id">
              <option value="">Sem vínculo</option>
              {orders.map((o) => (
                <option value={o.id} key={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Checklist vinculado">
            <select name="checklist_id">
              <option value="">Sem vínculo</option>
              {checklists.map((o) => (
                <option value={o.id} key={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          {[
            ["objective", "Objetivo"],
            ["findings", "Situação encontrada"],
            ["activities", "Atividades realizadas"],
            ["materials", "Materiais utilizados"],
            ["non_conformities", "Não conformidades"],
            ["recommendations", "Recomendações"],
            ["conclusion", "Conclusão"],
          ].map(([name, label]) => (
            <Field
              label={`${label}${["objective", "findings", "conclusion"].includes(name) ? " *" : ""}`}
              full
              key={name}
            >
              <textarea
                name={name}
                required={["objective", "findings", "conclusion"].includes(
                  name,
                )}
                rows={3}
              />
            </Field>
          ))}
        </>
      )}
      <div className="field full">
        <p className="help">
          A criação reserva uma numeração própria e preserva o request_id.
          Mudanças críticas exigirão confirmação na tela de detalhe.
        </p>
        <button className="button">Criar rascunho</button>
      </div>
    </form>
  );
}
function Field({
  label,
  full,
  children,
}: {
  label: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`field ${full ? "full" : ""}`}>
      <label>{label}</label>
      {children}
    </div>
  );
}
