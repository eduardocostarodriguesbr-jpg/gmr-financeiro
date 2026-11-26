import { test, expect, Page } from "@playwright/test";
const permissions = [
  "dashboard.view",
  "movements.view",
  "movements.create",
  "accounts.view",
  "boxes.view",
  "categories.view",
  "users.view",
  "profiles.view",
  "audit.view",
  "adjustments.configure",
  "institution.manage",
  "users.approve",
];
const balance = {
  accounts: [],
  boxes: [],
  positions: [],
  totals: { income: 0, expense: 0 },
};
const operation = {
  id: "op",
  number: 1,
  description: "Oferta de teste",
  movement_date: "2026-11-24",
  amount_cents: 100,
  type: "income",
  status: "effective",
  author: "Teste",
};
const fixtures: Record<string, any> = {
  "/institution": { name: "Igreja de teste", logo: "" },
  "/dashboard": balance,
  "/balances": balance,
  "/users": [
    {
      id: "u",
      name: "Usuário de teste",
      login: "teste",
      approval_state: "approved",
      active: 1,
    },
  ],
  "/accounts": [{ id: "a", name: "Conta de teste", type: "cash", active: 1 }],
  "/boxes": [{ id: "b", name: "Caixa de teste", active: 1 }],
  "/categories": [{ id: "c", name: "Categoria de teste", active: 1 }],
  "/profiles": [
    { id: "p", name: "Perfil de teste", permissions: [], active: 1 },
  ],
  "/operations": [operation],
  "/audit": [],
  "/audit/options": { users: [], actions: [] },
  "/settings": { adjustment_approval: "direct" },
};
async function setup(page: Page, master: boolean) {
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname.slice(4);
    const data =
      path === "/me"
        ? {
            id: "synthetic",
            name: "Pessoa de teste",
            login: "teste",
            is_master: master,
            must_change: false,
            permissions,
          }
        : (fixtures[path] ?? []);
    return route.fulfill({ json: data });
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Solicitações de acesso" }),
  ).toBeVisible();
}
async function go(page: Page, name: string) {
  await page
    .locator("aside")
    .getByRole("button", { name, exact: true })
    .click();
}
for (const master of [true, false]) {
  test(`${master ? "Master" : "Administrador"}: navegação repetida não mistura contratos`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await setup(page, master);
    for (let i = 0; i < 3; i++)
      for (const name of [
        "Contas financeiras",
        "Perfis de acesso",
        "Movimentações",
        "Categorias",
        "Ministérios",
        "Usuários",
        "Visão geral",
        "Histórico de atividades",
        "Configurações",
        "Identidade da igreja",
      ]) {
        await go(page, name);
        await expect(page.locator(".loading")).toHaveCount(0);
        await expect(page.locator("aside")).toBeVisible();
        await expect(page.getByRole("alert")).toHaveCount(0);
      }
    expect(errors).toEqual([]);
  });
  test(`${master ? "Master" : "Administrador"}: resposta tardia do dashboard é descartada`, async ({
    page,
  }) => {
    await setup(page, master);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let started!: () => void;
    const pending = new Promise<void>((r) => (started = r));
    await page.route("**/api/operations?**", async (route) => {
      started();
      await gate;
      await route.fulfill({ json: [operation] });
    });
    // Start with no rows: isolate the late dashboard response from the first-frame bug.
    await page.route("**/api/accounts", (r) => r.fulfill({ json: [] }));
    await go(page, "Contas financeiras");
    await expect(page.locator(".loading")).toHaveCount(0);
    await go(page, "Visão geral");
    await pending;
    await go(page, "Perfis de acesso");
    await expect(
      page.getByText("Perfil de teste", { exact: true }),
    ).toBeVisible();
    release();
    await page.waitForTimeout(150);
    await expect(
      page.getByText("Perfil de teste", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Oferta de teste", { exact: true }),
    ).toHaveCount(0);
    await expect(page.getByRole("alert")).toHaveCount(0);
  });
}
test("contrato inválido e erro HTTP não exibem dados anteriores", async ({
  page,
}) => {
  await setup(page, true);
  await page.route("**/api/profiles", (r) =>
    r.fulfill({ json: [{ id: "bad", name: "Inválido" }] }),
  );
  await go(page, "Perfis de acesso");
  await expect(page.getByRole("alert")).toContainText("Resposta incompatível");
  await expect(page.getByText("Usuário de teste", { exact: true })).toHaveCount(
    0,
  );
  await page.route("**/api/operations?**", (r) =>
    r.fulfill({ status: 403, json: { error: "Acesso negado de teste" } }),
  );
  await go(page, "Movimentações");
  await expect(page.getByRole("alert")).toContainText("Acesso negado de teste");
  await go(page, "Contas financeiras");
  await expect(page.getByText("Conta de teste", { exact: true })).toBeVisible();
});
test("Error Boundary preserva menus e permite tentar novamente", async ({
  page,
}) => {
  await setup(page, true);
  await page.route("**/api/audit?**", (r) =>
    r.fulfill({
      json: [{ id: "bad", created_at: "2026-11-24", before_json: "{invalid" }],
    }),
  );
  await go(page, "Histórico de atividades");
  await expect(page.getByRole("alert")).toContainText(
    "Não foi possível exibir esta tela",
  );
  await expect(page.locator("aside")).toBeVisible();
  await go(page, "Contas financeiras");
  await expect(page.getByText("Conta de teste", { exact: true })).toBeVisible();
  await go(page, "Histórico de atividades");
  await expect(page.getByRole("alert")).toContainText(
    "Não foi possível exibir esta tela",
  );
  await page.route("**/api/audit?**", (r) => r.fulfill({ json: [] }));
  await page.getByRole("button", { name: "Tentar novamente" }).click();
  await expect(page.getByText("Nenhuma atividade disponível")).toBeVisible();
  await go(page, "Contas financeiras");
  await expect(page.getByText("Conta de teste", { exact: true })).toBeVisible();
});
