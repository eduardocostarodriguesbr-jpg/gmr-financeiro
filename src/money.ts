export function parseCents(input: string): number {
  const value = input.trim();
  if (!/^-?(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(value)) return NaN;
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = value
    .replace(/^-/, "")
    .replace(/\./g, "")
    .split(",");
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(result) ? (negative ? -result : result) : NaN;
}
