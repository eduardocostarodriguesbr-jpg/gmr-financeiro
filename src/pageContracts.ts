type Row = Record<string, unknown>;
const object = (v: unknown): v is Row =>
  !!v && typeof v === "object" && !Array.isArray(v);
const strings = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string");

// Reject incompatible payloads instead of displaying missing financial data as zero.
export function validatePageResponse(path: string, data: unknown): unknown {
  const resource = path.split("?")[0];
  const list = [
    "/accounts",
    "/boxes",
    "/categories",
    "/users",
    "/profiles",
    "/audit",
    "/operations",
  ];
  let valid = true;
  if (list.includes(resource)) {
    valid =
      Array.isArray(data) &&
      data.every(
        (row) =>
          object(row) &&
          typeof row.id === "string" &&
          (resource === "/operations"
            ? typeof row.movement_date === "string" &&
              /^\d{4}-\d{2}-\d{2}$/.test(row.movement_date) &&
              Number.isSafeInteger(row.amount_cents)
            : resource === "/profiles"
              ? typeof row.name === "string" && strings(row.permissions)
              : resource === "/audit"
                ? typeof row.created_at === "string"
                : typeof row.name === "string"),
      );
  } else if (resource === "/dashboard" || resource === "/balances") {
    valid =
      object(data) &&
      Array.isArray(data.accounts) &&
      Array.isArray(data.boxes) &&
      Array.isArray(data.positions) &&
      data.accounts.every(
        (row) =>
          object(row) &&
          Number.isSafeInteger(row.balance_cents) &&
          Number.isSafeInteger(row.unallocated_cents),
      ) &&
      data.boxes.every(
        (row) => object(row) && Number.isSafeInteger(row.balance_cents),
      );
    if (resource === "/dashboard")
      valid =
        valid &&
        object(data) &&
        object(data.totals) &&
        Number.isSafeInteger(data.totals.income) &&
        Number.isSafeInteger(data.totals.expense);
  }
  if (!valid)
    throw new Error(
      "Resposta incompatível com esta tela. Tente novamente ou contate o suporte.",
    );
  return data;
}
