import PocketBase, { ClientResponseError } from "pocketbase";
import { Logger } from "../config/logger";
import { DownloadImageAndCreateFile } from "../utils/download-image";
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

const COLLECTIONS = {
  IMOVEIS: "imoveis_temp",
  LISTINGS: "listings",
  CRAWLER_RUNS: "crawler_runs",
  CRAWLER_LOGS: "crawler_logs",
} as const;

interface CollectionFieldSpec {
  name: string;
  type: "text" | "number" | "date" | "json" | "bool";
  required?: boolean;
}

const CRAWLER_RUNS_FIELDS: CollectionFieldSpec[] = [
  { name: "site_name", type: "text", required: true },
  { name: "started_at", type: "date" },
  { name: "finished_at", type: "date" },
  { name: "status", type: "text" },
  { name: "pages_crawled", type: "number" },
  { name: "listings_scraped", type: "number" },
  { name: "errors", type: "number" },
  { name: "error_msg", type: "text" },
];

const CRAWLER_LOGS_FIELDS: CollectionFieldSpec[] = [
  { name: "level", type: "text", required: true },
  { name: "message", type: "text", required: true },
  { name: "context", type: "json" },
  { name: "created_at", type: "date" },
];

const BATCH_CHUNK_SIZE = 40;

export interface PocketBaseAdapterOptions {
  url?: string;
  email?: string;
  password?: string;
  token?: string;
  uploadImages?: boolean;
  client?: PocketBase;
  downloadImageFn?: (url: string) => Promise<File | null>;
}

function getHttpStatus(err: unknown): number | undefined {
  if (err instanceof ClientResponseError) return err.status;
  if (typeof err === "object" && err !== null && "status" in err) {
    const status = (err as { status?: unknown }).status;
    return typeof status === "number" ? status : undefined;
  }
  return undefined;
}

function isNotFoundError(err: unknown): boolean {
  return getHttpStatus(err) === 404;
}

function isMissingCollectionError(err: unknown): boolean {
  const status = getHttpStatus(err);
  return status === 404 || status === 400;
}

