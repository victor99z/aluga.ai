import { Database } from "bun:sqlite";
import {
  DEFAULT_SEED_LISTINGS,
  type CrawlerLogInsert,
  type CrawlerLogRow,
  type CrawlerRunFinish,
  type CrawlerRunRow,
  type DbAdapter,
  type ImovelInsert,
  type ImovelPatch,
  type ImovelRow,
  type ImovelUpdate,
  type ListingRow,
  type ListingUpdate,
} from "./db-adapter";

const DB_PATH =
  process.env.DATABASE_URL?.replace(/^sqlite:\/\//, "") ?? "./crawler.sqlite";

function toDate(val: string | null | undefined): Date | null {
  if (!val) return null;
  return new Date(val);
}

function toImovelRow(row: Record<string, unknown>): ImovelRow {
  return {
    id: row.id as string,
    ref: row.ref as string,
    textDescription: (row.text_description as string) ?? null,
    features: (row.features as string) ?? null,
    idListing: (row.id_listing as string) ?? null,
    images: (row.images as string) ?? null,
    priceAluguel: (row.price_aluguel as number) ?? null,
    priceIptu: (row.price_iptu as number) ?? null,
    priceCondominio: (row.price_condominio as number) ?? null,
    areaM2: (row.area_m2 as number) ?? null,
    bedroom: (row.bedroom as number) ?? null,
    bathroom: (row.bathroom as number) ?? null,
    garage: (row.garage as number) ?? null,
    neighborhood: (row.neighborhood as string) ?? null,
    city: (row.city as string) ?? null,
    propertyType: (row.property_type as string) ?? null,
    created: toDate(row.created as string),
    updated: toDate(row.updated as string),
  };
}

function toListingRow(row: Record<string, unknown>): ListingRow {
  return {
    id: row.id as string,
    name: row.name as string,
    active: row.active === 1 || row.active === true,
    lastPage: row.last_page as number,
    url: (row.url as string) ?? null,
    maxPages: row.max_pages as number,
    delayMs: row.delay_ms as number,
    created: toDate(row.created as string),
    updated: toDate(row.updated as string),
  };
}

function toCrawlerRunRow(row: Record<string, unknown>): CrawlerRunRow {
  return {
    id: row.id as number,
    siteName: row.site_name as string,
    startedAt: new Date(row.started_at as string),
    finishedAt: row.finished_at ? new Date(row.finished_at as string) : null,
    status: row.status as string,
    pagesCrawled: (row.pages_crawled as number) ?? null,
    listingsScraped: (row.listings_scraped as number) ?? null,
    errors: (row.errors as number) ?? null,
    errorMsg: (row.error_msg as string) ?? null,
  };
}

export class SqliteAdapter implements DbAdapter {
  private db: Database;

  constructor(path: string = DB_PATH) {
    this.db = new Database(path, { create: true });
    if (path !== ":memory:") {
      this.db.exec("PRAGMA journal_mode=WAL");
    }
    this.db.exec("PRAGMA foreign_keys=ON");
  }

  close(): void {
    this.db.close();
  }

  reset(): void {
    this.db.exec(
      "DELETE FROM imoveis_temp; DELETE FROM listings; DELETE FROM crawler_runs; DELETE FROM crawler_logs;",
    );
  }

  seedDefaults(): void {
    const seedStmt = this.db.prepare(
      "INSERT OR IGNORE INTO listings (id, name, active, last_page, url, max_pages, delay_ms) VALUES (?, ?, ?, ?, ?, ?, ?)",
    );
    this.db.transaction(() => {
      for (const s of DEFAULT_SEED_LISTINGS) {
        seedStmt.run(
          s.id,
          s.name,
          s.active ? 1 : 0,
          s.lastPage,
          s.url,
          s.maxPages,
          s.delayMs,
        );
      }
    })();
  }

  insertListing(data: {
    id: string;
    name: string;
    active?: boolean;
    lastPage?: number;
    url?: string | null;
    maxPages?: number;
    delayMs?: number;
  }): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        "INSERT INTO listings (id, name, active, last_page, url, max_pages, delay_ms, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        data.id,
        data.name,
        data.active === false ? 0 : 1,
        data.lastPage ?? 1,
        data.url ?? null,
        data.maxPages ?? 50,
        data.delayMs ?? 2000,
        now,
        now,
      );
  }

  async ensureSchema(): Promise<void> {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS imoveis_temp (
        id               TEXT PRIMARY KEY,
        ref              TEXT NOT NULL,
        text_description TEXT,
        features         TEXT,
        id_listing       TEXT,
        images           TEXT,
        price_aluguel    INTEGER DEFAULT 0,
        price_iptu       INTEGER DEFAULT 0,
        price_condominio INTEGER DEFAULT 0,
        area_m2          INTEGER DEFAULT 0,
        bedroom          INTEGER DEFAULT 0,
        bathroom         INTEGER DEFAULT 0,
        garage           INTEGER DEFAULT 0,
        neighborhood     TEXT,
        city             TEXT,
        property_type    TEXT,
        created          TEXT DEFAULT (datetime('now')),
        updated          TEXT DEFAULT (datetime('now'))
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_imoveis_ref ON imoveis_temp(ref);

      CREATE TABLE IF NOT EXISTS listings (
        id        TEXT PRIMARY KEY,
        name      TEXT NOT NULL,
        active    INTEGER NOT NULL DEFAULT 1,
        last_page INTEGER NOT NULL DEFAULT 1,
        url       TEXT,
        max_pages INTEGER NOT NULL DEFAULT 50,
        delay_ms  INTEGER NOT NULL DEFAULT 2000,
        created   TEXT DEFAULT (datetime('now')),
        updated   TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS crawler_runs (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        site_name        TEXT NOT NULL,
        started_at       TEXT NOT NULL DEFAULT (datetime('now')),
        finished_at      TEXT,
        status           TEXT NOT NULL DEFAULT 'running',
        pages_crawled    INTEGER DEFAULT 0,
        listings_scraped INTEGER DEFAULT 0,
        errors           INTEGER DEFAULT 0,
        error_msg        TEXT
      );

      CREATE TABLE IF NOT EXISTS crawler_logs (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        level      TEXT NOT NULL,
        message    TEXT NOT NULL,
        context    TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    this.seedDefaults();
  }

  async findImovelByRef(ref: string): Promise<{ id: string } | null> {
    return (
      (this.db
        .prepare("SELECT id FROM imoveis_temp WHERE ref = ? LIMIT 1")
        .get(ref) as { id: string } | null) ?? null
    );
  }

  async getImovelById(id: string): Promise<ImovelRow | null> {
    const row = this.db
      .prepare("SELECT * FROM imoveis_temp WHERE id = ? LIMIT 1")
      .get(id) as Record<string, unknown> | null;
    return row ? toImovelRow(row) : null;
  }

  async getImovelsByRef(ref: string): Promise<ImovelRow[]> {
    const rows = this.db
      .prepare("SELECT * FROM imoveis_temp WHERE ref = ? LIMIT 200")
      .all(ref) as Record<string, unknown>[];
    return rows.map(toImovelRow);
  }

  async insertImovel(data: ImovelInsert): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO imoveis_temp (
          id, ref, text_description, features, id_listing, images,
          price_aluguel, price_iptu, price_condominio, area_m2,
          bedroom, bathroom, garage, neighborhood, city, property_type,
          created, updated
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        data.id,
        data.ref,
        data.textDescription,
        data.features,
        data.idListing,
        data.images,
        data.priceAluguel,
        data.priceIptu,
        data.priceCondominio,
        data.areaM2,
        data.bedroom,
        data.bathroom,
        data.garage,
        data.neighborhood ?? null,
        data.city ?? null,
        data.propertyType ?? null,
        data.created.toISOString(),
        data.updated.toISOString(),
      );
  }

  async updateImovel(id: string, data: ImovelUpdate): Promise<void> {
    this.db
      .prepare(
        `UPDATE imoveis_temp SET
          text_description = ?, features = ?, id_listing = ?, images = ?,
          price_aluguel = ?, price_iptu = ?, price_condominio = ?, area_m2 = ?,
          bedroom = ?, bathroom = ?, garage = ?,
          neighborhood = ?, city = ?, property_type = ?,
          updated = ?
        WHERE id = ?`,
      )
      .run(
        data.textDescription,
        data.features,
        data.idListing,
        data.images,
        data.priceAluguel,
        data.priceIptu,
        data.priceCondominio,
        data.areaM2,
        data.bedroom,
        data.bathroom,
        data.garage,
        data.neighborhood ?? null,
        data.city ?? null,
        data.propertyType ?? null,
        data.updated.toISOString(),
        id,
      );
  }

  async patchImovel(id: string, data: ImovelPatch): Promise<void> {
    this.db
      .prepare(
        "UPDATE imoveis_temp SET text_description = ?, features = ?, updated = ? WHERE id = ?",
      )
      .run(data.textDescription, data.features, data.updated.toISOString(), id);
  }

  async deleteImovel(id: string): Promise<void> {
    this.db.prepare("DELETE FROM imoveis_temp WHERE id = ?").run(id);
  }

  async deleteAllImoveis(): Promise<number> {
    const { n } = this.db
      .prepare("SELECT count(*) as n FROM imoveis_temp")
      .get() as { n: number };
    this.db.prepare("DELETE FROM imoveis_temp").run();
    return n;
  }

  async countImoveis(): Promise<number> {
    return (
      this.db
        .prepare("SELECT count(*) as n FROM imoveis_temp")
        .get() as { n: number }
    ).n;
  }

  async getImoveisPrices(): Promise<number[]> {
    const rows = this.db
      .prepare("SELECT price_aluguel FROM imoveis_temp WHERE price_aluguel > 0")
      .all() as { price_aluguel: number }[];
    return rows.map((r) => r.price_aluguel);
  }

  async getAllListings(): Promise<ListingRow[]> {
    const rows = this.db
      .prepare("SELECT * FROM listings LIMIT 200")
      .all() as Record<string, unknown>[];
    return rows.map(toListingRow);
  }

  async getListingById(id: string): Promise<ListingRow | null> {
    const row = this.db
      .prepare("SELECT * FROM listings WHERE id = ? LIMIT 1")
      .get(id) as Record<string, unknown> | null;
    return row ? toListingRow(row) : null;
  }

  async updateListing(id: string, data: ListingUpdate): Promise<void> {
    this.db
      .prepare(
        `UPDATE listings SET name = ?, active = ?, last_page = ?, url = ?, max_pages = ?, delay_ms = ?, updated = ? WHERE id = ?`,
      )
      .run(
        data.name,
        data.active ? 1 : 0,
        data.lastPage,
        data.url,
        data.maxPages,
        data.delayMs,
        new Date().toISOString(),
        id,
      );
  }

  async getActiveListingNames(): Promise<string[]> {
    const rows = this.db
      .prepare("SELECT name FROM listings WHERE active = 1")
      .all() as { name: string }[];
    return rows.map((r) => r.name);
  }

  async createCrawlerRun(siteName: string): Promise<{ id: number }> {
    const result = this.db
      .prepare(
        "INSERT INTO crawler_runs (site_name, status, started_at) VALUES (?, 'running', ?)",
      )
      .run(siteName, new Date().toISOString());
    return { id: Number(result.lastInsertRowid) };
  }

  async finishCrawlerRun(id: number, data: CrawlerRunFinish): Promise<void> {
    const sets: string[] = [];
    const params: (string | number | null)[] = [];

    if (data.finishedAt) {
      sets.push("finished_at = ?");
      params.push(new Date(data.finishedAt).toISOString());
    }
    if (data.status) {
      sets.push("status = ?");
      params.push(data.status);
    }
    if (data.pagesCrawled !== undefined) {
      sets.push("pages_crawled = ?");
      params.push(data.pagesCrawled);
    }
    if (data.listingsScraped !== undefined) {
      sets.push("listings_scraped = ?");
      params.push(data.listingsScraped);
    }
    if (data.errors !== undefined) {
      sets.push("errors = ?");
      params.push(data.errors);
    }
    if (data.errorMsg !== undefined) {
      sets.push("error_msg = ?");
      params.push(data.errorMsg);
    }
    if (sets.length === 0) return;

    params.push(id);
    this.db
      .prepare(`UPDATE crawler_runs SET ${sets.join(", ")} WHERE id = ?`)
      .run(...params);
  }

  async getLatestCrawlerRuns(limit: number): Promise<CrawlerRunRow[]> {
    const rows = this.db
      .prepare(
        "SELECT * FROM crawler_runs ORDER BY started_at DESC, id DESC LIMIT ?",
      )
      .all(limit) as Record<string, unknown>[];
    return rows.map(toCrawlerRunRow);
  }

  async getLatestPerSite(): Promise<CrawlerRunRow[]> {
    const rows = this.db
      .prepare(
        `SELECT id, site_name, started_at, finished_at, status, pages_crawled, listings_scraped, errors, error_msg
         FROM (
           SELECT *, ROW_NUMBER() OVER (PARTITION BY site_name ORDER BY started_at DESC, id DESC) AS rn
           FROM crawler_runs
         )
         WHERE rn = 1
         ORDER BY site_name`,
      )
      .all() as Record<string, unknown>[];
    return rows.map(toCrawlerRunRow);
  }

  async countErrorsSince(days: number): Promise<number> {
    const cutoff = new Date(
      Date.now() - days * 24 * 60 * 60 * 1000,
    ).toISOString();
    return (
      this.db
        .prepare(
          "SELECT count(*) as n FROM crawler_runs WHERE status = 'error' AND started_at > ?",
        )
        .get(cutoff) as { n: number }
    ).n;
  }

  async countRunsSince(days: number): Promise<number> {
    const cutoff = new Date(
      Date.now() - days * 24 * 60 * 60 * 1000,
    ).toISOString();
    return (
      this.db
        .prepare(
          "SELECT count(*) as n FROM crawler_runs WHERE started_at > ?",
        )
        .get(cutoff) as { n: number }
    ).n;
  }

  async insertCrawlerLog(data: CrawlerLogInsert): Promise<void> {
    const createdAt = (data.createdAt ?? new Date()).toISOString();
    const contextJson = data.context ? JSON.stringify(data.context) : null;
    this.db
      .prepare(
        "INSERT INTO crawler_logs (level, message, context, created_at) VALUES (?, ?, ?, ?)",
      )
      .run(data.level, data.message, contextJson, createdAt);
  }

  async getLatestCrawlerLogs(limit: number): Promise<CrawlerLogRow[]> {
    const rows = this.db
      .prepare(
        "SELECT * FROM crawler_logs ORDER BY created_at DESC, id DESC LIMIT ?",
      )
      .all(limit) as Record<string, unknown>[];

    return rows.map((row) => ({
      id: row.id as number,
      level: row.level as string,
      message: row.message as string,
      context: (row.context as string) ?? null,
      createdAt: new Date(row.created_at as string),
    }));
  }
}
