import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(process.env.TEST_OWNER_EMAIL!);
  await page.getByLabel("Senha").fill(process.env.TEST_OWNER_PASSWORD!);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/dashboard/);
  await expect(
    page.getByRole("heading", { name: /Seu comercial/ }),
  ).toBeVisible();
}
test.describe("painel autenticado", () => {
  test.beforeEach(async ({ page }) => login(page));
  test("rotas principais carregam sem erro", async ({ page }, testInfo) => {
    const routes = [
      "/dashboard",
      "/demo",
      "/documents",
      "/documents/new",
      "/customers",
      "/suppliers",
      "/catalog",
      "/conversations",
      "/settings",
    ];
    for (const route of routes) {
      const response = await page.goto(route);
      expect(response?.status(), route).toBeLessThan(400);
      await expect(page.locator("body")).not.toContainText(
        /Application error|Internal Server Error/i,
      );
      await expect(page.locator("h1")).toBeVisible();
    }
    mkdirSync("test-results/visual", { recursive: true });
    await page.goto("/dashboard");
    await page.screenshot({
      path: `test-results/visual/${testInfo.project.name}-dashboard.png`,
      fullPage: true,
    });
  });
  test("cadastros e fluxo de orçamento", async ({ page }, testInfo) => {
    const stamp = Date.now().toString().slice(-6);
    await page.goto("/customers");
    await page.getByLabel("Nome *").fill(`Cliente E2E ${stamp}`);
    await page.getByLabel("CPF ou CNPJ").fill("12345678909");
    await page.getByRole("button", { name: "Adicionar cliente" }).click();
    await expect(page.getByText(`Cliente E2E ${stamp}`)).toBeVisible();
    await page.goto("/suppliers");
    await page.getByLabel("Nome *").fill(`Fornecedor E2E ${stamp}`);
    await page.getByRole("button", { name: "Adicionar fornecedor" }).click();
    await expect(page.getByText(`Fornecedor E2E ${stamp}`)).toBeVisible();
    await page.goto("/catalog");
    await page.getByLabel("Nome *").fill(`Serviço E2E ${stamp}`);
    await page.getByLabel("Preço em reais *").fill("250");
    await page.getByRole("button", { name: "Adicionar ao catálogo" }).click();
    await expect(page.getByText(`Serviço E2E ${stamp}`)).toBeVisible();
    await page.goto("/documents/new");
    await page
      .getByLabel("Cliente *")
      .selectOption({ label: `Cliente E2E ${stamp}` });
    await page
      .getByLabel("Descrição")
      .fill("Consultoria comercial especializada");
    await page.getByLabel("Valor unitário").fill("450");
    await page.getByLabel("Validade *").fill("2026-12-31");
    await page.getByLabel("Prazo *").fill("7 dias úteis");
    await page.getByLabel("Pagamento *").fill("À vista na aprovação");
    const saveButton = page.getByRole("button", { name: "Salvar rascunho" });
    if (testInfo.project.name === "mobile") await saveButton.click({ force: true });
    else await saveButton.click();
    await expect(page).toHaveURL(/\/documents\/[a-f0-9-]+\?saved=1/);
    await expect(page.getByText("Rascunho salvo com sucesso.")).toBeVisible();
    await page.getByRole("link", { name: "Editar" }).click();
    await expect(page.getByRole("heading", { name: /ORC-/ })).toBeVisible();
    await page.getByLabel("Prazo *").fill("10 dias úteis");
    if (testInfo.project.name === "mobile") await saveButton.click({ force: true });
    else await saveButton.click();
    await page.getByRole("button", { name: "Duplicar" }).click();
    await expect(page.getByText("Rascunho criado")).toBeVisible();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Confirmar" }).click();
    await expect(page.getByRole("link", { name: "Baixar PDF" })).toBeVisible();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("link", { name: "Baixar PDF" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.pdf$/);
  });
  test("navegação por teclado possui foco visível", async ({ page }) => {
    await page.goto("/dashboard");
    await page.keyboard.press("Tab");
    const focused = page.locator(":focus");
    await expect(focused).toBeVisible();
  });
});
