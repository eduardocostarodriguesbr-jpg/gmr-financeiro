import { spawn, spawnSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { provisionMaster } from "./provision-master.mjs";

const root = process.cwd(),
  wrangler = resolve("node_modules/wrangler/bin/wrangler.js");
const state = resolve("../../work", "integration-" + Date.now());
await mkdir(state, { recursive: true });
const migration = spawnSync(
  process.execPath,
  [
    wrangler,
    "d1",
    "migrations",
    "apply",
    "DB",
    "--local",
    "--persist-to",
    state,
  ],
  {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
  },
);
if (migration.status !== 0)
  throw new Error(
    "Falha nas migrations: " + migration.stdout + migration.stderr,
  );
const server = spawn(
  process.execPath,
  [wrangler, "dev", "--port", "8790", "--persist-to", state, "--local"],
  {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
  },
);
let logs = "";
server.stdout.on("data", (d) => (logs += d));
server.stderr.on("data", (d) => (logs += d));
const base = "http://127.0.0.1:8790/api";
let checks = 0;
async function request(
  path,
  { method = "GET", body, cookie, expected = 200 } = {},
) {
  const r = await fetch(base + path, {
    method,
    headers: {
      ...(method === "GET"
        ? {}
        : { "Content-Type": "application/json", "X-GMR-Request": "1" }),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await r.json();
  assert.equal(
    r.status,
    expected,
    `${method} ${path}: ${JSON.stringify(data)}`,
  );
  checks++;
  return { data, cookie: r.headers.get("set-cookie")?.split(";")[0] };
}
const pass = () => randomBytes(20).toString("hex");
const masterPass = "Teste!8x",
  temp = pass(),
  adminPass = pass();
const date = "2026-11-24";
try {
  let ready = false;
  for (let i = 0; i < 90; i++) {
    try {
      const r = await fetch(base + "/setup");
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!ready) throw new Error("Servidor não iniciou: " + logs);
  const bootstrap = await request("/setup");
  assert.deepEqual(bootstrap.data, { registration_enabled: true });
  await request("/setup", { method: "POST", body: {}, expected: 404 });
  const masterTemporary = pass();
  await provisionMaster({
    persistTo: state,
    login: "owner",
    password: masterTemporary,
  });
  let master = (
    await request("/login", {
      method: "POST",
      body: { login: "owner", password: masterTemporary },
    })
  ).cookie;
  await request("/accounts", { cookie: master, expected: 403 });
  await request("/logout", { method: "POST", cookie: master, body: {} });
  await request("/me", { cookie: master, expected: 401 });
  master = (
    await request("/login", {
      method: "POST",
      body: { login: "owner", password: masterTemporary },
    })
  ).cookie;
  assert.equal(
    (await request("/me", { cookie: master })).data.must_change,
    true,
  );
  await request("/password", {
    method: "POST",
    cookie: master,
    body: { current_password: masterTemporary, password: "Abc!123" },
    expected: 400,
  });
  await request("/password", {
    method: "POST",
    cookie: master,
    body: { current_password: masterTemporary, password: masterPass },
  });
  await request("/me", { cookie: master, expected: 401 });
  master = (
    await request("/login", {
      method: "POST",
      body: { login: "owner", password: masterPass },
    })
  ).cookie;
  await request("/register", {
    method: "POST",
    body: {
      name: "Administrador teste",
      login: "admin",
      password: temp,
      requested_role: "responsible",
      is_master: 1,
      active: true,
    },
    expected: 202,
  });
  await request("/login", {
    method: "POST",
    body: { login: "admin", password: temp },
    expected: 401,
  });
  const registrations = (await request("/users", { cookie: master })).data;
  assert.equal(registrations.length, 1);
  assert.equal(registrations[0].active, 0);
  assert.equal(registrations[0].approval_state, "pending");
  const profiles = (await request("/profiles", { cookie: master })).data;
  assert(!profiles.some((p) => p.id === "system-pending"));
  const adminProfile = profiles.find((p) => p.name === "Administrador");
  await request("/users/" + registrations[0].id, {
    method: "PATCH",
    cookie: master,
    body: { active: true, profile_id: adminProfile.id },
    expected: 403,
  });
  await request("/users/" + registrations[0].id + "/approve", {
    method: "POST",
    cookie: master,
    body: { profile_id: adminProfile.id },
  });
  let admin = (
    await request("/login", {
      method: "POST",
      body: { login: "admin", password: temp },
    })
  ).cookie;
  await request("/accounts", { cookie: admin });
  await request("/password", {
    method: "POST",
    cookie: admin,
    body: { current_password: temp, password: adminPass },
  });
  await request("/me", { cookie: admin, expected: 401 });
  admin = (
    await request("/login", {
      method: "POST",
      body: { login: "admin", password: adminPass },
    })
  ).cookie;
  const users = (await request("/users", { cookie: admin })).data;
  assert.equal(users.length, 1);
  assert(!JSON.stringify(users).includes("owner"));
  await request("/users/" + users[0].id, {
    method: "PATCH",
    cookie: admin,
    body: { active: false },
    expected: 400,
  });
  const create = async (path, body) =>
    (
      await request(path, {
        method: "POST",
        cookie: admin,
        body,
        expected: 201,
      })
    ).data;
  const bank = await create("/accounts", { name: "Itaú", type: "bank" }),
    cash = await create("/accounts", { name: "Espécie", type: "cash" }),
    box = await create("/boxes", { name: "Jovens" }),
    cat = await create("/categories", { name: "Ofertas" }),
    otherCat = await create("/categories", { name: "Outras" });
  const sub = await create("/subcategories", {
    name: "Culto",
    category_id: cat.id,
  });
  const operation = (type, account, amount, extra = {}) => ({
    type,
    account_id: account.id,
    box_id: box.id,
    category_id: cat.id,
    amount_cents: amount,
    movement_date: date,
    description: "Movimentação de teste",
    ...extra,
  });
  await create("/operations", operation("opening", bank, 10000));
  await request("/operations", {
    method: "POST",
    cookie: admin,
    body: operation("opening", bank, 1000),
    expected: 409,
  });
  await create("/operations", operation("income", cash, 2000));
  await create(
    "/operations",
    operation("expense", cash, 500, { payment_method: "cash" }),
  );
  let bal = (await request("/balances", { cookie: admin })).data;
  assert.equal(bal.accounts.find((x) => x.id === cash.id).balance_cents, 1500);
  assert.equal(
    bal.accounts.find((x) => x.id === bank.id).unallocated_cents,
    10000,
  );
  await request("/operations", {
    method: "POST",
    cookie: admin,
    body: operation("expense", cash, 1600, {
      payment_method: "cash",
      confirm_negative: true,
    }),
    expected: 400,
  });
  await request("/operations", {
    method: "POST",
    cookie: admin,
    body: operation("income", cash, 0),
    expected: 400,
  });
  await request("/operations", {
    method: "POST",
    cookie: admin,
    body: operation("income", cash, 5.5),
    expected: 400,
  });
  await request("/operations", {
    method: "POST",
    cookie: admin,
    body: operation("income", cash, 100, {
      category_id: otherCat.id,
      subcategory_id: sub.id,
    }),
    expected: 400,
  });
  await request("/operations", {
    method: "POST",
    cookie: admin,
    body: operation("income", cash, 100, { movement_date: "2026-02-30" }),
    expected: 400,
  });
  await request("/operations", {
    method: "POST",
    cookie: admin,
    body: operation("expense", bank, 20000, { payment_method: "pix" }),
    expected: 409,
  });
  await create(
    "/operations",
    operation("expense", bank, 20000, {
      payment_method: "pix",
      confirm_negative: true,
    }),
  );
  await request("/accounts/" + cash.id, {
    method: "PATCH",
    cookie: admin,
    body: { active: false },
    expected: 400,
  });
  const zero = await create("/accounts", {
    name: "Conta zerada",
    type: "bank",
  });
  await request("/accounts/" + zero.id, {
    method: "PATCH",
    cookie: admin,
    body: { active: false },
  });
  await request("/operations", {
    method: "POST",
    cookie: admin,
    body: operation("income", zero, 100),
    expected: 400,
  });
  const profile = await create("/profiles", {
    name: "Consulta",
    permissions: ["dashboard.view", "movements.view"],
    description: "Somente leitura",
  });
  const viewerPass = pass(),
    viewerNext = pass(),
    viewer = await create("/users", {
      name: "Consulta teste",
      login: "viewer",
      password: viewerPass,
      profile_id: profile.id,
    });
  let vc = (
    await request("/login", {
      method: "POST",
      body: { login: "viewer", password: viewerPass },
    })
  ).cookie;
  await request("/password", {
    method: "POST",
    cookie: vc,
    body: { current_password: viewerPass, password: viewerNext },
  });
  vc = (
    await request("/login", {
      method: "POST",
      body: { login: "viewer", password: viewerNext },
    })
  ).cookie;
  await request("/operations", { cookie: vc });
  await request("/operations", {
    method: "POST",
    cookie: vc,
    body: operation("income", bank, 100),
    expected: 403,
  });
  await request("/users", { cookie: vc, expected: 403 });
  await request("/profiles/" + profile.id, {
    method: "PATCH",
    cookie: admin,
    body: { name: "Consulta", permissions: ["dashboard.view"], active: false },
    expected: 400,
  });
  await request("/settings", {
    method: "POST",
    cookie: admin,
    body: { adjustment_approval: "dual" },
  });
  const dual = await create("/accounts", {
      name: "Conta com aprovação",
      type: "bank",
    }),
    pending = await create("/operations", operation("opening", dual, 5000));
  assert.equal(pending.status, "pending");
  bal = (await request("/balances", { cookie: admin })).data;
  assert.equal(bal.accounts.find((x) => x.id === dual.id).balance_cents, 0);
  await request("/operations/" + pending.id + "/approve", {
    method: "POST",
    cookie: admin,
    body: {},
    expected: 403,
  });
  await request("/operations/" + pending.id + "/approve", {
    method: "POST",
    cookie: master,
    body: {},
  });
  await request("/operations/" + pending.id + "/approve", {
    method: "POST",
    cookie: master,
    body: {},
    expected: 404,
  });
  bal = (await request("/balances", { cookie: admin })).data;
  assert.equal(bal.accounts.find((x) => x.id === dual.id).balance_cents, 5000);
  const audits = (await request("/audit", { cookie: admin })).data;
  assert(audits.length > 0);
  assert(!JSON.stringify(audits).includes(masterPass));
  assert(!JSON.stringify(audits).includes("Proprietário teste"));
  assert(!audits.some((x) => x.action === "approve"));
  const masterAudit = (await request("/audit", { cookie: master })).data;
  assert(!masterAudit.some((x) => x.action === "approve"));
  await request("/users/" + viewer.id, {
    method: "PATCH",
    cookie: admin,
    body: { password: pass() },
  });
  await request("/me", { cookie: vc, expected: 401 });
  const withdrawals = await Promise.all(
    [1, 2].map(() =>
      fetch(base + "/operations", {
        method: "POST",
        headers: {
          Cookie: admin,
          "Content-Type": "application/json",
          "X-GMR-Request": "1",
        },
        body: JSON.stringify(
          operation("expense", cash, 1000, {
            payment_method: "cash",
            confirm_negative: true,
          }),
        ),
      }),
    ),
  );
  const withdrawalStatuses = withdrawals.map((r) => r.status);
  assert.equal(withdrawalStatuses.filter((s) => s === 201).length, 1);
  assert.equal(
    withdrawalStatuses.filter((s) => s === 400 || s === 409).length,
    1,
  );
  checks += 2;
  bal = (await request("/balances", { cookie: admin })).data;
  assert.equal(bal.accounts.find((x) => x.id === cash.id).balance_cents, 500);
  const dashboard = (
    await request("/dashboard?from=2026-11-24&to=2026-11-24", { cookie: admin })
  ).data;
  assert.equal(dashboard.totals.income, 2000);
  assert.equal(dashboard.totals.expense, 21500);
  const badOrigin = await fetch(base + "/accounts", {
    method: "POST",
    headers: {
      Cookie: admin,
      "Content-Type": "application/json",
      "X-GMR-Request": "1",
      Origin: "https://other.example",
    },
    body: JSON.stringify({ name: "Origem inválida", type: "bank" }),
  });
  assert.equal(badOrigin.status, 403);
  checks++;
  // Cadastro público não concede acesso, perfil, nem papel privilegiado.
  const signupPass = pass();
  await request("/register", {
    method: "POST",
    body: {
      name: "Nova pessoa",
      login: "new-member",
      password: signupPass,
      requested_role: "member",
      is_master: 1,
      profile_id: adminProfile.id,
      active: true,
    },
    expected: 202,
  });
  await request("/login", {
    method: "POST",
    body: { login: "new-member", password: signupPass },
    expected: 401,
  });
  let requests = (await request("/users", { cookie: admin })).data;
  const pendingUser = requests.find((r) => r.login === "new-member");
  assert.equal(pendingUser.active, 0);
  assert.equal(pendingUser.profile_id, "system-pending");
  await request("/users/" + pendingUser.id + "/approve", {
    method: "POST",
    cookie: admin,
    body: { profile_id: profile.id },
  });
  const newCookie = (
    await request("/login", {
      method: "POST",
      body: { login: "new-member", password: signupPass },
    })
  ).cookie;
  await request("/dashboard", { cookie: newCookie });
  await request("/users/" + pendingUser.id + "/approve", {
    method: "POST",
    cookie: admin,
    body: { profile_id: profile.id },
    expected: 404,
  });
  await request("/institution", { cookie: newCookie });
  await request("/institution", {
    method: "POST",
    cookie: newCookie,
    body: { name: "Não autorizado", logo: "" },
    expected: 403,
  });
  const pixel =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6x8AAAAASUVORK5CYII=";
  await request("/institution", {
    method: "POST",
    cookie: admin,
    body: { name: "Igreja de teste", logo: pixel },
  });
  const identity = (await request("/institution", { cookie: newCookie })).data;
  assert.equal(identity.name, "Igreja de teste");
  assert.equal(identity.logo, pixel);
  await request("/institution", {
    method: "POST",
    cookie: admin,
    body: {
      name: "Igreja de teste",
      logo: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
    },
    expected: 400,
  });
  await request("/institution", {
    method: "POST",
    cookie: admin,
    body: { name: "Igreja de teste", logo: "data:image/png;base64,aGVsbG8=" },
    expected: 400,
  });
  const otherPass = pass();
  await request("/register", {
    method: "POST",
    body: {
      name: "Outro responsável",
      login: "other-responsible",
      password: otherPass,
      requested_role: "responsible",
    },
    expected: 202,
  });
  requests = (await request("/users", { cookie: admin })).data;
  const responsible = requests.find((r) => r.login === "other-responsible");
  await request("/users/" + responsible.id + "/approve", {
    method: "POST",
    cookie: admin,
    body: { profile_id: adminProfile.id },
    expected: 403,
  });
  await request("/users/" + responsible.id + "/reject", {
    method: "POST",
    cookie: master,
    body: {},
  });
  await request("/login", {
    method: "POST",
    body: { login: "other-responsible", password: otherPass },
    expected: 401,
  });
  await request("/users/" + responsible.id, {
    method: "PATCH",
    cookie: admin,
    body: { active: true },
    expected: 403,
  });
  await request("/register", {
    method: "POST",
    body: {
      name: "Repetido",
      login: "new-member",
      password: pass(),
      requested_role: "member",
    },
    expected: 202,
  });
  assert.equal(
    (await request("/users", { cookie: admin })).data.filter(
      (r) => r.login === "new-member",
    ).length,
    1,
  );
  await request("/users/" + users[0].id, {
    method: "PATCH",
    cookie: newCookie,
    body: { profile_id: adminProfile.id },
    expected: 403,
  });
  await request("/profiles", { cookie: newCookie, expected: 403 });
  const profilesAfter = (await request("/profiles", { cookie: admin })).data;
  assert(!profilesAfter.some((p) => p.id === "system-pending"));
  assert(!JSON.stringify(profilesAfter).includes("password_hash"));
  const approverProfile = await create("/profiles", {
    name: "Aprovador delegado",
    permissions: ["users.approve", "dashboard.view", "movements.view"],
  });
  const approverTemporary = pass(),
    approverSecret = pass();
  await create("/users", {
    name: "Aprovador teste",
    login: "approver",
    password: approverTemporary,
    profile_id: approverProfile.id,
  });
  let approverCookie = (
    await request("/login", {
      method: "POST",
      body: { login: "approver", password: approverTemporary },
    })
  ).cookie;
  await request("/password", {
    method: "POST",
    cookie: approverCookie,
    body: { current_password: approverTemporary, password: approverSecret },
  });
  approverCookie = (
    await request("/login", {
      method: "POST",
      body: { login: "approver", password: approverSecret },
    })
  ).cookie;
  const delegatedPass = pass();
  await request("/register", {
    method: "POST",
    body: {
      name: "Acesso delegado",
      login: "delegated-member",
      password: delegatedPass,
      requested_role: "member",
    },
    expected: 202,
  });
  const pendingForApprover = (
    await request("/users", { cookie: approverCookie })
  ).data;
  assert(pendingForApprover.every((r) => r.approval_state === "pending"));
  const delegated = pendingForApprover.find(
    (r) => r.login === "delegated-member",
  );
  assert(delegated);
  const assignable = (
    await request("/approval-profiles", { cookie: approverCookie })
  ).data;
  assert(!assignable.some((p) => p.id === adminProfile.id));
  await request("/users/" + delegated.id + "/approve", {
    method: "POST",
    cookie: approverCookie,
    body: { profile_id: adminProfile.id },
    expected: 403,
  });
  await request("/users/" + delegated.id + "/approve", {
    method: "POST",
    cookie: approverCookie,
    body: { profile_id: profile.id },
  });
  await request("/login", {
    method: "POST",
    body: { login: "delegated-member", password: delegatedPass },
  });
  const r = await fetch(base + "/accounts", {
    method: "POST",
    headers: { Cookie: admin, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Sem proteção", type: "bank" }),
  });
  assert.equal(r.status, 403);
  checks++;
  const html = await fetch("http://127.0.0.1:8790");
  assert.equal(html.status, 200);
  assert((await html.text()).includes("GMR"));
  checks++;
  console.log(
    `OK: ${checks} verificações de API, segurança e integridade financeira. Banco de teste isolado.`,
  );
} finally {
  if (process.platform === "win32")
    spawnSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], {
      stdio: "ignore",
    });
  else server.kill("SIGTERM");
}