function toDate(val: unknown): Date | null {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (typeof val === "string" || typeof val === "number") {
    const d = new Date(val);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function serializeJsonField(val: unknown): string | null {
  if (val == null) return null;
  if (typeof val === "string") return val;
  return JSON.stringify(val);
}

function parseJsonField(raw: string | null): unknown {
  if (raw == null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function parseImageUrls(raw: string): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is string => typeof item === "string" && item.trim().length > 0,
    );
  } catch {
    return [];
  }
}

function toNumberOrNull(val: unknown): number | null {
  return typeof val === "number" && Number.isFinite(val) ? val : null;
}

function toImovelRow(record: Record<string, unknown>): ImovelRow {
  const idListingRaw = record.id_listing;
  const idListing = Array.isArray(idListingRaw)
    ? (typeof idListingRaw[0] === "string" ? idListingRaw[0] : null)
    : (typeof idListingRaw === "string" ? idListingRaw : null);

  return {
    id: String(record.id),
    ref: String(record.ref ?? ""),
    textDescription:
      typeof record.text_description === "string" ? record.text_description : null,
    features: serializeJsonField(record.features),
    idListing,
    images: serializeJsonField(record.images),
    priceAluguel: toNumberOrNull(record.price_aluguel),
    priceIptu: toNumberOrNull(record.price_iptu),
    priceCondominio: toNumberOrNull(record.price_condominio),
    areaM2: toNumberOrNull(record.area_m2),
    bedroom: toNumberOrNull(record.bedroom),
    bathroom: toNumberOrNull(record.bathroom),
    garage: toNumberOrNull(record.garage),
    neighborhood:
      typeof record.neighborhood === "string" ? record.neighborhood : null,
    city: typeof record.city === "string" ? record.city : null,
    propertyType:
      typeof record.property_type === "string" ? record.property_type : null,
    created: toDate(record.created),
    updated: toDate(record.updated),
  };
}

function toListingRow(record: Record<string, unknown>): ListingRow {
  return {
    id: String(record.id),
    name: String(record.name ?? ""),
    active: Boolean(record.active),
    lastPage: typeof record.last_page === "number" ? record.last_page : 1,
    url: typeof record.url === "string" ? record.url : null,
    maxPages: typeof record.max_pages === "number" ? record.max_pages : 50,
    delayMs: typeof record.delay_ms === "number" ? record.delay_ms : 2000,
    created: toDate(record.created),
    updated: toDate(record.updated),
  };
}

function extractPriceFromRecord(record: Record<string, unknown>): number | null {
  if (typeof record.price_aluguel === "number" && record.price_aluguel > 0) {
    return record.price_aluguel;
  }

  let features = record.features;
  if (typeof features === "string") {
    try {
      features = JSON.parse(features);
    } catch {
      features = null;
    }
  }

  if (typeof features === "object" && features !== null) {
    const price = (features as Record<string, unknown>).price_aluguel;
    if (typeof price === "number" && price > 0) return price;
  }

  return null;
}

export class PocketBaseAdapter implements DbAdapter {
  private pb: PocketBase;
  private email?: string;
  private password?: string;
  private token?: string;
  private uploadImages: boolean;
  private downloadImageFn: (url: string) => Promise<File | null>;
  private authPromise: Promise<void> | null = null;

  private useFallbackRuns = false;
  private fallbackRuns: CrawlerRunRow[] = [];
  private useFallbackLogs = false;
  private fallbackLogs: CrawlerLogRow[] = [];
  private nextRunId = 1;
  private nextLogId = 1;
  private pbRunIdMap = new Map<number, string>();
  private pbIdToRunId = new Map<string, number>();

  constructor(options: PocketBaseAdapterOptions | string = {}) {
    const opts: PocketBaseAdapterOptions =
      typeof options === "string" ? { url: options } : options;

    const baseUrl =
      opts.url ?? process.env.POCKETBASE_URL ?? "https://pb.victorbernardes.me";

    this.pb = opts.client ?? new PocketBase(baseUrl);
    this.pb.autoCancellation(false);

    this.email = opts.email ?? process.env.POCKETBASE_EMAIL;
    this.password = opts.password ?? process.env.POCKETBASE_PASSWORD;
    this.token = opts.token ?? process.env.POCKETBASE_TOKEN;
    this.uploadImages =
      opts.uploadImages ?? process.env.POCKETBASE_UPLOAD_IMAGES !== "false";
    this.downloadImageFn = opts.downloadImageFn ?? DownloadImageAndCreateFile;
  }

  private async ensureAuth(): Promise<void> {
    if (this.token) {
      if (!this.pb.authStore.token) {
        this.pb.authStore.save(this.token, null);
      }
      return;
    }

    if (!this.email || !this.password) return;
    if (this.pb.authStore.isValid) return;

    if (!this.authPromise) {
      const email = this.email;
      const password = this.password;
      this.authPromise = (async () => {
        try {
          await this.pb
            .collection("_superusers")
            .authWithPassword(email, password);
        } catch {
          try {
            await this.pb.admins.authWithPassword(email, password);
          } catch {
            const res = (await this.pb.send("/api/admins/auth-with-password", {
              method: "POST",
              body: { identity: email, password },
            })) as {
              token?: unknown;
              admin?: Record<string, unknown> | null;
              record?: Record<string, unknown> | null;
            } | null;
            if (!res || typeof res.token !== "string" || !res.token) {
              throw new Error("Failed to authenticate admin with PocketBase.");
            }
            this.pb.authStore.save(
              res.token,
              (res.admin ?? res.record ?? null) as never,
            );
          }
        }
      })().finally(() => {
        this.authPromise = null;
      });
    }

    await this.authPromise;
  }

  private async ensureCollectionExists(
    name: string,
    fields: CollectionFieldSpec[],
  ): Promise<boolean> {
    try {
      await this.pb.collection(name).getList(1, 1, { fields: "id" });
      return true;
    } catch (err) {
      if (!isNotFoundError(err)) {
        return true;
      }
    }

    try {
      await this.pb.collections.create({
        name,
        type: "base",
        fields,
      } as never);
      return true;
    } catch (err) {
      if (getHttpStatus(err) === 400) {
        try {
          await this.pb.collections.create({
            name,
            type: "base",
            schema: fields,
          } as never);
          return true;
        } catch (fallbackErr) {
          Logger.warn(
            { collection: name, err: fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr) },
            `Could not auto-create PocketBase collection ${name}`,
          );
          return false;
        }
      }
      Logger.warn(
        { collection: name, err: err instanceof Error ? err.message : String(err) },
        `Could not auto-create PocketBase collection ${name}`,
      );
      return false;
    }
  }

  async ensureSchema(): Promise<void> {
    await this.ensureAuth();

    const runsReady = await this.ensureCollectionExists(
      COLLECTIONS.CRAWLER_RUNS,
      CRAWLER_RUNS_FIELDS,
    );
    if (!runsReady) this.useFallbackRuns = true;

    const logsReady = await this.ensureCollectionExists(
      COLLECTIONS.CRAWLER_LOGS,
      CRAWLER_LOGS_FIELDS,
    );
    if (!logsReady) this.useFallbackLogs = true;

    try {
      const existing = await this.pb
        .collection(COLLECTIONS.LISTINGS)
        .getFullList<{ id: string; name?: string }>({ fields: "id,name" });

      const existingNames = new Set(
        existing.map((r) => r.name).filter((n): n is string => Boolean(n)),
      );

      for (const seed of DEFAULT_SEED_LISTINGS) {
        if (existingNames.has(seed.name)) continue;
        await this.pb.collection(COLLECTIONS.LISTINGS).create({
          name: seed.name,
          active: seed.active,
          last_page: seed.lastPage,
          url: seed.url,
          max_pages: seed.maxPages,
          delay_ms: seed.delayMs,
        });
      }
    } catch (err) {
      Logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        "Could not verify or seed PocketBase listings collection",
      );
    }
  }

  private async buildImovelPayload(
    data: ImovelInsert | ImovelUpdate,
  ): Promise<Record<string, unknown>> {
    const payload: Record<string, unknown> = {
      text_description: data.textDescription ?? "",
      features: parseJsonField(data.features),
      id_listing: data.idListing,
      price_aluguel: data.priceAluguel,
      price_iptu: data.priceIptu,
      price_condominio: data.priceCondominio,
      area_m2: data.areaM2,
      bedroom: data.bedroom,
      bathroom: data.bathroom,
      garage: data.garage,
      neighborhood: data.neighborhood ?? "",
      city: data.city ?? "",
      property_type: data.propertyType ?? "",
    };

    if ("ref" in data) {
      payload.ref = data.ref;
    }

    if (this.uploadImages) {
      const urls = parseImageUrls(data.images);
      if (urls.length > 0) {
        const downloaded = await Promise.all(
          urls.map((url) => this.downloadImageFn(url)),
        );
        const files = downloaded.filter((file): file is File => file !== null);
        if (files.length > 0) {
          payload.images = files;
        }
      }
    }

    return payload;
  }

  async findImovelByRef(ref: string): Promise<{ id: string } | null> {
    await this.ensureAuth();
    try {
      const record = await this.pb
        .collection(COLLECTIONS.IMOVEIS)
        .getFirstListItem<{ id: string }>(
          this.pb.filter("ref = {:ref}", { ref }),
          { fields: "id" },
        );
      return { id: record.id };
    } catch (err) {
      if (isNotFoundError(err)) return null;
      throw err;
    }
  }

  async getImovelById(id: string): Promise<ImovelRow | null> {
    await this.ensureAuth();
    try {
      const record = await this.pb
        .collection(COLLECTIONS.IMOVEIS)
        .getOne<Record<string, unknown>>(id);
      return toImovelRow(record);
    } catch (err) {
      if (isNotFoundError(err)) return null;
      throw err;
    }
  }

  async getImovelsByRef(ref: string): Promise<ImovelRow[]> {
    await this.ensureAuth();
    const list = await this.pb
      .collection(COLLECTIONS.IMOVEIS)
      .getList<Record<string, unknown>>(1, 200, {
        filter: this.pb.filter("ref = {:ref}", { ref }),
      });
    return list.items.map(toImovelRow);
  }

  async insertImovel(data: ImovelInsert): Promise<void> {
    await this.ensureAuth();
    const payload = await this.buildImovelPayload(data);
    await this.pb.collection(COLLECTIONS.IMOVEIS).create(payload);
  }

  async updateImovel(id: string, data: ImovelUpdate): Promise<void> {
    await this.ensureAuth();
    const payload = await this.buildImovelPayload(data);
    await this.pb.collection(COLLECTIONS.IMOVEIS).update(id, payload);
  }

  async patchImovel(id: string, data: ImovelPatch): Promise<void> {
    await this.ensureAuth();
    await this.pb.collection(COLLECTIONS.IMOVEIS).update(id, {
      text_description: data.textDescription ?? "",
      features: parseJsonField(data.features),
    });
  }

  async deleteImovel(id: string): Promise<void> {
    await this.ensureAuth();
    await this.pb.collection(COLLECTIONS.IMOVEIS).delete(id);
  }

  private async deleteImovelRecordsInBatches(
    records: Array<{ id: string }>,
  ): Promise<number> {
    if (records.length === 0) return 0;

    for (let i = 0; i < records.length; i += BATCH_CHUNK_SIZE) {
      const chunk = records.slice(i, i + BATCH_CHUNK_SIZE);
      try {
        const batch = this.pb.createBatch();
        for (const rec of chunk) {
          batch.collection(COLLECTIONS.IMOVEIS).delete(rec.id);
        }
        await batch.send();
      } catch {
        for (const rec of chunk) {
          await this.pb.collection(COLLECTIONS.IMOVEIS).delete(rec.id);
        }
      }
    }

    return records.length;
  }

  async deleteAllImoveis(): Promise<number> {
    await this.ensureAuth();
    const records = await this.pb
      .collection(COLLECTIONS.IMOVEIS)
      .getFullList<{ id: string }>({ fields: "id" });

    return this.deleteImovelRecordsInBatches(records);
  }

  async deleteInvalidOlxImoveis(): Promise<number> {
    await this.ensureAuth();
    const records = await this.pb
      .collection(COLLECTIONS.IMOVEIS)
      .getFullList<{ id: string; ref?: string }>({
        filter:
          'ref ~ "olx.com.br" && (ref ~ "/vi/" || ref ~ "rec=" || ref !~ "/imoveis/")',
        fields: "id,ref",
      });

    const invalid = records.filter((rec) => {
      const ref = typeof rec.ref === "string" ? rec.ref : "";
      const lower = ref.toLowerCase();
      return (
        lower.includes("olx.com.br") &&
        (lower.includes("/vi/") ||
          lower.includes("rec=") ||
          !/\/imoveis(\/|$)/i.test(ref))
      );
    });

    return this.deleteImovelRecordsInBatches(invalid);
  }

  async countImoveis(): Promise<number> {
    await this.ensureAuth();
    const res = await this.pb
      .collection(COLLECTIONS.IMOVEIS)
      .getList(1, 1, { fields: "id" });
    return res.totalItems;
  }

  async getImoveisPrices(): Promise<number[]> {
    await this.ensureAuth();
    const records = await this.pb
      .collection(COLLECTIONS.IMOVEIS)
      .getFullList<Record<string, unknown>>({ fields: "price_aluguel,features" });

    const prices: number[] = [];
    for (const rec of records) {
      const price = extractPriceFromRecord(rec);
      if (price !== null) prices.push(price);
    }
    return prices;
  }

  async getAllListings(): Promise<ListingRow[]> {
    await this.ensureAuth();
    const records = await this.pb
      .collection(COLLECTIONS.LISTINGS)
      .getFullList<Record<string, unknown>>();
    return records.map(toListingRow);
  }

  async getListingById(id: string): Promise<ListingRow | null> {
    await this.ensureAuth();
    try {
      const record = await this.pb
        .collection(COLLECTIONS.LISTINGS)
        .getOne<Record<string, unknown>>(id);
      return toListingRow(record);
    } catch (err) {
      if (isNotFoundError(err)) return null;
      throw err;
    }
  }

  async updateListing(id: string, data: ListingUpdate): Promise<void> {
    await this.ensureAuth();
    await this.pb.collection(COLLECTIONS.LISTINGS).update(id, {
      name: data.name,
      active: data.active,
      last_page: data.lastPage,
      url: data.url,
      max_pages: data.maxPages,
      delay_ms: data.delayMs,
    });
  }

  async getActiveListingNames(): Promise<string[]> {
    await this.ensureAuth();
    const records = await this.pb
      .collection(COLLECTIONS.LISTINGS)
      .getFullList<{ name?: string }>({
        filter: "active = true",
        fields: "name",
      });
    return records
      .map((r) => r.name)
      .filter((name): name is string => typeof name === "string" && name.length > 0);
  }

  private getOrAssignRunId(pbId: string): number {
    const existing = this.pbIdToRunId.get(pbId);
    if (existing !== undefined) return existing;
    const numericId = this.nextRunId++;
    this.pbIdToRunId.set(pbId, numericId);
    this.pbRunIdMap.set(numericId, pbId);
    return numericId;
  }

  private toCrawlerRunRow(record: Record<string, unknown>): CrawlerRunRow {
    const rawId = record.id;
    const numericId =
      typeof rawId === "number"
        ? rawId
        : this.getOrAssignRunId(String(rawId ?? ""));

    return {
      id: numericId,
      siteName: String(record.site_name ?? ""),
      startedAt: toDate(record.started_at) ?? toDate(record.created) ?? new Date(),
      finishedAt: toDate(record.finished_at),
      status: String(record.status ?? "running"),
      pagesCrawled: toNumberOrNull(record.pages_crawled),
      listingsScraped: toNumberOrNull(record.listings_scraped),
      errors: toNumberOrNull(record.errors),
      errorMsg: typeof record.error_msg === "string" ? record.error_msg : null,
    };
  }

  private enableFallbackRuns(err: unknown): void {
    if (!this.useFallbackRuns) {
      this.useFallbackRuns = true;
      Logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        "PocketBase crawler_runs collection unavailable; using in-memory fallback",
      );
    }
  }

  async createCrawlerRun(siteName: string): Promise<{ id: number }> {
    const id = this.nextRunId++;
    const now = new Date();
    const fallbackRow: CrawlerRunRow = {
      id,
      siteName,
      startedAt: now,
      finishedAt: null,
      status: "running",
      pagesCrawled: 0,
      listingsScraped: 0,
      errors: 0,
      errorMsg: null,
    };
    this.fallbackRuns.push(fallbackRow);

    if (this.useFallbackRuns) {
      return { id };
    }

    try {
      await this.ensureAuth();
      const record = await this.pb
        .collection(COLLECTIONS.CRAWLER_RUNS)
        .create<{ id: string }>({
          site_name: siteName,
          status: "running",
          started_at: now.toISOString(),
          pages_crawled: 0,
          listings_scraped: 0,
          errors: 0,
        });
      this.pbRunIdMap.set(id, record.id);
      this.pbIdToRunId.set(record.id, id);
    } catch (err) {
      if (isMissingCollectionError(err)) {
        this.enableFallbackRuns(err);
      } else {
        throw err;
      }
    }

    return { id };
  }

  async finishCrawlerRun(id: number, data: CrawlerRunFinish): Promise<void> {
    const local = this.fallbackRuns.find((r) => r.id === id);
    if (local) {
      if (data.finishedAt) local.finishedAt = new Date(data.finishedAt);
      if (data.status) local.status = data.status;
      if (data.pagesCrawled !== undefined) local.pagesCrawled = data.pagesCrawled;
      if (data.listingsScraped !== undefined)
        local.listingsScraped = data.listingsScraped;
      if (data.errors !== undefined) local.errors = data.errors;
      if (data.errorMsg !== undefined) local.errorMsg = data.errorMsg;
    }

    if (this.useFallbackRuns) return;

    const pbId = this.pbRunIdMap.get(id);
    if (!pbId) return;

    const patch: Record<string, unknown> = {};
    if (data.finishedAt) patch.finished_at = new Date(data.finishedAt).toISOString();
    if (data.status) patch.status = data.status;
    if (data.pagesCrawled !== undefined) patch.pages_crawled = data.pagesCrawled;
    if (data.listingsScraped !== undefined)
      patch.listings_scraped = data.listingsScraped;
    if (data.errors !== undefined) patch.errors = data.errors;
    if (data.errorMsg !== undefined) patch.error_msg = data.errorMsg;
    if (Object.keys(patch).length === 0) return;

    try {
      await this.ensureAuth();
      await this.pb.collection(COLLECTIONS.CRAWLER_RUNS).update(pbId, patch);
    } catch (err) {
      if (isMissingCollectionError(err)) {
        this.enableFallbackRuns(err);
      } else {
        throw err;
      }
    }
  }

  async getLatestCrawlerRuns(limit: number): Promise<CrawlerRunRow[]> {
    if (!this.useFallbackRuns) {
      try {
        await this.ensureAuth();
        const res = await this.pb
          .collection(COLLECTIONS.CRAWLER_RUNS)
          .getList<Record<string, unknown>>(1, limit, { sort: "-started_at" });
        return res.items.map((r) => this.toCrawlerRunRow(r));
      } catch (err) {
        if (!isMissingCollectionError(err)) throw err;
        this.enableFallbackRuns(err);
      }
    }

    return [...this.fallbackRuns]
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
      .slice(0, limit);
  }

  async getLatestPerSite(): Promise<CrawlerRunRow[]> {
    const allRuns = await this.getLatestCrawlerRuns(200);
    const bySite = new Map<string, CrawlerRunRow>();

    for (const run of allRuns) {
      const current = bySite.get(run.siteName);
      if (
        !current ||
        run.startedAt.getTime() > current.startedAt.getTime()
      ) {
        bySite.set(run.siteName, run);
      }
    }

    return [...bySite.values()].sort((a, b) =>
      a.siteName.localeCompare(b.siteName),
    );
  }

  async countErrorsSince(days: number): Promise<number> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    if (!this.useFallbackRuns) {
      try {
        await this.ensureAuth();
        const res = await this.pb
          .collection(COLLECTIONS.CRAWLER_RUNS)
          .getList(1, 1, {
            filter: this.pb.filter(
              "status = 'error' && started_at > {:cutoff}",
              { cutoff },
            ),
            fields: "id",
          });
        return res.totalItems;
      } catch (err) {
        if (!isMissingCollectionError(err)) throw err;
        this.enableFallbackRuns(err);
      }
    }

    return this.fallbackRuns.filter(
      (r) => r.status === "error" && r.startedAt.getTime() > cutoff.getTime(),
    ).length;
  }

  async countRunsSince(days: number): Promise<number> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    if (!this.useFallbackRuns) {
      try {
        await this.ensureAuth();
        const res = await this.pb
          .collection(COLLECTIONS.CRAWLER_RUNS)
          .getList(1, 1, {
            filter: this.pb.filter("started_at > {:cutoff}", { cutoff }),
            fields: "id",
          });
        return res.totalItems;
      } catch (err) {
        if (!isMissingCollectionError(err)) throw err;
        this.enableFallbackRuns(err);
      }
    }

    return this.fallbackRuns.filter(
      (r) => r.startedAt.getTime() > cutoff.getTime(),
    ).length;
  }

  private enableFallbackLogs(err: unknown): void {
    if (!this.useFallbackLogs) {
      this.useFallbackLogs = true;
      console.warn(
        "PocketBase crawler_logs collection unavailable; using in-memory fallback:",
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  async insertCrawlerLog(data: CrawlerLogInsert): Promise<void> {
    const createdAt = data.createdAt ?? new Date();
    const row: CrawlerLogRow = {
      id: this.nextLogId++,
      level: data.level,
      message: data.message,
      context: data.context ? JSON.stringify(data.context) : null,
      createdAt,
    };
    this.fallbackLogs.push(row);

    if (this.useFallbackLogs) return;

    try {
      await this.ensureAuth();
      await this.pb.collection(COLLECTIONS.CRAWLER_LOGS).create({
        level: data.level,
        message: data.message,
        context: data.context ?? null,
        created_at: createdAt.toISOString(),
      });
    } catch (err) {
      if (isMissingCollectionError(err)) {
        this.enableFallbackLogs(err);
      } else {
        throw err;
      }
    }
  }

  async getLatestCrawlerLogs(limit: number): Promise<CrawlerLogRow[]> {
    if (!this.useFallbackLogs) {
      try {
        await this.ensureAuth();
        const res = await this.pb
          .collection(COLLECTIONS.CRAWLER_LOGS)
          .getList<Record<string, unknown>>(1, limit, { sort: "-created_at" });
        return res.items.map((r) => ({
          id: String(r.id ?? ""),
          level: String(r.level ?? "info"),
          message: String(r.message ?? ""),
          context: serializeJsonField(r.context),
          createdAt: toDate(r.created_at) ?? toDate(r.created) ?? new Date(),
        }));
      } catch (err) {
        if (!isMissingCollectionError(err)) throw err;
        this.enableFallbackLogs(err);
      }
    }

    return [...this.fallbackLogs]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }
}
