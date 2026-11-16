export interface ScImoveisListing {
  title: string;
  propertyType?: string;
  address?: string;
  city?: string;
  area_m2?: number;
  bedroom?: number;
  bathroom?: number;
  garage?: number;
  listingCode?: string; // code after '-' if present
  [key: string]: unknown;
}

/**
 * Parse a title string from SC listings into structured fields.
 * Example input:
 * "Apartamento no Bairro Saguaçú em Joinville com 2 Dormitórios e 43 m² - 05432.001"
 */
export function parseScTitle(title: string): Partial<ScImoveisListing> {
  const result: Partial<ScImoveisListing> = { title };

  // property type: up to the first 'no', 'na', 'em' or ' - '
  const propMatch = title.match(/^(.+?)\s+(?:no|na|em)\s+/i);
  if (propMatch?.[1]) result.propertyType = propMatch[1].trim();

  // area (m²)
  const areaMatch = title.match(/(\d{1,4}(?:[.,]\d+)?)\s*m(?:²|2)?/i);
  if (areaMatch?.[1])
    result.area_m2 = parseFloat(areaMatch[1].replace(",", "."));

  // bedrooms (supports Dormitórios, dormitórios, quartos, dorms)
  const bedroomMatch = title.match(
    /(\d+)\s*(?:dormit[oó]rios?|dormit[oó]rio|quartos?|dorms?)\b/i
  );
  if (bedroomMatch?.[1]) result.bedroom = parseInt(bedroomMatch[1], 10);

  // bathrooms
  const bathroomMatch = title.match(
    /(\d+)\s*(?:banheiros?|banheiro|wc|lavabo)\b/i
  );
  if (bathroomMatch?.[1]) result.bathroom = parseInt(bathroomMatch[1], 10);

  // garage / vagas
  const garageMatch = title.match(/(\d+)\s*(?:vagas?|garagem|vaga)\b/i);
  if (garageMatch?.[1]) result.garage = parseInt(garageMatch[1], 10);

  // listing code after final dash: '- 05432.001' etc.
  const codeMatch = title.match(/-\s*([A-Za-z0-9._\/-]+)\s*$/);
  if (codeMatch?.[1]) result.listingCode = codeMatch[1].trim();

  // neighborhood: 'Bairro <name>' (case-insensitive)
  const bairroMatch = title.match(/bairro\s+([\wÀ-ÿ\s\-\.]+)/i);
  if (bairroMatch?.[1]) result.address = bairroMatch[1].trim();

  // city: 'em <City>' but stop before 'com', ',' or '-' or end
  const cityMatch = title.match(
    /\bem\s+([A-Za-zÀ-ÿ\s]+?)(?:\s+com|\s*,|\s+-|$)/i
  );
  if (cityMatch?.[1]) result.city = cityMatch[1].trim();

  // address fallback: if there's a trailing segment separated by comma or '-' after 'em <City>' or 'bairro ...'
  const addrFallback = title.match(
    /(?:bairro\s+[\wÀ-ÿ\s\-\.]+|em\s+[A-Za-zÀ-ÿ\s]+)\s*(?:,|-)\s*(.+)$/i
  );
  if (addrFallback?.[1]) result.address = addrFallback[1].trim();

  return result;
}

export default { parseScTitle };
