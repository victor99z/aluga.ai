import { parseCurrencyToNumber } from "../utils/number";
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
  resolveListingUrl,
  type DomCardSelectors,
  type RawDomCard,
} from "./extractors";

const DEFAULT_URL =
  "https://www.vivareal.com.br/aluguel/santa-catarina/joinville/";

const VIVAREAL_SELECTORS: DomCardSelectors = {
  cardSelector: 'div.listing-item, [data-type="property"], a.olx-core-card',
  title: "h2",
  href: "a[href]",
  address: "[class*='address']",
  price: "[class*='price']",
  extraPrice: "[class*='condo'], [class*='iptu'], [class*='expense']",
  image: "img[src], img[data-src]",
};

export function mapVivarealCard(
  raw: RawDomCard,
  baseUrl = DEFAULT_URL,
): ExtractedListing | null {
  const ref = resolveListingUrl(raw.href, baseUrl);
  if (!ref) return null;

  const titleParsed = titleToJson(raw.title);
  const extraPrices = rawIptuAndCondominioToNumbers(raw.extraPrice);
  const rent = parseCurrencyToNumber(raw.price);
  const fallbackNeighborhood = raw.address
    ? raw.address.split(",")[0]?.trim()
    : undefined;

  return {
    ref,
    text_description: raw.title,
    features: {
      price_aluguel: Number.isFinite(rent) ? rent : 0,
      price_condominio: extraPrices.price_condominio,
      price_iptu: extraPrices.price_iptu,
      propertyType: titleParsed.propertyType,
      area_m2: titleParsed.area_m2,
      bedroom: titleParsed.bedroom,
      bathroom: titleParsed.bathroom,
      garage: titleParsed.garage,
      neighborhood: titleParsed.neighborhood ?? fallbackNeighborhood,
      city: titleParsed.city,
      address: raw.address || titleParsed.address,
      title: raw.title,
    },
    images: raw.image ? [raw.image] : [],
  };
}

export const getVivarealImoveis = (
  idListing: string,
  runId: number,
  startPage = 1,
  opts?: ScraperOptions,
) => {
  const siteUrl = opts?.siteUrl ?? DEFAULT_URL;
  return runScraper(
    {
      siteName: "Vivareal Imoveis",
      siteUrl,
      delayMs: opts?.delayMs,
      buildPageUrl: buildQueryPageUrl("pagina"),
      extract: async (page) => {
        const fromJsonLd = await extractJsonLdListings(page, 500);
        if (fromJsonLd.length > 0) return fromJsonLd;
        return extractDomListings(page, VIVAREAL_SELECTORS, (raw) =>
          mapVivarealCard(raw, siteUrl),
        );
      },
    },
    idListing,
    runId,
    startPage,
    opts,
  );
};
