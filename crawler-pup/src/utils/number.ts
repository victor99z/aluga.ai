export function parseCurrencyToNumber(
  currency: string | number | undefined | null,
): number {
  if (typeof currency === "number") {
    return Number.isFinite(currency) ? currency : NaN;
  }

  if (!currency) return NaN;

  const cleaned = currency.replace(/[^\d.,-]/g, "").trim();
  if (!cleaned || !/\d/.test(cleaned)) return NaN;

  // Brazilian format with decimal comma (e.g. "1.234,56" or "900,00")
  if (cleaned.includes(",")) {
    return parseFloat(cleaned.replace(/\./g, "").replace(",", "."));
  }

  // Brazilian thousands separator without decimals (e.g. "1.400" or "1.200.000")
  if (/^-?\d{1,3}(\.\d{3})+$/.test(cleaned)) {
    return parseFloat(cleaned.replace(/\./g, ""));
  }

  return parseFloat(cleaned);
}

export default parseCurrencyToNumber;
