import { expect, test } from "@playwright/test";

test.describe("autenticação Ember Comercial", () => {
  test("exibe a identidade da Ember e da Lume no desktop", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByRole("img", { name: "Ember" })).toBeVisible();
    if ((page.viewportSize()?.width ?? 0) > 820) {
      await expect(
        page.getByRole("img", { name: "Símbolo oficial da Lume" }),
      ).toBeVisible();
    } else {
      await expect(page.getByText("Assistente comercial inteligente")).toBeVisible();
    }
    await expect(
      page.getByRole("heading", { name: "Bem-vindo de volta" }),
    ).toBeVisible();
  });

  test("permite mostrar e ocultar a senha", async ({ page }) => {
    await page.goto("/login");
    const password = page.getByLabel("Senha");

    await expect(password).toHaveAttribute("type", "password");
    await page
      .getByRole("button", { name: "Mostrar conteúdo digitado" })
      .click();
    await expect(password).toHaveAttribute("type", "text");
    await page
      .getByRole("button", { name: "Ocultar conteúdo digitado" })
      .click();
    await expect(password).toHaveAttribute("type", "password");
  });

  test("apresenta erro amigável para credenciais inválidas", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("E-mail").fill("invalido@ember.com.br");
    await page.getByLabel("Senha").fill("senha-incorreta");
    await page.getByRole("button", { name: "Entrar" }).click();

    await expect(page.locator("main").getByRole("alert")).toContainText(
      "E-mail ou senha inválidos",
    );
    await expect(page).toHaveURL(/\/login/);
  });

  test("mantém o login real e redireciona para o dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("E-mail").fill(process.env.TEST_OWNER_EMAIL!);
    await page.getByLabel("Senha").fill(process.env.TEST_OWNER_PASSWORD!);
    await page.getByRole("button", { name: "Entrar" }).click();

    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("não cria rolagem horizontal no mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/login");

    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scrollWidth).toBe(dimensions.clientWidth);
    await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
  });
});
