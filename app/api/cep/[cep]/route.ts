import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMembership } from "@/lib/auth/session";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ cep: string }> },
) {
  await requireMembership();
  const cep = z
    .string()
    .regex(/^\d{8}$/)
    .parse((await params).cep);
  const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
    signal: AbortSignal.timeout(5000),
    next: { revalidate: 86400 },
  });
  if (!response.ok)
    return NextResponse.json({ error: "CEP indisponível" }, { status: 502 });
  const data = await response.json();
  if (data.erro)
    return NextResponse.json({ error: "CEP não encontrado" }, { status: 404 });
  return NextResponse.json({
    street: data.logradouro ?? "",
    district: data.bairro ?? "",
    city: data.localidade ?? "",
    state: data.uf ?? "",
  });
}
