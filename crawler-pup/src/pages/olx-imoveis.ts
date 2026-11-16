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
  inferPropertyType,
  resolveListingUrl,
  type DomCardSelectors,
  type RawDomCard,
} from "./extractors";

const DEFAULT_URL =
  "https://www.olx.com.br/imoveis/aluguel/estado-sc/norte-de-santa-catarina/joinville";

const OLX_SELECTORS: DomCardSelectors = {
  cardSelector: 'section.olx-adcard, [data-ds-component="DS-AdCard"]',
  title: "h2",
  href: 'a[data-testid="adcard-link"], a.olx-adcard__link, a[href]',
  address: "p.olx-adcard__location, .olx-adcard__location",
  price: "h3.olx-adcard__price, [data-testid='adcard-price'], [class*='price']",
  extraPrice:
    ".olx-adcard__detail, .olx-adcard__price-info-list, [class*='condo'], [class*='iptu']",
  image: "img[src], img[data-src]",
};

function parseOlxAddress(address: string): {
  city?: string;
  neighborhood?: string;
} {
  const parts = address
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return {};
  if (parts.length === 1) return { city: parts[0] };
  return {
    city: parts[0],
    neighborhood: parts.slice(1).join(", "),
  };
}

export function isValidOlxImovelUrl(rawUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }

  const host = url.hostname.toLowerCase();
  if (host !== "olx.com.br" && !host.endsWith(".olx.com.br")) {
    return false;
  }

  if (url.pathname.startsWith("/vi/") || url.searchParams.has("rec")) {
    return false;
  }

  return /\/imoveis(\/|$)/i.test(url.pathname);
}

export function mapOlxCard(
  raw: RawDomCard,
  baseUrl = DEFAULT_URL,
): ExtractedListing | null {
  const resolved = resolveListingUrl(raw.href, baseUrl);
  if (!resolved || !isValidOlxImovelUrl(resolved)) return null;

  const parsedUrl = new URL(resolved);
  parsedUrl.search = "";
  parsedUrl.hash = "";
  const ref = parsedUrl.toString();

  const rent = parseCurrencyToNumber(raw.price);
  const extraPrices = rawIptuAndCondominioToNumbers(raw.extraPrice);
  const combined = `${raw.title} ${raw.extraPrice}`.trim();
  const scParsed = parseScTitle(combined);
  const zapParsed = titleToJson(combined);
  const loc = parseOlxAddress(raw.address);

  return {
    ref,
    text_description: raw.title,
    features: {
      price_aluguel: Number.isFinite(rent) ? rent : 0,
      price_condominio: extraPrices.price_condominio,
      price_iptu: extraPrices.price_iptu,
      propertyType:
        inferPropertyType(raw.title) ?? zapParsed.propertyType,
      area_m2: zapParsed.area_m2 ?? scParsed.area_m2,
      bedroom: zapParsed.bedroom ?? scParsed.bedroom,
      bathroom: zapParsed.bathroom ?? scParsed.bathroom,
      garage: zapParsed.garage ?? scParsed.garage,
      neighborhood: loc.neighborhood ?? zapParsed.neighborhood,
      city: loc.city ?? scParsed.city ?? zapParsed.city,
      address: raw.address || zapParsed.address,
      title: raw.title,
    },
    images: raw.image ? [raw.image] : [],
  };
}

export const getOlxImoveis = (
  idListing: string,
  runId: number,
  startPage = 1,
  opts?: ScraperOptions,
) => {
  const siteUrl = opts?.siteUrl ?? DEFAULT_URL;
  return runScraper(
    {
      siteName: "OLX Imóveis",
      siteUrl,
      delayMs: opts?.delayMs,
      buildPageUrl: buildQueryPageUrl("o"),
      extract: (page) =>
        extractDomListings(page, OLX_SELECTORS, (raw) =>
          mapOlxCard(raw, siteUrl),
        ),
    },
    idListing,
    runId,
    startPage,
    opts,
  );
};
