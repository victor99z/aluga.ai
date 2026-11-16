import { parseCurrencyToNumber } from "../utils/number";
import { parseScTitle } from "../utils/sc-imoveis-tools";
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
  "https://www.imoveis-sc.com.br/joinville/alugar/apartamento+casa";

const IMOVEIS_SC_SELECTORS: DomCardSelectors = {
  cardSelector: 'article[class^="imovel"]',
  title: "h2.imovel-titulo",
  href: "h2.imovel-titulo a[href]",
  address: "div.imovel-extra > strong",
  price: "span.imovel-preco small",
  image: "img[src]",
};

export function mapImoveisScCard(
  raw: RawDomCard,
  baseUrl = DEFAULT_URL,
): ExtractedListing | null {
  const ref = resolveListingUrl(raw.href, baseUrl);
  if (!ref) return null;

  const parsed = parseScTitle(raw.title);
  const rent = parseCurrencyToNumber(raw.price);

  return {
    ref,
    text_description: raw.title,
    features: {
      ...parsed,
      neighborhood: raw.address || parsed.address,
      price_aluguel: Number.isFinite(rent) ? rent : 0,
    },
    images: raw.image ? [raw.image] : [],
  };
}

export const getImoveisSc = (
  idListing: string,
  runId: number,
  startPage = 1,
  opts?: ScraperOptions,
) => {
  const siteUrl = opts?.siteUrl ?? DEFAULT_URL;
  return runScraper(
    {
      siteName: "SC Imoveis",
      siteUrl,
      delayMs: opts?.delayMs,
      buildPageUrl: buildQueryPageUrl("page"),
      extract: async (page) => {
        const fromJsonLd = await extractJsonLdListings(page, 500);
        if (fromJsonLd.length > 0) return fromJsonLd;
        return extractDomListings(page, IMOVEIS_SC_SELECTORS, (raw) =>
          mapImoveisScCard(raw, siteUrl),
        );
      },
    },
    idListing,
    runId,
    startPage,
    opts,
  );
};
