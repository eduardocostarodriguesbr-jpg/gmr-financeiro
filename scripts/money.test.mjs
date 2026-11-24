import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCents } from "../src/money.ts";

test("valores brasileiros são convertidos sem alterar a ordem de grandeza", () => {
  for (const [input, expected] of [
    ["20,00", 2000],
    ["0,29", 29],
    ["1.234,56", 123456],
    ["1234", 123400],
    ["-10,50", -1050],
    [" 0,1 ", 10],
  ])
    assert.equal(parseCents(input), expected, input);
});
test("separadores ambíguos e precisão extra são rejeitados", () => {
  for (const input of [
    "20.00",
    "1,234",
    "1.23,45",
    "1,2,3",
    "",
    "Infinity",
    "1e6",
    "99999999999999999999",
  ])
    assert(Number.isNaN(parseCents(input)), input);
});
