import type { Page } from "puppeteer";
import { Logger } from "../config/logger";
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
  extractAdditionalPropertyFields,
  extractDomListings,
  extractJsonLdListings,
  flattenJsonLdBlocks,
  mergeListingsWithDom,
  resolveListingUrl,
  type DomCardSelectors,
  type RawDomCard,
} from "./extractors";

const DEFAULT_URL =
  "https://www.imoveis-sc.com.br/joinville/alugar/apartamento+casa";

const DETAIL_BATCH_SIZE = 6;
const JSON_LD_SCRIPT_RE =
  /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
const DETAIL_LABEL_CONDO_RE =
  /<(?:span|p|div|dt|th|strong|label)[^>]*>\s*Condom[ií]nio\s*<\/(?:span|p|div|dt|th|strong|label)>\s*<(?:span|p|div|dd|td)[^>]*>\s*(R\$\s*[\d.,]+)/i;
const DETAIL_LABEL_IPTU_RE =
  /<(?:span|p|div|dt|th|strong|label)[^>]*>\s*IPTU\s*<\/(?:span|p|div|dt|th|strong|label)>\s*<(?:span|p|div|dd|td)[^>]*>\s*(R\$\s*[\d.,]+)/i;

export const IMOVEIS_SC_SELECTORS: DomCardSelectors = {
  cardSelector:
    'article[class^="imovel"], div.flex.flex-col.border.overflow-hidden:has(a[href$=".html"])',
  title: "h2.imovel-titulo, h2, h3",
  href: 'h2.imovel-titulo a[href], a[href$=".html"]',
  address: 'div.imovel-extra > strong, p[class*="truncate"]',
  price: 'span.imovel-preco small, p[class*="text-[24px]"]',
  extraPrice:
    'p.text-sm.font-medium.text-foreground, div.imovel-extra, [class*="condo"], [class*="iptu"]',
  image: "img[src]",
};

export function mapImoveisScCard(
  raw: RawDomCard,
  baseUrl = DEFAULT_URL,
): ExtractedListing | null {
  const ref = resolveListingUrl(raw.href, baseUrl);
  if (!ref) return null;

  const parsed = parseScTitle(raw.title);
  const combined = `${raw.title} ${raw.extraPrice}`.trim();
  const combinedSc = parseScTitle(combined);
  const combinedZap = titleToJson(combined);
  const extraPrices = rawIptuAndCondominioToNumbers(raw.extraPrice);
  const titleExtraPrices = /R\$/i.test(raw.title)
    ? rawIptuAndCondominioToNumbers(raw.title)
    : {};
  const rent = parseCurrencyToNumber(raw.price);

  return {
    ref,
    text_description: raw.title,
    features: {
      ...parsed,
      neighborhood: raw.address || parsed.address,
      price_aluguel: Number.isFinite(rent) ? rent : 0,
      price_condominio:
        extraPrices.price_condominio ?? titleExtraPrices.price_condominio,
      price_iptu: extraPrices.price_iptu ?? titleExtraPrices.price_iptu,
      area_m2: parsed.area_m2 ?? combinedSc.area_m2 ?? combinedZap.area_m2,
      bedroom: parsed.bedroom ?? combinedSc.bedroom ?? combinedZap.bedroom,
      bathroom:
        parsed.bathroom ?? combinedSc.bathroom ?? combinedZap.bathroom,
      garage: parsed.garage ?? combinedSc.garage ?? combinedZap.garage,
    },
    images: raw.image ? [raw.image] : [],
  };
}

/**
 * Extracts condomínio, IPTU, and property dimensions from an Imóveis-SC detail
 * page HTML via its JSON-LD `additionalProperty` blocks and label/value markup.
 */
