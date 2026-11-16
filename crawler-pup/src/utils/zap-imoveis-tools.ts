export interface ZapImoveisListing {
  title: string;
  href: string;
  neighborhood?: string;
  city?: string;
  address?: string;
  propertyType?: string;
  purpose?: string;
  area_m2?: number;
  bedroom?: number;
  bathroom?: number;
  garage?: number;
  price_aluguel: number;
  price_condominio?: number;
  price_iptu?: number;
}

export function titleToJson(title: string): Partial<ZapImoveisListing> {
  const result: Partial<ZapImoveisListing> = { title };

  const propertyTypeMatch = title.match(/^(.+?)\s+para\s+/i);
  if (propertyTypeMatch?.[1]) result.propertyType = propertyTypeMatch[1].trim();

  const purposeMatch = title.match(/\bpara\s+(alugar|vender|venda|aluguel)\b/i);
  if (purposeMatch?.[1]) result.purpose = purposeMatch[1].toLowerCase();

  const areaMatch = title.match(/(\d{1,4}(?:[.,]\d+)?)\s*m(?:²|2)?/i);
  if (areaMatch?.[1])
    result.area_m2 = parseFloat(areaMatch[1].replace(",", "."));

  const parseIntMatch = (re: RegExp) => {
    const m = title.match(re);
    const val = m?.[1];
    return val ? parseInt(val, 10) : undefined;
  };

  const quartos = parseIntMatch(/(\d+)\s*quartos?\b/i);
  if (quartos !== undefined) result.bedroom = quartos;

  const banheiros = parseIntMatch(/(\d+)\s*banheiros?\b/i);
  if (banheiros !== undefined) result.bathroom = banheiros;

  const garage = parseIntMatch(/(\d+)\s*vagas?\b/i);
  if (garage !== undefined) result.garage = garage;

  const locMatch = title.match(/\bem\s+(.+)$/i);
  if (locMatch?.[1]) {
    // clean the matched location string: remove trailing codes and phrases like 'com 3 Dormitórios'
    let loc = locMatch[1].trim();

    // remove trailing listing/code after a dash
    loc = loc.replace(/\s*-\s*[A-Za-z0-9._\/\-]+\s*$/i, "").trim();

    // remove patterns like 'com 3 Dormitórios', 'com 2 quartos', etc.
    loc = loc
      .replace(
        /\bcom\s+\d+\s*(?:dormit[oó]rios?|dormit[oó]rio|quartos?|dorms?|banheiros?|banheiro|vagas?|vaga|m²|m2)\b/gi,
        ""
      )
      .trim();

    // remove standalone numeric room/count phrases that may remain
    loc = loc
      .replace(/\b\d+\s*(?:dormit[oó]rios?|quartos?|banheiros?|vagas?)\b/gi, "")
      .trim();

    // look for explicit 'Bairro <name>' inside the cleaned loc
    const bairroMatch = loc.match(/bairro\s+([\wÀ-ÿ\s\-\.]+)/i);
    if (bairroMatch?.[1]) {
      result.neighborhood = bairroMatch[1].trim();
      // remove the 'bairro ...' segment from loc so city/address parsing is cleaner
      loc = loc.replace(bairroMatch[0], "").trim();
    }

    const parts = loc
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (parts.length === 1) {
      result.address = parts[0];
    } else if (parts.length >= 2) {
      const neighborhood = parts.slice(0, parts.length - 1).join(", ");
      const city = parts[parts.length - 1];
      if (!result.neighborhood && neighborhood)
        result.neighborhood = neighborhood;
      result.city = city;
      result.address = `${neighborhood}, ${city}`;
    }
  }

  return result;
}

export function rawIptuAndCondominioToNumbers(rawStr: string): {
  price_iptu?: number;
  price_condominio?: number;
} {
  const result: {
    price_iptu?: number;
    price_condominio?: number;
  } = {};

  if (!rawStr) return result;

  // normalize brazilian money format: "1.234,56" -> "1234.56"
  const normalizeMoney = (s: string) =>
    s.replace(/\./g, "").replace(/,/g, ".").trim();
  const parseMoney = (s?: string) => {
    if (!s) return undefined;
    const n = normalizeMoney(s);
    const v = parseFloat(n);
    return Number.isNaN(v) ? undefined : v;
  };

  // try common patterns
  const condRe =
    /cond(?:om[ií]nio)?\.?\s*(?:[:–\-•]|)?\s*(?:R\$)?\s*([\d.,]+)/i;
  const condShortRe = /cond\.?\s*(?:R\$)?\s*([\d.,]+)/i;
  const iptuRe = /iptu\s*(?:[:–\-•]|)?\s*(?:R\$)?\s*([\d.,]+)/i;

  const condMatch = rawStr.match(condRe) || rawStr.match(condShortRe);
  if (condMatch?.[1]) {
    result.price_condominio = parseMoney(condMatch[1]);
  }

  const iptuMatch = rawStr.match(iptuRe);
  if (iptuMatch?.[1]) {
    result.price_iptu = parseMoney(iptuMatch[1]);
  }

  return result;
}
