"use client";
import { useEffect, useMemo, useState } from "react";
import { saveDocumentDraft } from "@/app/(dashboard)/document-editor-actions";
import { SubmitButton } from "./ui";
type Party = { id: string; name: string };
type Item = {
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  discount: number;
};
type Initial = {
  id?: string;
  requestId: string;
  type: "quote" | "purchase_order";
  counterpartyId: string;
  items: Item[];
  shipping: number;
  validity: string;
  deadline: string;
  paymentTerms: string;
  deliveryAddress: string;
  notes: string;
};
export function DocumentForm({
  customers,
  suppliers,
  initial,
}: {
  customers: Party[];
  suppliers: Party[];
  initial: Initial;
}) {
  const key = `ember-draft-${initial.id ?? "new"}`;
  const [form, setForm] = useState<Initial>(() => {
    if (typeof window !== "undefined" && !initial.id) {
      const cached = localStorage.getItem(key);
      if (cached)
        try {
          return JSON.parse(cached) as Initial;
        } catch {}
    }
    return initial;
  });
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(() => {
      localStorage.setItem(key, JSON.stringify(form));
      setSavedAt(new Date());
    }, 600);
    return () => clearTimeout(timer);
  }, [dirty, form, key]);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
  const parties = form.type === "quote" ? customers : suppliers;
  const total = useMemo(
    () =>
      form.items.reduce(
        (sum, i) =>
          sum +
          Number(i.quantity || 0) * Number(i.unitPrice || 0) -
          Number(i.discount || 0),
        0,
      ) + Number(form.shipping || 0),
    [form],
  );
  const change = (patch: Partial<Initial>) => {
    setForm((v) => ({ ...v, ...patch }));
    setDirty(true);
  };
  const updateItem = (index: number, patch: Partial<Item>) => {
    change({
      items: form.items.map((item, i) =>
        i === index ? { ...item, ...patch } : item,
      ),
    });
  };
  return (
    <form
      action={async (formData) => {
        formData.set("items_json", JSON.stringify(form.items));
        setSubmitError(null);
        try {
          await saveDocumentDraft(formData);
          localStorage.removeItem(key);
          setDirty(false);
        } catch {
          setSubmitError(
            "Não foi possível salvar. Revise os campos e tente novamente.",
          );
        }
      }}
      className="panel form-grid"
    >
      <input type="hidden" name="id" value={form.id ?? ""} />
      <input type="hidden" name="request_id" value={form.requestId} />
      <input
        type="hidden"
        name="items_json"
        value={JSON.stringify(form.items)}
      />
      <div className="field">
        <label htmlFor="type">Tipo *</label>
        <select
          id="type"
          name="type"
          value={form.type}
          onChange={(e) =>
            change({
              type: e.target.value as Initial["type"],
              counterpartyId: "",
            })
          }
        >
          <option value="quote">Orçamento</option>
          <option value="purchase_order">Pedido de compra</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="party">
          {form.type === "quote" ? "Cliente" : "Fornecedor"} *
        </label>
        <select
          id="party"
          name="counterparty_id"
          value={form.counterpartyId}
          onChange={(e) => change({ counterpartyId: e.target.value })}
          required
        >
          <option value="">Selecione</option>
          {parties.map((x) => (
            <option value={x.id} key={x.id}>
              {x.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field full">
        <div className="topline">
          <div>
            <label>Itens *</label>
            <div className="help">
              Adicione produtos ou serviços ao documento.
            </div>
          </div>
          <button
            type="button"
            className="button secondary"
            onClick={() =>
              change({
                items: [
                  ...form.items,
                  {
                    description: "",
                    quantity: 1,
                    unit: "un",
                    unitPrice: 0,
                    discount: 0,
                  },
                ],
              })
            }
          >
            + Adicionar item
          </button>
        </div>
        {form.items.map((item, index) => (
          <div className="item-row" key={index}>
            <div className="field">
              <label htmlFor={`desc-${index}`}>Descrição</label>
              <input
                id={`desc-${index}`}
                value={item.description}
                onChange={(e) =>
                  updateItem(index, { description: e.target.value })
                }
                required
              />
            </div>
            <div className="field">
              <label htmlFor={`quantity-${index}`}>Qtd.</label>
              <input
                id={`quantity-${index}`}
                type="number"
                min="0.01"
                step="0.01"
                value={item.quantity}
                onChange={(e) =>
                  updateItem(index, { quantity: Number(e.target.value) })
                }
              />
            </div>
            <div className="field">
              <label htmlFor={`unit-${index}`}>Un.</label>
              <select
                id={`unit-${index}`}
                value={item.unit}
                onChange={(e) => updateItem(index, { unit: e.target.value })}
              >
                <option>un</option>
                <option>h</option>
                <option>dia</option>
                <option>m²</option>
                <option>kg</option>
              </select>
            </div>
            <div className="field wide-mobile">
              <label htmlFor={`price-${index}`}>Valor unitário</label>
              <input
                id={`price-${index}`}
                type="number"
                min="0"
                step="0.01"
                value={item.unitPrice}
                onChange={(e) =>
                  updateItem(index, { unitPrice: Number(e.target.value) })
                }
              />
            </div>
            <div className="field">
              <label htmlFor={`discount-${index}`}>Desconto</label>
              <input
                id={`discount-${index}`}
                type="number"
                min="0"
                step="0.01"
                value={item.discount}
                onChange={(e) =>
                  updateItem(index, { discount: Number(e.target.value) })
                }
              />
            </div>
            <button
              type="button"
              className="danger-button"
              aria-label={`Remover item ${index + 1}`}
              disabled={form.items.length === 1}
              onClick={() =>
                change({ items: form.items.filter((_, i) => i !== index) })
              }
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <div className="field">
        <label htmlFor="shipping">Frete</label>
        <input
          id="shipping"
          name="shipping"
          type="number"
          min="0"
          step="0.01"
          value={form.shipping}
          onChange={(e) => change({ shipping: Number(e.target.value) })}
        />
      </div>
      <div className="field">
        <label htmlFor="validity">
          {form.type === "quote" ? "Validade *" : "Validade"}
        </label>
        <input
          id="validity"
          name="validity"
          type="date"
          value={form.validity}
          onChange={(e) => change({ validity: e.target.value })}
          required={form.type === "quote"}
        />
      </div>
      <div className="field">
        <label htmlFor="deadline">Prazo *</label>
        <input
          id="deadline"
          name="deadline"
          value={form.deadline}
          onChange={(e) => change({ deadline: e.target.value })}
          placeholder="Ex.: 5 dias úteis"
          required
        />
      </div>
      <div className="field">
        <label htmlFor="payment">Pagamento *</label>
        <input
          id="payment"
          name="payment_terms"
          value={form.paymentTerms}
          onChange={(e) => change({ paymentTerms: e.target.value })}
          required
        />
      </div>
      {form.type === "purchase_order" && (
        <div className="field full">
          <label htmlFor="address">Endereço de entrega *</label>
          <input
            id="address"
            name="delivery_address"
            value={form.deliveryAddress}
            onChange={(e) => change({ deliveryAddress: e.target.value })}
            required
          />
        </div>
      )}
      <div className="field full">
        <label htmlFor="notes">Observações</label>
        <textarea
          id="notes"
          name="notes"
          value={form.notes}
          onChange={(e) => change({ notes: e.target.value })}
        />
      </div>
      <div className="field">
        <strong>
          Total estimado:{" "}
          {total.toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL",
          })}
        </strong>
        <span className="draft-state" aria-live="polite">
          {dirty
            ? savedAt
              ? `Rascunho local salvo às ${savedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
              : "Salvando rascunho local…"
            : "Sem alterações pendentes"}
        </span>
      </div>
      <div className="field form-submit">
        <SubmitButton pending="Salvando rascunho…">
          Salvar rascunho
        </SubmitButton>
      </div>
      {submitError && (
        <p className="error field full" role="alert">
          {submitError}
        </p>
      )}
    </form>
  );
}
