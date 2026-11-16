import { CrawlerRunsRepository } from "./repository/crawler-runs-repository";
import { getAdapter } from "./clients/db";

let metricsCache: string | null = null;
let cacheExpiry = 0;

export function startMetricsServer(port: number) {
  Bun.serve({
    port,
    routes: {
      "/metrics": async () => {
        if (Date.now() > cacheExpiry || !metricsCache) {
          metricsCache = await generateMetrics();
          cacheExpiry = Date.now() + 15_000;
        }
        return new Response(metricsCache, {
          headers: { "Content-Type": "text/plain; version=0.0.4" },
        });
      },
      "/health": async () => {
        const latestRuns = await CrawlerRunsRepository.getLatest(1);
        const latest = latestRuns[0];
        const hasRecentRun =
          !!latest?.startedAt && isWithinMinutes(latest.startedAt, 24 * 60);
        return new Response(
          JSON.stringify({
            status: hasRecentRun ? "healthy" : "unhealthy",
            lastRun: latest?.startedAt ?? null,
            totalListings: await CrawlerRunsRepository.getTotalListings(),
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  });

  console.log(`Metrics server running on port ${port}`);
}

function escapeLabel(val: string): string {
  return val.replace(/"/g, '\\"').replace(/'/g, "\\'");
}

async function getPriceStats(): Promise<{
  totalListings: number;
  avgPrice: number;
  minPrice: number;
  maxPrice: number;
  listingsWithPrice: number;
}> {
  const db = getAdapter();
  const prices = await db.getImoveisPrices();

  if (prices.length === 0) {
    return {
      totalListings: await db.countImoveis(),
      avgPrice: 0,
      minPrice: 0,
      maxPrice: 0,
      listingsWithPrice: 0,
    };
  }

  return {
    totalListings: await db.countImoveis(),
    avgPrice: Math.round(prices.reduce((a, b) => a + b, 0) / prices.length),
    minPrice: Math.min(...prices),
    maxPrice: Math.max(...prices),
    listingsWithPrice: prices.length,
  };
}

async function generateMetrics(): Promise<string> {
  const db = getAdapter();
  const latestPerSite = await CrawlerRunsRepository.getLatestPerSite();
  const totalListings = await CrawlerRunsRepository.getTotalListings();
  const errors7d = await CrawlerRunsRepository.countErrorsSince(7);
  const runs7d = await CrawlerRunsRepository.countSince(7);
  const priceStats = await getPriceStats();

  let metrics = `# HELP crawler_total_listings Total number of listings in database
# TYPE crawler_total_listings gauge
crawler_total_listings ${totalListings}

# HELP crawler_listings_with_price Number of listings that have a price field
# TYPE crawler_listings_with_price gauge
crawler_listings_with_price ${priceStats.listingsWithPrice}

# HELP crawler_avg_price Average rental price in database
# TYPE crawler_avg_price gauge
crawler_avg_price ${priceStats.avgPrice}

# HELP crawler_min_price Minimum rental price in database
# TYPE crawler_min_price gauge
crawler_min_price ${priceStats.minPrice}

# HELP crawler_max_price Maximum rental price in database
# TYPE crawler_max_price gauge
crawler_max_price ${priceStats.maxPrice}

# HELP crawler_runs_7d Number of crawler runs in last 7 days
# TYPE crawler_runs_7d gauge
crawler_runs_7d ${runs7d}

# HELP crawler_errors_7d Number of errors in last 7 days
# TYPE crawler_errors_7d gauge
crawler_errors_7d ${errors7d}

`;

  for (const run of latestPerSite) {
    const site = escapeLabel(run.siteName);
    const status = escapeLabel(run.status ?? "running");
    const startedAt = run.startedAt.getTime() / 1000;
    const pagesCrawled = run.pagesCrawled ?? 0;
    const listingsScraped = run.listingsScraped ?? 0;
    const errors = run.errors ?? 0;

    metrics += `# HELP crawler_last_run_seconds When the crawler last ran (unix timestamp)
# TYPE crawler_last_run_seconds gauge
crawler_last_run{site="${site}"} ${startedAt}

# HELP crawler_last_run_status Status of the last run: running, completed, error
# TYPE crawler_last_run_status gauge
crawler_last_run_status{site="${site}",status="${status}"} 1

# HELP crawler_pages_crawled_total Total pages crawled in last run
# TYPE crawler_pages_crawled_total counter
crawler_pages_crawled_total{site="${site}"} ${pagesCrawled}

# HELP crawler_listings_scraped_total Total listings scraped in last run
# TYPE crawler_listings_scraped_total counter
crawler_listings_scraped_total{site="${site}"} ${listingsScraped}

# HELP crawler_errors_total Total errors in last run
# TYPE crawler_errors_total counter
crawler_errors_total{site="${site}"} ${errors}

`;
  }

  const activeNames = await db.getActiveListingNames();
  for (const name of activeNames) {
    metrics += `# HELP crawler_listing_active Whether a listing scraper is configured as active
# TYPE crawler_listing_active gauge
crawler_listing_active{site="${escapeLabel(name)}"} 1
`;
  }

  return metrics;
}

function isWithinMinutes(timestamp: Date | string, minutes: number) {
  const then = new Date(timestamp).getTime();
  const now = Date.now();
  return now - then < minutes * 60 * 1000;
}
