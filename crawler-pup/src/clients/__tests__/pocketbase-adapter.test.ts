import { describe, test, expect } from "bun:test";
import PocketBase, { ClientResponseError } from "pocketbase";
import { DEFAULT_SEED_LISTINGS } from "../db-adapter";
import { PocketBaseAdapter } from "../pocketbase-adapter";

function createMockPocketBase(overrides?: {
  listings?: Array<Record<string, unknown>>;
  imoveis?: Array<Record<string, unknown>>;
  hasCrawlerRuns?: boolean;
  hasCrawlerLogs?: boolean;
  canCreateCollections?: boolean;
  batchFails?: boolean;
}) {
  const listings = overrides?.listings ?? [];
  const imoveis = overrides?.imoveis ?? [];
  const crawlerRuns: Array<Record<string, unknown>> = [];
  const crawlerLogs: Array<Record<string, unknown>> = [];
  const createdCollections: string[] = [];
  let hasCrawlerRuns = overrides?.hasCrawlerRuns ?? true;
  let hasCrawlerLogs = overrides?.hasCrawlerLogs ?? true;
  const canCreateCollections = overrides?.canCreateCollections ?? false;
  const batchSizes: number[] = [];
  let seq = 1;

  const collections: Record<string, any> = {
    listings: {
      getFullList: async (opts?: { filter?: string }) => {
        if (opts?.filter?.includes("active = true")) {
          return listings.filter((l) => Boolean(l.active));
        }
        return [...listings];
      },
      getOne: async (id: string) => {
        const found = listings.find((l) => l.id === id);
        if (!found) throw new ClientResponseError({ status: 404 });
        return found;
      },
      create: async (data: Record<string, unknown>) => {
        const rec = { id: `pb-lst-${seq++}`, ...data };
        listings.push(rec);
        return rec;
      },
      update: async (id: string, data: Record<string, unknown>) => {
        const idx = listings.findIndex((l) => l.id === id);
        if (idx === -1) throw new ClientResponseError({ status: 404 });
        listings[idx] = { ...listings[idx], ...data };
        return listings[idx];
      },
    },
    imoveis_temp: {
      getFirstListItem: async (filter: string) => {
        const match = filter.match(/ref = '([^']*)'/);
        const ref = match?.[1] ?? "";
        const found = imoveis.find((i) => i.ref === ref);
        if (!found) throw new ClientResponseError({ status: 404 });
        return found;
      },
      getOne: async (id: string) => {
        const found = imoveis.find((i) => i.id === id);
        if (!found) throw new ClientResponseError({ status: 404 });
        return found;
      },
      getList: async (page: number, perPage: number, opts?: { filter?: string }) => {
        let items = [...imoveis];
        if (opts?.filter) {
          const match = opts.filter.match(/ref = '([^']*)'/);
          if (match) items = items.filter((i) => i.ref === match[1]);
        }
        return {
          page,
          perPage,
          totalItems: items.length,
          totalPages: 1,
          items: items.slice(0, perPage),
        };
      },
      getFullList: async () => [...imoveis],
      create: async (data: Record<string, unknown>) => {
        const rec = { id: `pb-imv-${seq++}`, ...data };
        imoveis.push(rec);
        return rec;
      },
      update: async (id: string, data: Record<string, unknown>) => {
        const idx = imoveis.findIndex((i) => i.id === id);
        if (idx === -1) throw new ClientResponseError({ status: 404 });
        imoveis[idx] = { ...imoveis[idx], ...data };
        return imoveis[idx];
      },
      delete: async (id: string) => {
        const idx = imoveis.findIndex((i) => i.id === id);
        if (idx !== -1) imoveis.splice(idx, 1);
      },
    },
    crawler_runs: {
      create: async (data: Record<string, unknown>) => {
        if (!hasCrawlerRuns) throw new ClientResponseError({ status: 404 });
        const rec = { id: `pb-run-${seq++}`, ...data };
        crawlerRuns.push(rec);
        return rec;
      },
      update: async (id: string, data: Record<string, unknown>) => {
        if (!hasCrawlerRuns) throw new ClientResponseError({ status: 404 });
        const idx = crawlerRuns.findIndex((r) => r.id === id);
        if (idx !== -1) crawlerRuns[idx] = { ...crawlerRuns[idx], ...data };
        return crawlerRuns[idx];
      },
      getList: async (page: number, perPage: number, opts?: { filter?: string }) => {
        if (!hasCrawlerRuns) throw new ClientResponseError({ status: 404 });
        let items = [...crawlerRuns];
        if (opts?.filter?.includes("status = 'error'")) {
          items = items.filter((r) => r.status === "error");
        }
        return {
          page,
          perPage,
          totalItems: items.length,
          totalPages: 1,
          items: items.slice(0, perPage),
        };
      },
    },
    crawler_logs: {
      create: async (data: Record<string, unknown>) => {
        if (!hasCrawlerLogs) throw new ClientResponseError({ status: 404 });
        const rec = { id: `pb-log-${seq++}`, ...data };
        crawlerLogs.push(rec);
        return rec;
      },
      getList: async (page: number, perPage: number) => {
        if (!hasCrawlerLogs) throw new ClientResponseError({ status: 404 });
        return {
          page,
          perPage,
          totalItems: crawlerLogs.length,
          totalPages: 1,
          items: [...crawlerLogs].reverse().slice(0, perPage),
        };
      },
    },
  };

  const mockPb = {
    authStore: { token: "", isValid: false, save: () => {} },
    autoCancellation: () => {},
    collections: {
      create: async (schema: { name: string }) => {
        if (!canCreateCollections) {
          throw new ClientResponseError({ status: 403 });
        }
        createdCollections.push(schema.name);
        if (schema.name === "crawler_runs") hasCrawlerRuns = true;
        if (schema.name === "crawler_logs") hasCrawlerLogs = true;
        return schema;
      },
    },
    filter: (expr: string, params?: Record<string, unknown>) => {
      let out = expr;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          const val =
            v instanceof Date
              ? `'${v.toISOString().replace("T", " ")}'`
              : `'${String(v)}'`;
          out = out.replaceAll(`{:${k}}`, val);
        }
      }
      return out;
    },
    collection: (name: string) => collections[name],
    createBatch: () => {
      const pendingDeletes: string[] = [];
      return {
        collection: () => ({
          delete: (id: string) => {
            pendingDeletes.push(id);
          },
        }),
        send: async () => {
          batchSizes.push(pendingDeletes.length);
          if (overrides?.batchFails) {
            throw new ClientResponseError({ status: 400 });
          }
          for (const id of pendingDeletes) {
            await collections.imoveis_temp.delete(id);
          }
        },
      };
    },
  };

  return {
    client: mockPb as unknown as PocketBase,
    listings,
    imoveis,
    crawlerRuns,
    crawlerLogs,
    createdCollections,
    batchSizes,
  };
}

