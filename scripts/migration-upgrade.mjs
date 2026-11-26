import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";
const state = resolve("../../work", "upgrade-" + Date.now());
await mkdir(state, { recursive: true });
const fixture = resolve(state, "fixture.sql"),
  migration = resolve("migrations/0005_homologation.sql");
const files = [
  "0001_initial.sql",
  "0002_integrity.sql",
  "0003_registration_branding.sql",
  "0004_access_decisions.sql",
];
const existing = (
  await Promise.all(
    files.map((f) => readFile(resolve("migrations", f), "utf8")),
  )
).join("\n");
await writeFile(
  fixture,
  existing +
    `
INSERT INTO profiles(id,name,permissions,created_at) VALUES('admin-fixture','Administrador','["users.manage","profiles.manage"]','2026-11-24');
INSERT INTO users(id,name,login,password_hash,is_master,created_at) VALUES('seed','Pessoa fictícia','migration-fixture','test-only-never-used',1,'2026-11-24');
INSERT INTO boxes(id,name,created_by,created_at) VALUES('b','Caixa da Igreja','seed','2026-11-24');
INSERT INTO categories(id,name,created_by,created_at) VALUES('c','Categoria existente','seed','2026-11-24');
INSERT INTO financial_accounts(id,name,type,created_by,created_at) VALUES('a','Conta existente','cash','seed','2026-11-24');
INSERT INTO operations(id,number,type,movement_date,description,status,account_id,box_id,category_id,amount_cents,created_by,created_at) VALUES('op',1,'income','2026-11-24','Existente','effective','a','b','c',1000,'seed','2026-11-24');
INSERT INTO postings(id,operation_id,account_id,box_id,amount_cents,created_at) VALUES('post','op','a','b',1000,'2026-11-24');
`,
);
function execute(args) {
  const result = spawnSync(
    process.execPath,
    [
      resolve("node_modules/wrangler/bin/wrangler.js"),
      "d1",
      "execute",
      "DB",
      "--local",
      "--persist-to",
      state,
      "--json",
      ...args,
    ],
    {
      encoding: "utf8",
      env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
    },
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return JSON.parse(result.stdout);
}
execute(["--file", fixture]);
execute(["--file", migration]);
const rows = execute([
  "--command",
  "SELECT b.id,b.name,c.movement_type,c.all_boxes,o.version,u.box_scope,(SELECT SUM(amount_cents) FROM postings) AS balance,(SELECT COUNT(*) FROM operations) AS operations,(SELECT permissions FROM profiles WHERE id='admin-fixture') AS permissions FROM boxes b,categories c,operations o,users u WHERE b.id='b' AND c.id='c' AND o.id='op' AND u.id='seed'",
])[0].results;
assert.equal(rows.length, 1);
const row = rows[0];
assert.equal(row.name, "Administração Geral");
assert.equal(row.id, "b");
assert.equal(row.movement_type, "both");
assert.equal(row.all_boxes, 1);
assert.equal(row.version, 0);
assert.equal(row.box_scope, null);
assert.equal(row.balance, 1000);
assert.equal(row.operations, 1);
assert(JSON.parse(row.permissions).includes("movements.edit"));
assert(JSON.parse(row.permissions).includes("audit.export"));
console.log(
  "OK: atualização de banco existente preserva IDs, movimentações, saldos e acessos. Apenas D1 local descartável.",
);
