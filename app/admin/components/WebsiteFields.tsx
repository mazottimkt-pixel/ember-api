import type { Website, WebsiteFormState } from "@/lib/websites";

const inputClass = "w-full rounded-lg border border-zinc-700 bg-zinc-800 p-3 text-white outline-none transition focus:border-orange-500 disabled:opacity-60";

export default function WebsiteFields({ website, state }: { website?: Website; state: WebsiteFormState }) {
  const error = (field: keyof NonNullable<WebsiteFormState["fieldErrors"]>) => state.fieldErrors?.[field];
  const field = (name: keyof NonNullable<WebsiteFormState["fieldErrors"]>, label: string, options: { required?: boolean; placeholder?: string; type?: string } = {}) => (
    <div>
      <label htmlFor={name} className="mb-2 block text-sm font-semibold">{label}{options.required ? " *" : ""}</label>
      <input
        id={name}
        name={name}
        type={options.type}
        required={options.required}
        min={name === "interested" ? 0 : undefined}
        max={name === "interested" ? 1000000 : undefined}
        defaultValue={website?.[name] ?? (name === "interested" ? 0 : "")}
        placeholder={options.placeholder}
        aria-invalid={Boolean(error(name))}
        aria-describedby={error(name) ? `${name}-error` : undefined}
        className={`${inputClass} ${error(name) ? "border-red-700" : ""}`}
      />
      {error(name) && <p id={`${name}-error`} className="mt-2 text-sm text-red-300">{error(name)}</p>}
    </div>
  );

  return (
    <>
      {field("domain", "Domínio", { required: true, placeholder: "exemplo.com" })}
      {field("status", "Status", { required: true, placeholder: "Disponível para compra" })}
      <div className="grid gap-6 md:grid-cols-2">
        {field("price", "Valor", { placeholder: "US$ 8.500" })}
        {field("category", "Categoria", { placeholder: "Inteligência Artificial" })}
        {field("owner", "Proprietário", { placeholder: "Empresa ou pessoa" })}
        {field("country", "País", { placeholder: "Brasil" })}
        {field("created_at", "Criado em", { placeholder: "2026" })}
        {field("interested", "Interessados", { type: "number" })}
      </div>
    </>
  );
}