describe("PocketBaseAdapter", () => {
  test("ensureSchema seeds missing listings without duplicating existing ones", async () => {
    const mock = createMockPocketBase({
      listings: [
        {
          id: "1d0nbow172stawv",
          name: "olx-imoveis",
          active: true,
          last_page: 12,
          url: "https://www.olx.com.br/imoveis",
          max_pages: 50,
          delay_ms: 2000,
        },
      ],
    });

    const adapter = new PocketBaseAdapter({ client: mock.client });
    await adapter.ensureSchema();

    expect(mock.listings.length).toBe(DEFAULT_SEED_LISTINGS.length);
    const olx = mock.listings.find((l) => l.name === "olx-imoveis");
    expect(olx?.id).toBe("1d0nbow172stawv");
    expect(olx?.last_page).toBe(12);
  });

  test("insertImovel parses features JSON and uploads downloaded image Files", async () => {
    const mock = createMockPocketBase();
    const fakeFile = new File(["bytes"], "photo.jpg", { type: "image/jpeg" });

    const adapter = new PocketBaseAdapter({
      client: mock.client,
      uploadImages: true,
      downloadImageFn: async (url) => (url.includes("good") ? fakeFile : null),
    });

    await adapter.insertImovel({
      id: "ignored-uuid",
      ref: "https://example.com/imovel-1",
      textDescription: "Apartamento Centro",
      features: JSON.stringify({ price_aluguel: 2200, bedroom: 2 }),
      idListing: "lst-1",
      images: JSON.stringify(["https://cdn.site/good.jpg", "https://cdn.site/bad.jpg"]),
      created: new Date(),
      updated: new Date(),
      priceAluguel: 2200,
      priceIptu: 100,
      priceCondominio: 400,
      areaM2: 75,
      bedroom: 2,
      bathroom: 1,
      garage: 1,
      neighborhood: "Centro",
      city: "Joinville",
      propertyType: "Apartamento",
    });

    expect(mock.imoveis.length).toBe(1);
    const saved = mock.imoveis[0]!;
    expect(saved.ref).toBe("https://example.com/imovel-1");
    expect(saved.features).toEqual({ price_aluguel: 2200, bedroom: 2 });
    expect(Array.isArray(saved.images)).toBe(true);
    expect((saved.images as File[]).length).toBe(1);
    expect((saved.images as File[])[0]?.name).toBe("photo.jpg");
  });

  test("findImovelByRef returns id when present and null on 404", async () => {
    const mock = createMockPocketBase({
      imoveis: [{ id: "pb123", ref: "https://example.com/x" }],
    });
    const adapter = new PocketBaseAdapter({ client: mock.client });

    expect(await adapter.findImovelByRef("https://example.com/x")).toEqual({
      id: "pb123",
    });
    expect(await adapter.findImovelByRef("https://example.com/missing")).toBeNull();
  });

  test("deleteAllImoveis chunks deletions into batches of <= 40", async () => {
    const items = Array.from({ length: 85 }, (_, i) => ({
      id: `id-${i}`,
      ref: `https://example.com/${i}`,
    }));
    const mock = createMockPocketBase({ imoveis: items });
    const adapter = new PocketBaseAdapter({ client: mock.client });

    const deleted = await adapter.deleteAllImoveis();
    expect(deleted).toBe(85);
    expect(mock.imoveis.length).toBe(0);
    expect(mock.batchSizes).toEqual([40, 40, 5]);
  });

  test("deleteAllImoveis falls back to individual delete when batch endpoint fails", async () => {
    const items = Array.from({ length: 5 }, (_, i) => ({
      id: `id-${i}`,
      ref: `https://example.com/${i}`,
    }));
    const mock = createMockPocketBase({ imoveis: items, batchFails: true });
    const adapter = new PocketBaseAdapter({ client: mock.client });

    const deleted = await adapter.deleteAllImoveis();
    expect(deleted).toBe(5);
    expect(mock.imoveis.length).toBe(0);
  });

  test("deleteInvalidOlxImoveis removes /vi/ and non-/imoveis/ OLX ads while keeping valid ones", async () => {
    const mock = createMockPocketBase({
      imoveis: [
        {
          id: "valid-olx",
          ref: "https://sc.olx.com.br/norte-de-santa-catarina/imoveis/apto-123",
        },
        {
          id: "invalid-vi",
          ref: "https://www.olx.com.br/vi/1553488450?rec=l&custom_tag=x",
        },
        {
          id: "invalid-rec",
          ref: "https://sc.olx.com.br/norte-de-santa-catarina/imoveis/casa-123?rec=n",
        },
        {
          id: "invalid-cat",
          ref: "https://www.olx.com.br/eletronicos/xbox-360-1553510692",
        },
        {
          id: "other-site",
          ref: "https://www.chavesnamao.com.br/imovel/apartamento-123/",
        },
      ],
    });
    const adapter = new PocketBaseAdapter({ client: mock.client });

    const deleted = await adapter.deleteInvalidOlxImoveis();
    expect(deleted).toBe(3);
    expect(mock.imoveis.map((i) => i.id)).toEqual(["valid-olx", "other-site"]);
  });

  test("getImoveisPrices reads price_aluguel and falls back to features.price_aluguel", async () => {
    const mock = createMockPocketBase({
      imoveis: [
        { id: "1", ref: "a", price_aluguel: 1800 },
        { id: "2", ref: "b", price_aluguel: 0, features: { price_aluguel: 2400 } },
        { id: "3", ref: "c", price_aluguel: 0, features: {} },
      ],
    });
    const adapter = new PocketBaseAdapter({ client: mock.client });

    expect(await adapter.getImoveisPrices()).toEqual([1800, 2400]);
  });

  test("updateListing sends clean snake_case fields", async () => {
    const mock = createMockPocketBase({
      listings: [
        {
          id: "lst-pb-1",
          name: "olx-imoveis",
          active: true,
          last_page: 1,
          url: "https://olx.com.br",
          max_pages: 50,
          delay_ms: 2000,
        },
      ],
    });
    const adapter = new PocketBaseAdapter({ client: mock.client });

    await adapter.updateListing("lst-pb-1", {
      name: "olx-imoveis",
      active: true,
      lastPage: 4,
      url: "https://olx.com.br",
      maxPages: 30,
      delayMs: 1500,
    });

    expect(mock.listings[0]?.last_page).toBe(4);
    expect(mock.listings[0]?.max_pages).toBe(30);
    expect(mock.listings[0]?.delay_ms).toBe(1500);
  });

  test("crawler_runs transparently falls back to memory when collection does not exist", async () => {
    const mock = createMockPocketBase({ hasCrawlerRuns: false });
    const adapter = new PocketBaseAdapter({ client: mock.client });

    const run = await adapter.createCrawlerRun("olx-imoveis");
    expect(run.id).toBe(1);

    await adapter.finishCrawlerRun(run.id, {
      status: "completed",
      pagesCrawled: 3,
      listingsScraped: 45,
      errors: 1,
      finishedAt: new Date().toISOString(),
    });

    const latest = await adapter.getLatestCrawlerRuns(5);
    expect(latest.length).toBe(1);
    expect(latest[0]?.siteName).toBe("olx-imoveis");
    expect(latest[0]?.status).toBe("completed");
    expect(latest[0]?.listingsScraped).toBe(45);
    expect(await adapter.countRunsSince(1)).toBe(1);
    expect(await adapter.countErrorsSince(1)).toBe(0);
  });

  test("ensureSchema auto-creates crawler_runs and crawler_logs when missing and permitted", async () => {
    const mock = createMockPocketBase({
      hasCrawlerRuns: false,
      hasCrawlerLogs: false,
      canCreateCollections: true,
    });
    const adapter = new PocketBaseAdapter({ client: mock.client });
    await adapter.ensureSchema();

    expect(mock.createdCollections).toEqual(["crawler_runs", "crawler_logs"]);

    await adapter.insertCrawlerLog({
      level: "info",
      message: "Crawler started",
      context: { site: "olx-imoveis" },
    });

    expect(mock.crawlerLogs.length).toBe(1);
    const logs = await adapter.getLatestCrawlerLogs(10);
    expect(logs[0]?.level).toBe("info");
    expect(logs[0]?.message).toBe("Crawler started");
  });

  test("crawler_logs falls back to memory when collection is unavailable", async () => {
    const mock = createMockPocketBase({ hasCrawlerLogs: false });
    const adapter = new PocketBaseAdapter({ client: mock.client });

    await adapter.insertCrawlerLog({
      level: "error",
      message: "Network failure",
      context: { page: 2 },
    });

    const logs = await adapter.getLatestCrawlerLogs(5);
    expect(logs.length).toBe(1);
    expect(logs[0]?.level).toBe("error");
    expect(logs[0]?.message).toBe("Network failure");
  });
});
