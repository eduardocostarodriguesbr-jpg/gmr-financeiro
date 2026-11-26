import { test, expect, Page } from "@playwright/test";
const permissions = [
  "dashboard.view",
  "movements.view",
  "movements.create",
  "movements.edit",
  "accounts.view",
  "accounts.create",
  "boxes.view",
  "boxes.create",
  "categories.view",
  "categories.create",
  "categories.edit",
  "users.view",
  "users.manage",
  "users.approve",
  "profiles.view",
  "profiles.manage",
  "audit.view",
  "audit.export",
  "adjustments.configure",
  "institution.manage",
];
async function setup(page: Page) {
  const writes: { path: string; body: any }[] = [];
  const boxes = [
    { id: "g", name: "Administração Geral", active: 1 },
    { id: "i", name: "Ministério Infantil", active: 1 },
  ];
  const categories = [
    {
      id: "zel",
      name: "Zelador",
      active: 1,
      movement_type: "expense",
      all_boxes: 0,
      box_ids: ["g"],
    },
    {
      id: "of",
      name: "Ofertas",
      active: 1,
      movement_type: "income",
      all_boxes: 1,
      box_ids: [],
    },
    {
      id: "c",
      name: "Geral",
      active: 1,
      movement_type: "both",
      all_boxes: 1,
      box_ids: [],
    },
  ];
  let op = {
    id: "op",
    version: 0,
    number: 1,
    type: "expense",
    movement_date: "2026-11-26",
    amount_cents: 1000,
    status: "effective",
    account_id: "a",
    box_id: "g",
    category_id: "zel",
    subcategory_id: null,
    description: "Serviço",
    account_name: "Conta teste",
    box_name: "Administração Geral",
    category_name: "Zelador",
    payment_method: "pix",
    author: "Ivan",
  };
  const fixtures: Record<string, any> = {
    "/me": {
      id: "u",
      name: "Ivan",
      login: "ivan",
      is_master: false,
      must_change: false,
      permissions,
    },
    "/institution": { name: "Igreja de teste", logo: "" },
    "/users": [
      {
        id: "u",
        name: "Ivan",
        login: "ivan",
        approval_state: "approved",
        profile_id: "p",
        box_scope: null,
        active: 1,
      },
    ],
    "/approval-profiles": [{ id: "p", name: "Administrador" }],
    "/profiles": [{ id: "p", name: "Administrador", permissions, active: 1 }],
    "/boxes": boxes,
    "/categories": categories,
    "/subcategories": [],
    "/accounts": [{ id: "a", name: "Conta teste", type: "bank", active: 1 }],
    "/balances": {
      accounts: [
        {
          id: "a",
          name: "Conta teste",
          type: "bank",
          active: 1,
          balance_cents: 10000,
          unallocated_cents: 0,
        },
      ],
      boxes: boxes.map((b) => ({ ...b, balance_cents: 5000 })),
      positions: [
        { account_id: "a", box_id: "g", balance_cents: 5000 },
        { account_id: "a", box_id: "i", balance_cents: 5000 },
      ],
    },
    "/settings": { adjustment_approval: "direct" },
    "/audit/options": {
      users: [{ id: "u", name: "Ivan" }],
      actions: ["update", "create"],
    },
    "/audit": [],
  };
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname.slice(4);
    if (route.request().method() !== "GET") {
      const body = route.request().postDataJSON();
      writes.push({ path, body });
      if (path === "/operations/op")
        op = { ...op, ...body, version: op.version + 1 };
      return route.fulfill({ json: { id: "new", ok: true } });
    }
    if (path === "/audit/export")
      return route.fulfill({
        body: "Data;Usuário\r\n2026-11-26;Ivan",
        contentType: "text/csv; charset=utf-8",
      });
    return route.fulfill({
      json: path === "/operations" ? [op] : (fixtures[path] ?? []),
    });
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Solicitações de acesso" }),
  ).toBeVisible();
  return writes;
}
async function go(page: Page, name: string) {
  await page
    .locator("aside")
    .getByRole("button", { name, exact: true })
    .click();
}
for (const viewport of [
  { width: 1280, height: 500 },
  { width: 1024, height: 600 },
  { width: 390, height: 600 },
  { width: 844, height: 390 },
]) {
  test(`rolagem e sessão acessíveis em ${viewport.width}x${viewport.height}`, async ({
    page,
  }, info) => {
    await page.setViewportSize(viewport);
    await setup(page);
    await expect(page.locator(".session-actions")).toContainText("Ivan");
    await expect(
      page.getByRole("button", { name: "Sair da sessão", exact: true }),
    ).toBeInViewport();
    if (viewport.width <= 700)
      await page
        .getByRole("button", { name: "Abrir menu", exact: true })
        .click();
    const sidebar = page.locator("aside");
    await expect
      .poll(async () => Math.round((await sidebar.boundingBox())!.x))
      .toBe(0);
    expect(
      await sidebar.evaluate((el) => el.scrollHeight > el.clientHeight),
    ).toBeTruthy();
    await sidebar.evaluate((el) => (el.scrollTop = el.scrollHeight));
    await expect(
      sidebar.getByRole("button", { name: "Sair", exact: true }),
    ).toBeInViewport();
    if (viewport.width === 390 || viewport.width === 1280)
      await page.screenshot({
        path: info.outputPath("sessao-e-rolagem.png"),
        fullPage: true,
      });
    await sidebar.getByRole("button", { name: "Sair", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Acesse seu financeiro" }),
    ).toBeVisible();
  });
}
test("categoria pode aceitar saída e vários ministérios", async ({
  page,
}, info) => {
  const writes = await setup(page);
  await go(page, "Categorias");
  await page
    .getByRole("button", { name: "Adicionar categoria", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .locator('input[name="name"]')
    .fill("Zeladoria");
  await page.getByLabel("Tipo de movimentação").selectOption("expense");
  await page.getByRole("radio", { name: "Somente os selecionados" }).check();
  await page
    .getByRole("checkbox", { name: "Administração Geral", exact: true })
    .check();
  await page
    .getByRole("checkbox", { name: "Ministério Infantil", exact: true })
    .check();
  await page
    .getByRole("dialog")
    .screenshot({ path: info.outputPath("categoria.png") });
  await page
    .getByRole("button", { name: "Salvar cadastro", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(writes.find((w) => w.path === "/categories")?.body).toMatchObject({
    name: "Zeladoria",
    movement_type: "expense",
    box_ids: ["g", "i"],
  });
});
test("formulário filtra categoria por entrada/saída e ministério e limpa seleção incompatível", async ({
  page,
}) => {
  await setup(page);
  await go(page, "Movimentações");
  await page
    .getByRole("button", { name: "Nova movimentação", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Conta financeira").selectOption("a");
  await dialog.getByLabel("Ministério", { exact: true }).selectOption("g");
  await expect(
    dialog.getByLabel("Categoria", { exact: true }).locator("option"),
  ).not.toContainText(["Zelador"]);
  await dialog.getByRole("button", { name: "Saída", exact: true }).click();
  await expect(
    dialog.getByLabel("Categoria", { exact: true }).locator("option"),
  ).toContainText(["Zelador"]);
  await dialog.getByLabel("Categoria", { exact: true }).selectOption("zel");
  await dialog.getByLabel("Ministério", { exact: true }).selectOption("i");
  await expect(dialog.getByLabel("Categoria", { exact: true })).toHaveValue("");
  await expect(
    dialog.getByLabel("Categoria", { exact: true }).locator("option"),
  ).not.toContainText(["Zelador"]);
});
test("edição simples envia valor, categoria, versão e motivo para auditoria", async ({
  page,
}, info) => {
  const writes = await setup(page);
  await go(page, "Movimentações");
  await page
    .getByRole("button", { name: "Editar movimentação 1", exact: true })
    .click();
  await page.getByLabel("Valor (R$)", { exact: true }).fill("12,50");
  await page.getByLabel("Categoria", { exact: true }).selectOption("c");
  await page
    .getByLabel("Motivo da correção")
    .fill("Valor e categoria digitados incorretamente");
  await page
    .getByRole("dialog")
    .screenshot({ path: info.outputPath("edicao.png") });
  await page
    .getByRole("button", { name: "Salvar correção", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(writes.find((w) => w.path === "/operations/op")?.body).toMatchObject({
    version: 0,
    amount_cents: 1250,
    category_id: "c",
    reason: "Valor e categoria digitados incorretamente",
  });
});
test("edição do usuário permite selecionar ministério", async ({ page }) => {
  const writes = await setup(page);
  const row = page.locator("tr").filter({ hasText: "Ivan" });
  await row.getByRole("button", { name: "Editar", exact: true }).click();
  await page.getByRole("radio", { name: "Somente os selecionados" }).check();
  await page
    .getByRole("checkbox", { name: "Ministério Infantil", exact: true })
    .check();
  await page
    .getByRole("button", { name: "Salvar usuário", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(writes.find((w) => w.path === "/users/u")?.body.box_ids).toEqual([
    "i",
  ]);
});
test("histórico usa filtros na consulta e na exportação CSV", async ({
  page,
}, info) => {
  await setup(page);
  await go(page, "Histórico de atividades");
  await page.getByLabel("Histórico: data inicial").fill("2026-11-01");
  await page.getByLabel("Histórico: data final").fill("2026-11-26");
  await page.getByLabel("Histórico: usuário").selectOption("u");
  await page.getByLabel("Histórico: ação").selectOption("update");
  await expect(
    page.getByRole("button", { name: "Exportar CSV" }),
  ).toBeEnabled();
  await page.screenshot({
    path: info.outputPath("historico.png"),
    fullPage: true,
  });
  const req = page.waitForRequest((r) => r.url().includes("/api/audit/export"));
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar CSV" }).click();
  const url = new URL((await req).url());
  expect(Object.fromEntries(url.searchParams)).toEqual({
    from: "2026-11-01",
    to: "2026-11-26",
    user_id: "u",
    action: "update",
  });
  expect((await download).suggestedFilename()).toBe("historico-atividades.csv");
});
