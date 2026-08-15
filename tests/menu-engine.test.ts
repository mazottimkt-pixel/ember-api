import { describe, expect, it } from "vitest";
import { MENU_VERSION, destination, menus, navigationState, renderMenu, resolveMenuInput } from "@/lib/navigation/menu-engine";

describe("versioned menu engine", () => {
  it("renders menu guidance without numeric primary UI", () => {
    const text = renderMenu("main");
    expect(text).toContain("Menu de soluções");
    expect(text).toContain("lista abaixo");
    expect(text).not.toMatch(/\b1\s*[—-]|\b2\s*[—-]/);
  });
  it.each([["1", "show_commercial"], ["2", "show_operations"], ["4", "show_content"], ["6", "talk_to_lume"]])("resolves main option %s only as backward-compatible input", (value, action) => expect(resolveMenuInput(value, navigationState("main"))?.action).toBe(action));
  it("resolves numbers only in current context", () => {
    expect(resolveMenuInput("2", navigationState("commercial"))?.action).toBe("create_purchase_order");
    expect(resolveMenuInput("2", navigationState("main"))?.action).toBe("show_operations");
  });
  it("rejects delayed action from another submenu", () => expect(resolveMenuInput("Criar pedido de compra", navigationState("management_queries"))).toBeNull());
  it.each(["Voltar", "Menu principal", "Início", "Cancelar"])("recognizes global navigation %s", (value) => expect(resolveMenuInput(value, navigationState("commercial"))).not.toBeNull());
  it("keeps commercial flows active", () => expect(menus.commercial.items.find((item) => item.id === "create_quote")?.available).toBe(true));
  it("does not expose incomplete WhatsApp content actions", () => expect(menus.content_marketing.items.filter((item) => item.action === "create_content" && item.available)).toHaveLength(0));
  it("uses atomic version", () => {
    expect(navigationState("main").menu_version).toBe(MENU_VERSION);
    expect(destination("show_content")).toBe("content_marketing");
  });
});
