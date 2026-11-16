import { describe, test, expect } from "bun:test";
import parseCurrencyToNumber from "../number";

describe("parseCurrencyToNumber", () => {
  test("converts R$ 1.234,56 to 1234.56", () => {
    expect(parseCurrencyToNumber("R$ 1.234,56")).toBe(1234.56);
  });

  test("converts R$ 850,00 to 850", () => {
    expect(parseCurrencyToNumber("R$ 850,00")).toBe(850);
  });

  test("converts plain 2.500,50 to 2500.5", () => {
    expect(parseCurrencyToNumber("2.500,50")).toBe(2500.5);
  });

  test("converts without thousands separator: 900,00 to 900", () => {
    expect(parseCurrencyToNumber("900,00")).toBe(900);
  });

  test("handles string with extra whitespace", () => {
    expect(parseCurrencyToNumber("  R$   1.000,00  ")).toBe(1000);
  });

  test("returns NaN for empty string", () => {
    expect(Number.isNaN(parseCurrencyToNumber(""))).toBe(true);
  });

  test("returns NaN for string without numbers", () => {
    expect(Number.isNaN(parseCurrencyToNumber("grátis"))).toBe(true);
  });

  test("converts Brazilian thousands without decimals: R$ 1.400 to 1400", () => {
    expect(parseCurrencyToNumber("R$ 1.400")).toBe(1400);
  });

  test("handles dot-decimal string and finite numbers", () => {
    expect(parseCurrencyToNumber("1234.56")).toBe(1234.56);
    expect(parseCurrencyToNumber(1500)).toBe(1500);
    expect(Number.isNaN(parseCurrencyToNumber(undefined))).toBe(true);
  });
});
