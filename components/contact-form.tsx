"use client";

import { useState } from "react";
import { saveContact } from "@/app/(dashboard)/contacts/actions";
import { MaskedInput } from "./ui";

type Contact = Partial<
  Record<
    | "id"
    | "legal_name"
    | "trade_name"
    | "tax_id"
    | "person_type"
    | "phone"
    | "whatsapp"
    | "email"
    | "postal_code"
    | "street"
    | "street_number"
    | "address_extra"
    | "district"
    | "city"
    | "state"
    | "notes",
    string
  >
> & { is_customer?: boolean; is_supplier?: boolean; active?: boolean };

export function ContactForm({ initial = {} }: { initial?: Contact }) {
  const text = (value: unknown) => (typeof value === "string" ? value : "");
  const [address, setAddress] = useState({
    postal_code: text(initial.postal_code),
    street: text(initial.street),
    district: text(initial.district),
    city: text(initial.city),
    state: text(initial.state),
  });
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const [pending, setPending] = useState(false);
  async function lookupCep() {
    const cep = address.postal_code.replace(/\D/g, "");
    if (cep.length !== 8)
      return setMessage({ ok: false, text: "Informe um CEP com 8 números." });
    setPending(true);
    try {
      const response = await fetch(`/api/cep/${cep}`);
      const data = await response.json();
      if (!response.ok) throw new Error();
      setAddress({
        postal_code: cep,
        street: data.street,
        district: data.district,
        city: data.city,
        state: data.state,
      });
      setMessage({
        ok: true,
        text: "Endereço preenchido. Confira o número e o complemento.",
      });
    } catch {
      setMessage({
        ok: false,
        text: "CEP não encontrado. Você pode preencher o endereço manualmente.",
      });
    } finally {
      setPending(false);
    }
  }
  return (
    <form
      className="form-grid"
      action={async (formData) => {
        setPending(true);
        setMessage(null);
        const result = await saveContact(formData);
        setMessage({ ok: result.ok, text: result.message });
        setPending(false);
      }}
    >
      <input type="hidden" name="id" value={initial.id ?? ""} />
      <div className="field">
        <label>Nome ou razão social *</label>
        <input name="legal_name" defaultValue={text(initial.legal_name)} required />
      </div>
      <div className="field">
        <label>Nome fantasia</label>
        <input name="trade_name" defaultValue={text(initial.trade_name)} />
      </div>
      <div className="field">
        <label>CPF ou CNPJ *</label>
        <MaskedInput
          name="tax_id"
          mask="document"
          defaultValue={text(initial.tax_id)}
          required
          inputMode="numeric"
        />
      </div>
      <div className="field">
        <label>Tipo de pessoa *</label>
        <select
          name="person_type"
          defaultValue={text(initial.person_type) || "individual"}
        >
          <option value="individual">Pessoa física</option>
          <option value="company">Pessoa jurídica</option>
        </select>
      </div>
      <fieldset className="field full role-picker">
        <legend>Funções *</legend>
        <label className="check">
          <input
            type="checkbox"
            name="is_customer"
            defaultChecked={initial.is_customer ?? true}
          />{" "}
          Cliente
        </label>
        <label className="check">
          <input
            type="checkbox"
            name="is_supplier"
            defaultChecked={initial.is_supplier ?? false}
          />{" "}
          Fornecedor
        </label>
        <label className="check">
          <input
            type="checkbox"
            name="active"
            defaultChecked={initial.active ?? true}
          />{" "}
          Ativo
        </label>
      </fieldset>
      <div className="field">
        <label>Telefone</label>
        <MaskedInput
          name="phone"
          mask="phone"
          defaultValue={text(initial.phone)}
          inputMode="tel"
        />
      </div>
      <div className="field">
        <label>WhatsApp</label>
        <MaskedInput
          name="whatsapp"
          mask="phone"
          defaultValue={text(initial.whatsapp)}
          inputMode="tel"
        />
      </div>
      <div className="field full">
        <label>E-mail</label>
        <input name="email" type="email" defaultValue={text(initial.email)} />
      </div>
      <div className="field">
        <label>CEP</label>
        <MaskedInput
          name="postal_code"
          mask="cep"
          value={address.postal_code}
          onChange={(e) =>
            setAddress({ ...address, postal_code: e.target.value })
          }
          inputMode="numeric"
        />
        <button
          type="button"
          className="button secondary"
          onClick={lookupCep}
          disabled={pending}
        >
          Buscar CEP
        </button>
      </div>
      <div className="field">
        <label>Logradouro</label>
        <input
          name="street"
          value={address.street}
          onChange={(e) => setAddress({ ...address, street: e.target.value })}
        />
      </div>
      <div className="field">
        <label>Número</label>
        <input name="street_number" defaultValue={text(initial.street_number)} />
      </div>
      <div className="field">
        <label>Complemento</label>
        <input name="address_extra" defaultValue={text(initial.address_extra)} />
      </div>
      <div className="field">
        <label>Bairro</label>
        <input
          name="district"
          value={address.district}
          onChange={(e) => setAddress({ ...address, district: e.target.value })}
        />
      </div>
      <div className="field">
        <label>Cidade</label>
        <input
          name="city"
          value={address.city}
          onChange={(e) => setAddress({ ...address, city: e.target.value })}
        />
      </div>
      <div className="field">
        <label>Estado</label>
        <input
          name="state"
          value={address.state}
          maxLength={2}
          onChange={(e) =>
            setAddress({ ...address, state: e.target.value.toUpperCase() })
          }
        />
      </div>
      <div className="field full">
        <label>Observações</label>
        <textarea name="notes" defaultValue={text(initial.notes)} />
      </div>
      <button className="button" disabled={pending} type="submit">
        {pending
          ? "Salvando…"
          : initial.id
            ? "Salvar alterações"
            : "Adicionar cadastro"}
      </button>
      {message && (
        <p
          className={`${message.ok ? "success" : "error"} field full`}
          role={message.ok ? "status" : "alert"}
        >
          {message.text}
        </p>
      )}
    </form>
  );
}
