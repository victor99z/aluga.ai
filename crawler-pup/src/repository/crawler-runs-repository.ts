import { getAdapter } from "../clients/db";
import type { CrawlerRunRow } from "../clients/db-adapter";

export type { CrawlerRunRow } from "../clients/db-adapter";

export class CrawlerRunsRepository {
  static async init() {
    await getAdapter().ensureSchema();
  }

  static async create(siteName: string): Promise<{ id: number }> {
    return getAdapter().createCrawlerRun(siteName);
  }

  static async finish(
    id: number,
    data: {
      finishedAt?: string;
      status?: string;
      pagesCrawled?: number;
      listingsScraped?: number;
      errors?: number;
      errorMsg?: string;
    },
  ): Promise<void> {
    return getAdapter().finishCrawlerRun(id, data);
  }

  static async getLatest(limit = 20): Promise<CrawlerRunRow[]> {
    return getAdapter().getLatestCrawlerRuns(limit);
  }

  static async getLatestPerSite(): Promise<CrawlerRunRow[]> {
    return getAdapter().getLatestPerSite();
  }

  static async countErrorsSince(days: number): Promise<number> {
    return getAdapter().countErrorsSince(days);
  }

  static async countSince(days: number): Promise<number> {
    return getAdapter().countRunsSince(days);
  }

  static async getTotalListings(): Promise<number> {
    return getAdapter().countImoveis();
  }
}
