import { generateDocumentPdf } from "@/lib/pdf/generate";
import { documentSchema } from "@/lib/domain/schemas";
export async function POST(request: Request) {
  try {
    const input = documentSchema.parse(await request.json());
    const pdf = await generateDocumentPdf(input, {
      organizationName: "Empresa demonstrativa",
      number: "RASCUNHO",
      issuerName: "Usuário",
      validationCode: "PREVIEW",
    });
    return new Response(Buffer.from(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": "inline; filename=rascunho.pdf",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Dados inválidos" },
      { status: 400 },
    );
  }
}
