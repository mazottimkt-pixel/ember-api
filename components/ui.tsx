"use client";
import { useFormStatus } from "react-dom";
export function SubmitButton({
  children,
  pending = "Salvando…",
  className = "button",
}: {
  children: React.ReactNode;
  pending?: string;
  className?: string;
}) {
  const { pending: isPending } = useFormStatus();
  return (
    <button className={className} disabled={isPending}>
      {isPending ? pending : children}
    </button>
  );
}
export function ConfirmButton({
  children,
  message,
  className = "danger-button",
}: {
  children: React.ReactNode;
  message: string;
  className?: string;
}) {
  return (
    <button
      className={className}
      onClick={(event) => {
        if (!window.confirm(message)) event.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon" aria-hidden>
        ✦
      </div>
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function MaskedInput({
  mask,
  ...props
}: {
  mask: "document" | "phone" | "cep" | "money";
} & React.InputHTMLAttributes<HTMLInputElement>) {
  function format(value: string) {
    const digits = value.replace(/\D/g, "");
    if (mask === "phone")
      return digits.length > 10
        ? digits.replace(/(\d{2})(\d{5})(\d{0,4}).*/, "($1) $2-$3")
        : digits.replace(/(\d{2})(\d{4})(\d{0,4}).*/, "($1) $2-$3");
    if (mask === "cep") return digits.replace(/(\d{5})(\d{0,3}).*/, "$1-$2");
    if (mask === "money")
      return (Number(digits) / 100).toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
      });
    return digits.length > 11
      ? digits.replace(
          /(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2}).*/,
          "$1.$2.$3/$4-$5",
        )
      : digits.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2}).*/, "$1.$2.$3-$4");
  }
  return (
    <input
      {...props}
      onInput={(e) => {
        e.currentTarget.value = format(e.currentTarget.value);
        props.onInput?.(e);
      }}
    />
  );
}
