import { runScraper, type ScraperOptions } from "./base-scraper";
import { buildQueryPageUrl, extractJsonLdListings } from "./extractors";

const DEFAULT_URL =
  "https://www.chavesnamao.com.br/apartamentos-para-alugar/sc-joinville/";

export const getChavesNaMao = (
  idListing: string,
  runId: number,
  startPage = 1,
  opts?: ScraperOptions,
) =>
  runScraper(
    {
      siteName: "Chaves na Mão",
      siteUrl: opts?.siteUrl ?? DEFAULT_URL,
      delayMs: opts?.delayMs,
      buildPageUrl: buildQueryPageUrl("pg"),
      extract: (page) => extractJsonLdListings(page),
    },
    idListing,
    runId,
    startPage,
    opts,
  );
