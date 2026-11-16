import { getAdapter } from "./clients/db";
import { Logger } from "./config/logger";
import { SCRAPER_REGISTRY } from "./pages";
import type { ExtractedListing } from "./pages/base-scraper";
import { CrawlerRunsRepository } from "./repository/crawler-runs-repository";
import { ImoveisRepository } from "./repository/imoveis-repository";

interface CliOptions {
  pageStartOverride: number | null;
  shouldDelete: boolean;
  cleanOlx: boolean;
  sampleLimit: number | null;
  allSites: boolean;
}

function parsePositiveIntArg(argv: string[], prefix: string): number | null {
  const arg = argv.find((a) => a.startsWith(prefix));
  if (!arg) return null;
  const parsed = parseInt(arg.slice(prefix.length) || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseCliArgs(argv: string[]): CliOptions {
  const pageStartOverride = parsePositiveIntArg(argv, "--page-start=");
  const sampleLimit =
    parsePositiveIntArg(argv, "--sample=") ??
    parsePositiveIntArg(argv, "--limit=");

  const deleteArg = argv.find((arg) => arg.startsWith("--delete="));
  const shouldDelete = deleteArg ? deleteArg.split("=")[1] === "true" : false;
  const cleanOlx = argv.includes("--clean-olx");
  const allSites = argv.includes("--all-sites");

  return { pageStartOverride, shouldDelete, cleanOlx, sampleLimit, allSites };
}

async function runCrawler(): Promise<void> {
  const args = process.argv.slice(2);
  const { pageStartOverride, shouldDelete, cleanOlx, sampleLimit, allSites } =
    parseCliArgs(args);

  await getAdapter().ensureSchema();
  await CrawlerRunsRepository.init();

  Logger.info(
    { args, pageStartOverride, shouldDelete, cleanOlx, sampleLimit, allSites },
    "Crawler initialized",
  );

  if (shouldDelete) {
    const res = await ImoveisRepository.deleteAllInBatch();
    Logger.info(res, "Deleted all listings from imoveis_temp");
    await CrawlerRunsRepository.flushLogs();
    return;
  }

  if (cleanOlx) {
    const res = await ImoveisRepository.deleteInvalidOlxInBatch();
    Logger.info(res, "Deleted invalid OLX listings from imoveis_temp");
    await CrawlerRunsRepository.flushLogs();
    return;
  }

  try {
    const cleaned = await ImoveisRepository.deleteInvalidOlxInBatch();
    if (cleaned.deleted > 0) {
      Logger.info(cleaned, "Cleaned invalid OLX listings from imoveis_temp");
    }
  } catch (err) {
    Logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "Failed to clean invalid OLX listings before crawl",
    );
  }

  const listings = await ImoveisRepository.getAllListings();
  const sampleResults: Record<string, ExtractedListing[]> = {};

  for (const item of listings) {
    if (!allSites && !item.active) continue;

    const runner = SCRAPER_REGISTRY[item.name];
    if (!runner) {
      Logger.warn({ site: item.name }, `No scraper registered for ${item.name}`);
      continue;
    }

    const maxPages = item.maxPages ?? 10;
    const resumedPage =
      item.lastPage >= 1 && item.lastPage < maxPages ? item.lastPage : 1;
    const startPage = pageStartOverride ?? resumedPage;
    let runId: { id: number } | null = null;

    try {
      runId = await CrawlerRunsRepository.create(item.name);
      Logger.info(
        { site: item.name, runId: runId.id, startPage },
        `[${item.name}] Starting crawler (run #${runId.id})...`,
      );

      const stats = await runner(item.id, runId.id, startPage, {
        maxPages: sampleLimit ? startPage : maxPages,
        maxListings: sampleLimit ?? undefined,
        delayMs: item.delayMs,
        siteUrl: item.url ?? undefined,
      });

      if (sampleLimit !== null && stats.samples) {
        sampleResults[item.name] = stats.samples;
      }

      await CrawlerRunsRepository.finish(runId.id, {
        finishedAt: new Date().toISOString(),
        status: "completed",
        pagesCrawled: stats.pagesCrawled,
        listingsScraped: stats.listingsScraped,
        errors: stats.errors,
      });
    } catch (err) {
      const errStr = err instanceof Error ? err.message : String(err);
      Logger.error({ site: item.name, err: errStr }, `[${item.name}] Failed`);

      if (runId) {
        await CrawlerRunsRepository.finish(runId.id, {
          finishedAt: new Date().toISOString(),
          status: "error",
          errorMsg: errStr,
        });
      }
    }
  }

  if (sampleLimit !== null) {
    console.log("\n=== SAMPLE RESULTS ===");
    console.log(JSON.stringify(sampleResults, null, 2));
    await CrawlerRunsRepository.flushLogs();
    process.exit(0);
  }

  Logger.info("Crawl complete.");
  await CrawlerRunsRepository.flushLogs();
}

runCrawler();