export function parseImoveisScDetailHtml(
  html: string,
): Partial<ExtractedListing["features"]> {
  const result: Partial<ExtractedListing["features"]> = {};
  if (!html) return result;

  const rawBlocks: unknown[] = [];
  JSON_LD_SCRIPT_RE.lastIndex = 0;
  for (const match of html.matchAll(JSON_LD_SCRIPT_RE)) {
    const rawJson = match[1]?.trim();
    if (!rawJson) continue;
    try {
      rawBlocks.push(JSON.parse(rawJson));
    } catch {
      // Ignore malformed JSON-LD script blocks.
    }
  }

  for (const block of flattenJsonLdBlocks(rawBlocks)) {
    const offers =
      block.offers && typeof block.offers === "object"
        ? (block.offers as Record<string, unknown>)
        : undefined;
    for (const props of [
      extractAdditionalPropertyFields(block.additionalProperty),
      extractAdditionalPropertyFields(offers?.additionalProperty),
    ]) {
      result.price_condominio ??= props.price_condominio;
      result.price_iptu ??= props.price_iptu;
      result.area_m2 ??= props.area_m2;
      result.bedroom ??= props.bedroom;
      result.bathroom ??= props.bathroom;
      result.garage ??= props.garage;
    }
  }

  const normalizedHtml = html.replace(/&nbsp;/gi, " ");
  if (result.price_condominio === undefined) {
    const condoMatch = normalizedHtml.match(DETAIL_LABEL_CONDO_RE);
    if (condoMatch?.[1]) {
      result.price_condominio = rawIptuAndCondominioToNumbers(
        `Condomínio ${condoMatch[1]}`,
      ).price_condominio;
    }
  }

  if (result.price_iptu === undefined) {
    const iptuMatch = normalizedHtml.match(DETAIL_LABEL_IPTU_RE);
    if (iptuMatch?.[1]) {
      result.price_iptu = rawIptuAndCondominioToNumbers(
        `IPTU ${iptuMatch[1]}`,
      ).price_iptu;
    }
  }

  return result;
}

function pickPositiveFeature(
  existing: number | undefined,
  incoming: number | undefined,
): number | undefined {
  if (typeof existing === "number" && Number.isFinite(existing) && existing > 0) {
    return existing;
  }
  return typeof incoming === "number" && Number.isFinite(incoming) && incoming > 0
    ? incoming
    : existing;
}

/**
 * Fetches detail pages inside the browser context for Imóveis-SC listings
 * missing `price_condominio`, enriching them with condomínio/IPTU/dimensions.
 */
export async function enrichImoveisScListings(
  page: Page,
  listings: ExtractedListing[],
): Promise<ExtractedListing[]> {
  const targetIndices: number[] = [];
  for (let i = 0; i < listings.length; i++) {
    const cond = listings[i]!.features.price_condominio;
    if (!(typeof cond === "number" && Number.isFinite(cond) && cond > 0)) {
      targetIndices.push(i);
    }
  }
  if (targetIndices.length === 0) return listings;

  const updated = [...listings];
  for (
    let offset = 0;
    offset < targetIndices.length;
    offset += DETAIL_BATCH_SIZE
  ) {
    const batchIndices = targetIndices.slice(
      offset,
      offset + DETAIL_BATCH_SIZE,
    );
    const batchUrls = batchIndices.map((idx) => updated[idx]!.ref);

    let htmlByUrl: Record<string, string | null> = {};
    try {
      htmlByUrl = await page.evaluate(async (urls: string[]) => {
        const entries = await Promise.all(
          urls.map(async (url): Promise<[string, string | null]> => {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 8000);
            try {
              const res = await fetch(url, {
                credentials: "omit",
                signal: controller.signal,
              });
              return [url, res.ok ? await res.text() : null];
            } catch {
              return [url, null];
            } finally {
              clearTimeout(timer);
            }
          }),
        );
        return Object.fromEntries(entries);
      }, batchUrls);
    } catch (err) {
      Logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        "Failed to fetch Imóveis-SC detail pages for enrichment",
      );
      continue;
    }

    for (const idx of batchIndices) {
      const item = updated[idx]!;
      const html = htmlByUrl[item.ref];
      if (!html) continue;

      const detail = parseImoveisScDetailHtml(html);
      updated[idx] = {
        ...item,
        features: {
          ...item.features,
          price_condominio: pickPositiveFeature(
            item.features.price_condominio,
            detail.price_condominio,
          ),
          price_iptu: pickPositiveFeature(
            item.features.price_iptu,
            detail.price_iptu,
          ),
          area_m2: pickPositiveFeature(item.features.area_m2, detail.area_m2),
          bedroom: pickPositiveFeature(item.features.bedroom, detail.bedroom),
          bathroom: pickPositiveFeature(
            item.features.bathroom,
            detail.bathroom,
          ),
          garage: pickPositiveFeature(item.features.garage, detail.garage),
        },
      };
    }
  }

  return updated;
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
        const fromDom = await extractDomListings(
          page,
          IMOVEIS_SC_SELECTORS,
          (raw) => mapImoveisScCard(raw, siteUrl),
        );
        const merged = mergeListingsWithDom(fromJsonLd, fromDom);
        return enrichImoveisScListings(page, merged);
      },
    },
    idListing,
    runId,
    startPage,
    opts,
  );
};
