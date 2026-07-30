import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

const counterpart = "MATHEUS YAN TEODORO GONÇALVES MAZOTTI";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(process.env.TEST_OWNER_EMAIL!);
  await page.getByLabel("Senha").fill(process.env.TEST_OWNER_PASSWORD!);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/dashboard/);
}

async function fillDocument(page: Page, kind: "quote" | "purchase_order") {
  await page.goto("/documents/new");
  if (kind === "purchase_order")
    await page.getByLabel("Tipo *").selectOption("purchase_order");
  await page
    .getByLabel(kind === "quote" ? "Cliente *" : "Fornecedor *")
    .selectOption({ label: counterpart });
  await page
    .getByLabel("Descrição")
    .fill(
      kind === "quote"
        ? "Consultoria comercial especializada"
        : "Compra de materiais de escritório",
    );
  await page.getByLabel("Valor unitário").fill("450");
  if (kind === "quote")
    await page
      .getByLabel("Validade *")
      .fill(`${new Date().getFullYear() + 1}-12-31`);
  await page.getByLabel("Prazo *").fill("7 dias úteis");
  await page.getByLabel("Pagamento *").fill("À vista na aprovação");
  if (kind === "purchase_order")
    await page
      .getByLabel("Endereço de entrega *")
      .fill("Rua de Teste, 100, São Paulo - SP");
  await page.getByRole("button", { name: "Salvar rascunho" }).click();
  await expect(page).toHaveURL(/\/documents\/[a-f0-9-]+\?saved=1/);
  return page.getByRole("heading", { level: 1 }).innerText();
}

test.describe("painel autenticado", () => {
  test.beforeEach(async ({ page }) => login(page));

  test("rotas principais carregam sem erro", async ({ page }, testInfo) => {
    for (const route of [
      "/dashboard",
      "/demo",
      "/documents",
      "/documents/new",
      "/contacts",
      "/catalog",
      "/conversations",
      "/agent-lab",
      "/settings",
    ]) {
      const response = await page.goto(route);
      expect(response?.status(), route).toBeLessThan(400);
      await expect(page.locator("body")).not.toContainText(
        /Application error|Internal Server Error/i,
      );
      await expect(page.locator("h1")).toBeVisible();
    }
    mkdirSync("test-results/visual", { recursive: true });
    await page.goto("/contacts");
    await page.screenshot({
      path: `test-results/visual/${testInfo.project.name}-contacts.png`,
      fullPage: true,
    });
  });

  test("laboratório do agente persiste conversa com fallback seguro", async ({ page }) => {
    await page.goto("/agent-lab");
    await page.getByLabel("Mensagem ou transcrição").fill("Quero criar um pedido de compra");
    await page.getByRole("button", { name: "Enviar", exact: true }).click();
    await expect(page.getByText(/Vou reunir os dados|Qual é o nome do fornecedor/i)).toBeVisible();
    await expect(page.getByText(/collecting/i)).toBeVisible();
  });

  test("mesma contraparte gera ORC e PC com sequências independentes", async ({
    page,
  }) => {
    const quoteNumber = await fillDocument(page, "quote");
    expect(quoteNumber).toMatch(/^ORC-/);
    const purchaseNumber = await fillDocument(page, "purchase_order");
    expect(purchaseNumber).toMatch(/^PC-/);
    expect(quoteNumber).not.toBe(purchaseNumber);
    await expect(page.getByText("Rascunho salvo com sucesso.")).toBeVisible();
  });

  test("edição, duplicação, confirmação e PDF", async ({ page }) => {
    await fillDocument(page, "quote");
    await page.getByRole("link", { name: "Editar" }).click();
    await page.getByLabel("Prazo *").fill("10 dias úteis");
    await page.getByRole("button", { name: "Salvar rascunho" }).click();
    await page.getByRole("button", { name: "Duplicar" }).click();
    await expect(page.getByText("Documento duplicado")).toBeVisible();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Confirmar" }).click();
    await expect(page.getByRole("link", { name: "Baixar PDF" })).toBeVisible();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("link", { name: "Baixar PDF" }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.pdf$/);
  });

  test("navegação por teclado possui foco visível", async ({ page }) => {
    await page.goto("/dashboard");
    await page.keyboard.press("Tab");
    await expect(page.locator(":focus")).toBeVisible();
  });

  test("agent lab rejects duplicate messages without reprocessing", async ({ page }) => {
    await page.goto("/agent-lab");
    const idempotencyKey = crypto.randomUUID();
    const payload = { idempotencyKey, text: "Cancelar", action: "cancel" };
    const first = await page.request.post("/api/agent", { data: payload });
    expect(first.ok()).toBeTruthy();
    const firstData = await first.json();
    const second = await page.request.post("/api/agent", { data: payload });
    expect(second.ok()).toBeTruthy();
    const secondData = await second.json();
    expect(secondData.duplicate).toBe(true);
    expect(secondData.conversationId).toBe(firstData.conversationId);
    expect(secondData.state).toBe("cancelled");
  });

  test("agent lab transcribes Portuguese audio and continues conversation", async ({ page }) => {
    test.skip(!process.env.OPENAI_API_KEY, "OpenAI key required");
    await page.goto("/agent-lab");
    await page.locator("input.sr-only").setInputFiles("e2e/fixtures/agent-ptbr.mp3");
    const box = page.locator("#agent-message");
    await expect(box).toHaveValue(/Cl.nica Horizonte.*quatro servi.os/i);
    await page.getByRole("button", { name: "Enviar", exact: true }).click();
    await expect(page.getByText(/awaiting_confirmation|collecting/i)).toBeVisible();
    await expect(page.getByText(/gpt-4o-mini/i)).toBeVisible();
  });
});
