import { runScraper, type ScraperOptions } from "./base-scraper";
import { buildQueryPageUrl, extractJsonLdListings } from "./extractors";

const DEFAULT_URL =
  "https://www.zapimoveis.com.br/aluguel/imoveis/sc+joinville/";

export const getZapImoveis = (
  idListing: string,
  runId: number,
  startPage = 1,
  opts?: ScraperOptions,
) =>
  runScraper(
    {
      siteName: "Zap Imóveis",
      siteUrl: opts?.siteUrl ?? DEFAULT_URL,
      delayMs: opts?.delayMs,
      buildPageUrl: buildQueryPageUrl("page"),
      extract: (page) => extractJsonLdListings(page),
    },
    idListing,
    runId,
    startPage,
    opts,
  );
