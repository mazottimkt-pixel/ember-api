import { z } from "zod";

export const moneySchema = z.number().finite().min(0);
export const documentItemSchema = z.object({
  description: z.string().trim().min(2).max(500),
  quantity: z.number().positive(),
  unit: z.string().trim().min(1).max(20).default("un"),
  unitPrice: moneySchema,
  discount: moneySchema.default(0),
});

const documentBaseSchema = z.object({
  type: z.enum(["quote", "purchase_order"]),
  counterpartyName: z.string().trim().min(2).max(160),
  items: z.array(documentItemSchema).min(1).max(100),
  shipping: moneySchema.default(0),
  validity: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((value) => {
      const year = Number(value.slice(0, 4));
      const date = new Date(`${value}T12:00:00Z`);
      return (
        year >= new Date().getFullYear() &&
        year <= new Date().getFullYear() + 10 &&
        date.toISOString().slice(0, 10) === value
      );
    }, "Data fora da faixa permitida")
    .optional(),
  deadline: z.string().trim().min(2).max(160),
  paymentTerms: z.string().trim().min(2).max(300),
  deliveryAddress: z.string().trim().max(300).optional(),
  receiverName: z.string().trim().max(160).optional(),
  recurrence: z.string().trim().max(160).optional(),
  warranty: z.string().trim().max(160).optional(),
  notes: z.string().trim().max(2000).optional(),
});
export const documentSchema = documentBaseSchema.superRefine((value, ctx) => {
  if (value.type === "quote" && !value.validity)
    ctx.addIssue({
      code: "custom",
      path: ["validity"],
      message: "Informe a validade",
    });
  if (value.type === "purchase_order" && !value.deliveryAddress)
    ctx.addIssue({
      code: "custom",
      path: ["deliveryAddress"],
      message: "Informe o endereço de entrega",
    });
});

export const aiExtractionSchema = documentBaseSchema.partial().extend({
  type: z.enum(["quote", "purchase_order", "document_search"]).optional(),
  ambiguities: z.array(z.string().max(300)).default([]),
  confidence: z.number().min(0).max(1),
});

export type DocumentInput = z.infer<typeof documentSchema>;
export type DocumentItemInput = z.infer<typeof documentItemSchema>;
export type AIExtraction = z.infer<typeof aiExtractionSchema>;
