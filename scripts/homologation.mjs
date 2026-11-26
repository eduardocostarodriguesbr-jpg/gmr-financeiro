import assert from "node:assert/strict";
export async function verifyHomologation({
  request,
  create,
  admin,
  master,
  base,
  date,
}) {
  const adminId = (await request("/me", { cookie: admin })).data.id;
  const geral = await create("/boxes", { name: "Administração Geral" });
  const infantil = await create("/boxes", { name: "Ministério Infantil" });
  const zelador = await create("/categories", {
    name: "Zelador",
    movement_type: "expense",
    box_ids: [geral.id],
  });
  const comum = await create("/categories", {
    name: "Compartilhada",
    movement_type: "both",
    box_ids: [geral.id, infantil.id],
  });
  const account = await create("/accounts", {
    name: "Banco homologação",
    type: "bank",
  });
  const cash = await create("/accounts", {
    name: "Dinheiro homologação",
    type: "cash",
  });
  const operation = (type, box, category, amount = 1000, extra = {}) => ({
    type,
    account_id: account.id,
    box_id: box.id,
    category_id: category.id,
    amount_cents: amount,
    movement_date: date,
    description: "Teste de homologação",
    payment_method: type === "expense" ? "pix" : null,
    ...extra,
  });
  const post = (body, expected = 400, cookie = admin) =>
    request("/operations", { method: "POST", cookie, body, expected });
  await post(operation("income", geral, zelador));
  await post(operation("expense", infantil, zelador));
  await request("/categories", {
    method: "POST",
    cookie: admin,
    body: { name: "Inválida", movement_type: "oops" },
    expected: 400,
  });
  await request("/categories", {
    method: "POST",
    cookie: admin,
    body: { name: "Sem ministério", box_ids: [] },
    expected: 400,
  });
  await request("/categories", {
    method: "POST",
    cookie: admin,
    body: { name: "Inexistente", box_ids: ["missing"] },
    expected: 400,
  });
  let cats = (await request("/categories", { cookie: admin })).data;
  assert.equal(cats.find((c) => c.id === zelador.id).movement_type, "expense");
  assert.deepEqual(
    cats.find((c) => c.id === comum.id).box_ids.sort(),
    [geral.id, infantil.id].sort(),
  );
  const receita = await create(
    "/operations",
    operation("income", geral, comum, 10000),
  );
  const despesa = await create(
    "/operations",
    operation("expense", geral, zelador, 1000),
  );
  const child = await create(
    "/operations",
    operation("income", infantil, comum, 2000),
  );
  const getOp = async (id, cookie = admin) =>
    (await request("/operations", { cookie })).data.find((o) => o.id === id);
  const editBody = (op, extra = {}) => ({
    version: op.version,
    description: "Corrigido",
    movement_date: date,
    category_id: op.category_id,
    subcategory_id: null,
    amount_cents: op.amount_cents,
    reason: "Correção de digitação",
    ...extra,
  });
  const patch = (op, body, expected = 200, cookie = admin) =>
    request("/operations/" + op.id, {
      method: "PATCH",
      cookie,
      body,
      expected,
    });
  let op = await getOp(despesa.id);
  await patch(op, editBody(op, { category_id: comum.id, amount_cents: 1500 }));
  let saved = await getOp(op.id);
  assert.equal(saved.amount_cents, 1500);
  assert.equal(saved.category_id, comum.id);
  assert.equal(saved.version, 1);
  let balance = (await request("/balances", { cookie: admin })).data;
  assert.equal(
    balance.accounts.find((a) => a.id === account.id).balance_cents,
    10500,
  );
  await patch(op, editBody(op), 409); // stale client
  await patch(saved, editBody(saved, { type: "income" }), 400);
  await patch(saved, editBody(saved, { box_id: infantil.id }), 400);
  await patch(saved, editBody(saved, { account_id: cash.id }), 400);
  await patch(saved, editBody(saved, { reason: "" }), 400);
  await patch(saved, editBody(saved, { amount_cents: 1.2 }), 400);
  await patch(saved, editBody(saved, { amount_cents: 0 }), 400);
  const wrongSub = await create("/subcategories", {
    name: "Outra categoria",
    category_id: zelador.id,
  });
  await patch(saved, editBody(saved, { subcategory_id: wrongSub.id }), 400);
  const opening = (await request("/operations", { cookie: admin })).data.find(
    (o) => o.type === "opening",
  );
  await patch(opening, editBody(opening), 400);
  await patch(saved, editBody(saved, { amount_cents: 20000 }), 409);
  assert.equal((await getOp(op.id)).amount_cents, 1500); // failed edit did not partially change balance
  // Competing clients may not apply both their differences or lose an audit record.
  const headers = {
    Cookie: admin,
    "Content-Type": "application/json",
    "X-GMR-Request": "1",
  };
  const concurrent = await Promise.all(
    [1600, 1700].map((amount) =>
      fetch(base + "/operations/" + saved.id, {
        method: "PATCH",
        headers,
        body: JSON.stringify(editBody(saved, { amount_cents: amount })),
      }),
    ),
  );
  assert.deepEqual(concurrent.map((r) => r.status).sort(), [200, 409]);
  saved = await getOp(saved.id);
  balance = (await request("/balances", { cookie: admin })).data;
  assert.equal(
    balance.accounts.find((a) => a.id === account.id).balance_cents,
    12000 - saved.amount_cents,
  );
  const cashIncome = await create(
    "/operations",
    operation("income", geral, comum, 1000, { account_id: cash.id }),
  );
  await create(
    "/operations",
    operation("expense", geral, comum, 800, {
      account_id: cash.id,
      payment_method: "cash",
    }),
  );
  const ci = await getOp(cashIncome.id);
  await patch(
    ci,
    editBody(ci, { amount_cents: 100, confirm_negative: true }),
    400,
  );
  assert.equal((await getOp(ci.id)).amount_cents, 1000);
  assert.equal(
    (await request("/balances", { cookie: admin })).data.accounts.find(
      (a) => a.id === cash.id,
    ).balance_cents,
    200,
  );
  // Category edits do not rewrite history. Future writes must honor the current rules.
  await request("/categories/" + zelador.id, {
    method: "PATCH",
    cookie: admin,
    body: { movement_type: "expense", box_ids: [geral.id, infantil.id] },
  });
  await post(operation("income", infantil, zelador));
  await request("/categories/" + zelador.id, {
    method: "PATCH",
    cookie: admin,
    body: { box_ids: [geral.id] },
  });
  // Classification-only corrections do not reopen a closed account or move funds.
  const closed = await create("/accounts", {
    name: "Conta encerrada homologação",
    type: "bank",
  });
  const closedIncome = await create(
    "/operations",
    operation("income", geral, comum, 100, { account_id: closed.id }),
  );
  await create(
    "/operations",
    operation("expense", geral, comum, 100, { account_id: closed.id }),
  );
  await request("/accounts/" + closed.id, {
    method: "PATCH",
    cookie: admin,
    body: { active: false },
  });
  const closedRow = await getOp(closedIncome.id);
  await patch(
    closedRow,
    editBody(closedRow, { description: "Classificação conferida" }),
  );
  const closedEdited = await getOp(closedIncome.id);
  await patch(closedEdited, editBody(closedEdited, { amount_cents: 200 }), 400);
  const scopedPermissions = [
    "dashboard.view",
    "movements.view",
    "movements.create",
    "movements.edit",
    "accounts.view",
    "boxes.view",
    "categories.view",
    "audit.view",
    "audit.export",
  ];
  const scopedProfile = await create("/profiles", {
    name: "Responsável por ministério",
    permissions: scopedPermissions,
  });
  const scoped = await create("/users", {
    name: "=2+2",
    login: "scope",
    password: "Synthetic!Pass123",
    profile_id: scopedProfile.id,
    box_ids: [infantil.id],
  });
  await request("/profiles/" + scopedProfile.id, {
    method: "PATCH",
    cookie: admin,
    body: {
      name: "Responsável por ministério",
      permissions: [...scopedPermissions, "users.manage", "profiles.manage"],
    },
    expected: 400,
  });
  await request("/users/" + scoped.id, {
    method: "PATCH",
    cookie: admin,
    body: { box_ids: ["missing"] },
    expected: 400,
  });
  let sc = (
    await request("/login", {
      method: "POST",
      body: { login: "scope", password: "Synthetic!Pass123" },
    })
  ).cookie;
  await request("/password", {
    method: "POST",
    cookie: sc,
    body: {
      current_password: "Synthetic!Pass123",
      password: "Synthetic!Next123",
    },
  });
  sc = (
    await request("/login", {
      method: "POST",
      body: { login: "scope", password: "Synthetic!Next123" },
    })
  ).cookie;
  assert.deepEqual((await request("/me", { cookie: sc })).data.box_ids, [
    infantil.id,
  ]);
  assert.deepEqual(
    (await request("/boxes", { cookie: sc })).data.map((b) => b.id),
    [infantil.id],
  );
  cats = (await request("/categories", { cookie: sc })).data;
  assert(!cats.some((c) => c.id === zelador.id));
  assert.deepEqual(cats.find((c) => c.id === comum.id).box_ids, [infantil.id]);
  let scopedRows = (await request("/operations", { cookie: sc })).data;
  assert(scopedRows.every((r) => r.box_id === infantil.id));
  assert(!scopedRows.some((r) => r.id === receita.id));
  assert.deepEqual(
    (await request("/operations?box_id=" + geral.id, { cookie: sc })).data,
    [],
  );
  const sb = (await request("/balances", { cookie: sc })).data;
  assert.equal(
    sb.accounts.find((a) => a.id === account.id).balance_cents,
    2000,
  );
  assert(sb.accounts.every((a) => a.unallocated_cents === 0));
  assert(sb.positions.every((p) => p.box_id === infantil.id));
  const sd = (
    await request("/dashboard?from=" + date + "&to=" + date, { cookie: sc })
  ).data;
  assert.equal(sd.totals.income, 2000);
  assert.equal(sd.totals.expense, 0);
  await post(operation("income", geral, comum), 403, sc);
  await patch(saved, editBody(saved), 403, sc);
  await request("/users", { cookie: sc, expected: 403 });
  await request("/profiles", { cookie: sc, expected: 403 });
  await request("/users/" + scoped.id, {
    method: "PATCH",
    cookie: sc,
    body: { box_ids: null },
    expected: 403,
  });
  await request("/categories/" + comum.id, {
    method: "PATCH",
    cookie: sc,
    body: { box_ids: null },
    expected: 403,
  });
  await request("/users/" + adminId, {
    method: "PATCH",
    cookie: admin,
    body: { box_ids: [infantil.id] },
    expected: 400,
  });
  const childRow = await getOp(child.id, sc);
  await patch(childRow, editBody(childRow, { amount_cents: 2500 }), 200, sc);
  const scopedCreate = await post(
    operation("income", infantil, comum, 100),
    201,
    sc,
  );
  const readOnlyProfile = await create("/profiles", {
    name: "Sem edição ou exportação",
    permissions: ["movements.view", "audit.view"],
  });
  const readOnly = await create("/users", {
    name: "Consulta homologação",
    login: "ro-homolog",
    password: "Synthetic!Pass123",
    profile_id: readOnlyProfile.id,
  });
  let ro = (
    await request("/login", {
      method: "POST",
      body: { login: "ro-homolog", password: "Synthetic!Pass123" },
    })
  ).cookie;
  await request("/password", {
    method: "POST",
    cookie: ro,
    body: {
      current_password: "Synthetic!Pass123",
      password: "Synthetic!Next123",
    },
  });
  ro = (
    await request("/login", {
      method: "POST",
      body: { login: "ro-homolog", password: "Synthetic!Next123" },
    })
  ).cookie;
  await patch(saved, editBody(saved), 403, ro);
  const forbidden = await fetch(base + "/audit/export", {
    headers: { Cookie: ro },
  });
  assert.equal(forbidden.status, 403);
  const filtered = (
    await request("/audit?action=update&user_id=" + adminId, { cookie: admin })
  ).data;
  assert(
    filtered.length > 0 &&
      filtered.every((r) => r.action === "update" && r.user_id === adminId),
  );
  const changed = filtered.find(
    (r) => r.record_id === saved.id && JSON.parse(r.after_json).version === 1,
  );
  assert.equal(JSON.parse(changed.before_json).amount_cents, 1000);
  assert.equal(JSON.parse(changed.after_json).amount_cents, 1500);
  assert.equal(JSON.parse(changed.after_json).reason, "Correção de digitação");
  await request("/audit?from=2026-02-30", { cookie: admin, expected: 400 });
  await request("/audit?from=2026-11-26&to=2026-11-01", {
    cookie: admin,
    expected: 400,
  });
  await request("/audit?offset=-1", { cookie: admin, expected: 400 });
  assert.deepEqual(
    (await request("/audit?from=2099-01-01", { cookie: admin })).data,
    [],
  );
  const sa = (await request("/audit", { cookie: sc })).data;
  assert(
    sa.length > 0 &&
      sa.every((r) => JSON.parse(r.after_json).box_id === infantil.id),
  );
  assert(!sa.some((r) => r.record_id === saved.id));
  const options = (await request("/audit/options", { cookie: sc })).data;
  assert(options.users.some((u) => u.id === scoped.id));
  const exported = await fetch(base + "/audit/export?user_id=" + scoped.id, {
    headers: { Cookie: sc },
  });
  assert.equal(exported.status, 200);
  assert(exported.headers.get("content-type").includes("text/csv"));
  const csv = await exported.text();
  assert(csv.includes("'=2+2"));
  assert(!csv.includes(saved.id));
  assert(csv.includes(scopedCreate.data.id));
  const masterExport = await fetch(base + "/audit/export", {
    headers: { Cookie: master },
  });
  assert.equal(masterExport.status, 200);
  assert(!(await masterExport.text()).includes("Proprietário teste"));
  // Revoking the scope invalidates old sessions immediately.
  await request("/users/" + scoped.id, {
    method: "PATCH",
    cookie: admin,
    body: { box_ids: [] },
  });
  await request("/me", { cookie: sc, expected: 401 });
  sc = (
    await request("/login", {
      method: "POST",
      body: { login: "scope", password: "Synthetic!Next123" },
    })
  ).cookie;
  assert.deepEqual((await request("/operations", { cookie: sc })).data, []);
  assert(
    (await request("/balances", { cookie: sc })).data.accounts.every(
      (a) => a.balance_cents === 0,
    ),
  );
  assert.deepEqual((await request("/audit", { cookie: sc })).data, []);
  return 5; // raw fetch checks outside request(): concurrent edits + exports tested above
}
