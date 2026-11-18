import { parseCurrencyToNumber } from "../utils/number";
import { parseScTitle } from "../utils/sc-imoveis-tools";
import {
  rawIptuAndCondominioToNumbers,
  titleToJson,
} from "../utils/zap-imoveis-tools";
import {
  runScraper,
  type ExtractedListing,
  type ScraperOptions,
} from "./base-scraper";
import {
  buildQueryPageUrl,
  extractDomListings,
  extractJsonLdListings,
  inferPropertyType,
  mergeListingsWithDom,
  resolveListingUrl,
  type DomCardSelectors,
  type RawDomCard,
} from "./extractors";

const DEFAULT_URL =
  "https://www.chavesnamao.com.br/apartamentos-para-alugar/sc-joinville/";

export const CHAVES_NA_MAO_SELECTORS: DomCardSelectors = {
  cardSelector:
    'div[class*="card_card__"]:has(a[href*="/imovel/"]), div[class*="styles_card__"]:has(a[href*="/imovel/"]), article:has(a[href*="/imovel/"])',
  title: "h2",
  href: 'a[href*="/imovel/"]',
  address: "address p[title]:last-child, address",
  price: 'p[aria-label="Preço"] b, [aria-label="Preço"] b',
  extraPrice:
    'p[aria-label="Preço"] span[aria-label], [aria-label="Preço"] span[aria-label], span[aria-label="Características do imóvel"] p',
  image: "img[src], img[data-src]",
};

function parseChavesNaMaoAddress(rawAddress: string): {
  neighborhood?: string;
  city?: string;
} {
  const parts = rawAddress
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return {};

  const stripUf = (val: string) =>
    val.replace(/\s*\/[A-Z]{2}\s*$/i, "").trim();

  if (parts.length === 1) {
    return { city: stripUf(parts[0]!) };
  }

  return {
    neighborhood: parts[parts.length - 2],
    city: stripUf(parts[parts.length - 1]!),
  };
}

/**
 * Maps a Chaves na Mão DOM listing card into an ExtractedListing, capturing
 * condomínio, IPTU, and property characteristics absent from search JSON-LD.
 */
export function mapChavesNaMaoCard(
  raw: RawDomCard,
  baseUrl = DEFAULT_URL,
): ExtractedListing | null {
  const ref = resolveListingUrl(raw.href, baseUrl);
  if (!ref) return null;

  const rent = parseCurrencyToNumber(raw.price);
  const extraPrices = rawIptuAndCondominioToNumbers(raw.extraPrice);
  const titleExtraPrices = /R\$/i.test(raw.title)
    ? rawIptuAndCondominioToNumbers(raw.title)
    : {};
  const combined = `${raw.title} ${raw.extraPrice}`.trim();
  const titleParsed = titleToJson(raw.title);
  const combinedZap = titleToJson(combined);
  const combinedSc = parseScTitle(combined);
  const loc = parseChavesNaMaoAddress(raw.address);

  return {
    ref,
    text_description: raw.title,
    features: {
      price_aluguel: Number.isFinite(rent) ? rent : 0,
      price_condominio:
        extraPrices.price_condominio ?? titleExtraPrices.price_condominio,
      price_iptu: extraPrices.price_iptu ?? titleExtraPrices.price_iptu,
      propertyType:
        inferPropertyType(raw.title) ?? titleParsed.propertyType,
      area_m2: combinedZap.area_m2 ?? combinedSc.area_m2,
      bedroom: combinedZap.bedroom ?? combinedSc.bedroom,
      bathroom: combinedZap.bathroom ?? combinedSc.bathroom,
      garage: combinedZap.garage ?? combinedSc.garage,
      neighborhood: loc.neighborhood ?? titleParsed.neighborhood,
      city: loc.city ?? titleParsed.city ?? combinedSc.city,
      address: raw.address || titleParsed.address,
      title: raw.title,
    },
    images: raw.image ? [raw.image] : [],
  };
}

export const getChavesNaMao = (
  idListing: string,
  runId: number,
  startPage = 1,
  opts?: ScraperOptions,
) => {
  const siteUrl = opts?.siteUrl ?? DEFAULT_URL;
  return runScraper(
    {
      siteName: "Chaves na Mão",
      siteUrl,
      delayMs: opts?.delayMs,
      buildPageUrl: buildQueryPageUrl("pg"),
      extract: async (page) => {
        const fromJsonLd = await extractJsonLdListings(page);
        const fromDom = await extractDomListings(
          page,
          CHAVES_NA_MAO_SELECTORS,
          (raw) => mapChavesNaMaoCard(raw, siteUrl),
        );
        return mergeListingsWithDom(fromJsonLd, fromDom);
      },
    },
    idListing,
    runId,
    startPage,
    opts,
  );
};
