import { test } from "node:test";
import assert from "node:assert/strict";
import { validatePageResponse } from "../src/pageContracts.ts";

test("contratos de operações e perfis rejeitam os registros que causavam tela branca", () => {
  for (const [path, data] of [
    ["/operations", [{ id: "account", name: "Conta" }]],
    [
      "/profiles",
      [{ id: "operation", movement_date: "2026-11-24", amount_cents: 100 }],
    ],
    ["/profiles", [{ id: "p", name: "Perfil", permissions: null }]],
    ["/profiles", {}],
    ["/operations", [null]],
    [
      "/operations",
      [{ id: "op", movement_date: "2026-11-24", amount_cents: "100" }],
    ],
  ])
    assert.throws(
      () => validatePageResponse(path, data),
      /Resposta incompatível/,
    );
});
test("contratos válidos preservam valores monetários e permissões sem coerção", () => {
  const rows = [
    { id: "op", movement_date: "2026-11-24", amount_cents: -12345 },
  ];
  assert.equal(validatePageResponse("/operations?from=2026-11-01", rows), rows);
  const profiles = [
    { id: "p", name: "Perfil", permissions: ["accounts.view"] },
  ];
  assert.equal(validatePageResponse("/profiles", profiles), profiles);
});
test("saldos incompletos são recusados em vez de convertidos em zero", () => {
  assert.throws(
    () =>
      validatePageResponse("/dashboard", {
        accounts: [],
        boxes: [],
        positions: [],
      }),
    /Resposta incompatível/,
  );
  assert.throws(
    () =>
      validatePageResponse("/balances", {
        accounts: [{ balance_cents: "100", unallocated_cents: 0 }],
        boxes: [],
        positions: [],
      }),
    /Resposta incompatível/,
  );
  const b = {
    accounts: [{ balance_cents: 100, unallocated_cents: 100 }],
    boxes: [],
    positions: [],
    totals: { income: 100, expense: 0 },
  };
  assert.equal(validatePageResponse("/dashboard", b), b);
});
