import {
  describe,
  test,
  expect,
  beforeAll,
  afterEach,
  afterAll,
} from "bun:test";
import { setAdapter } from "../../clients/db";
import { SqliteAdapter } from "../../clients/sqlite-adapter";
import { CrawlerRunsRepository } from "../crawler-runs-repository";
import { ImoveisRepository } from "../imoveis-repository";

let sqlite: SqliteAdapter;

describe("ImoveisRepository (SqliteAdapter :memory:)", () => {
  beforeAll(async () => {
    sqlite = new SqliteAdapter(":memory:");
    await sqlite.ensureSchema();
    setAdapter(sqlite);
  });

  afterEach(() => {
    sqlite.reset();
  });

  afterAll(() => {
    sqlite.close();
    setAdapter(null);
  });

  test("create inserts a new imovel with structured fields", async () => {
    const data = {
      ref: "https://example.com/1",
      text_description: "Apartamento teste",
      features: {
        price_aluguel: 1500,
        price_condominio: 350,
        price_iptu: 80,
        area_m2: 68,
        bedroom: 2,
        bathroom: 1,
        garage: 1,
        neighborhood: "Atiradores",
        city: "Joinville",
        propertyType: "Apartamento",
      },
      id_listing: "listing-1",
      images: ["https://img.jpg"],
    };

    const result = await ImoveisRepository.create(data);
    expect(result.ref).toBe(data.ref);

    const rows = await ImoveisRepository.getByRef(data.ref);
    expect(rows.length).toBe(1);
    expect(rows[0]?.textDescription).toBe("Apartamento teste");
    expect(rows[0]?.priceAluguel).toBe(1500);
    expect(rows[0]?.priceCondominio).toBe(350);
    expect(rows[0]?.areaM2).toBe(68);
    expect(rows[0]?.bedroom).toBe(2);
    expect(rows[0]?.neighborhood).toBe("Atiradores");
    expect(rows[0]?.city).toBe("Joinville");
    expect(rows[0]?.propertyType).toBe("Apartamento");
  });

  test("create rejects empty ref", async () => {
    expect(
      ImoveisRepository.create({ ref: "   ", text_description: "Inválido" }),
    ).rejects.toThrow("Imovel ref is required");
  });

  test("create upserts on duplicate ref", async () => {
    const ref = "https://example.com/2";
    await ImoveisRepository.create({
      ref,
      text_description: "Original",
      features: { price_aluguel: 1000 },
    });

    await ImoveisRepository.create({
      ref,
      text_description: "Updated",
      features: { price_aluguel: 1200 },
    });

    const rows = await ImoveisRepository.getByRef(ref);
    expect(rows.length).toBe(1);
    expect(rows[0]?.textDescription).toBe("Updated");
    expect(rows[0]?.priceAluguel).toBe(1200);
  });

  test("update modifies an existing imovel", async () => {
    const ref = "https://example.com/3";
    await ImoveisRepository.create({
      ref,
      text_description: "Before",
      features: {},
    });

    const [existing] = await ImoveisRepository.getByRef(ref);
    expect(existing).toBeDefined();
    await ImoveisRepository.update(existing!.id, {
      text_description: "After",
      features: { area_m2: 55 },
    });

    const [updated] = await ImoveisRepository.getByRef(ref);
    expect(updated?.textDescription).toBe("After");
  });

  test("delete removes an imovel", async () => {
    const ref = "https://example.com/4";
    await ImoveisRepository.create({ ref, features: {} });

    const [existing] = await ImoveisRepository.getByRef(ref);
    expect(existing).toBeDefined();
    await ImoveisRepository.delete(existing!.id);

    const rows = await ImoveisRepository.getByRef(ref);
    expect(rows.length).toBe(0);
  });

  test("deleteAllInBatch removes all imoveis", async () => {
    await ImoveisRepository.create({ ref: "https://a.com", features: {} });
    await ImoveisRepository.create({ ref: "https://b.com", features: {} });

    const result = await ImoveisRepository.deleteAllInBatch();
    expect(result.deleted).toBe(2);
  });

  test("getListingById throws for missing listing", async () => {
    expect(ImoveisRepository.getListingById("missing")).rejects.toThrow(
      "Listing not found: missing",
    );
  });

  test("updateListing modifies a listings row", async () => {
    sqlite.insertListing({
      id: "lst-1",
      name: "test-listing",
      active: true,
      lastPage: 1,
      maxPages: 50,
      delayMs: 2000,
    });

    await ImoveisRepository.updateListing("lst-1", {
      name: "updated-name",
      active: false,
      lastPage: 5,
    });

    const listing = await ImoveisRepository.getListingById("lst-1");
    expect(listing.name).toBe("updated-name");
    expect(listing.active).toBe(false);
    expect(listing.lastPage).toBe(5);
  });
});

describe("CrawlerRunsRepository (SqliteAdapter :memory:)", () => {
  beforeAll(async () => {
    sqlite = new SqliteAdapter(":memory:");
    await sqlite.ensureSchema();
    setAdapter(sqlite);
  });

  afterEach(() => {
    sqlite.reset();
  });

  afterAll(() => {
    sqlite.close();
    setAdapter(null);
  });

  test("create returns a run with id", async () => {
    const run = await CrawlerRunsRepository.create("olx-imoveis");
    expect(run.id).toBeGreaterThan(0);
  });

  test("finish updates run status and counters", async () => {
    const run = await CrawlerRunsRepository.create("zap-imoveis");
    await CrawlerRunsRepository.finish(run.id, {
      status: "completed",
      pagesCrawled: 10,
      listingsScraped: 200,
      errors: 2,
      finishedAt: new Date().toISOString(),
    });

    const latest = await CrawlerRunsRepository.getLatest(1);
    expect(latest[0]?.status).toBe("completed");
    expect(latest[0]?.pagesCrawled).toBe(10);
    expect(latest[0]?.listingsScraped).toBe(200);
    expect(latest[0]?.errors).toBe(2);
  });

  test("getLatest returns runs ordered by startedAt desc", async () => {
    await CrawlerRunsRepository.create("site-a");
    await new Promise((r) => setTimeout(r, 10));
    await CrawlerRunsRepository.create("site-b");

    const latest = await CrawlerRunsRepository.getLatest(10);
    expect(latest.length).toBe(2);
    expect(latest[0]?.siteName).toBe("site-b");
    expect(latest[1]?.siteName).toBe("site-a");
  });

  test("countSince returns number of runs in window", async () => {
    await CrawlerRunsRepository.create("site-a");
    const count = await CrawlerRunsRepository.countSince(1);
    expect(count).toBe(1);
  });

  test("countErrorsSince counts only error runs", async () => {
    const run = await CrawlerRunsRepository.create("site-a");
    await CrawlerRunsRepository.finish(run.id, {
      status: "error",
      finishedAt: new Date().toISOString(),
    });
    await CrawlerRunsRepository.create("site-b");

    const errors = await CrawlerRunsRepository.countErrorsSince(1);
    expect(errors).toBe(1);
  });

  test("getTotalListings counts imoveis_temp rows", async () => {
    await ImoveisRepository.create({ ref: "https://a.com", features: {} });
    await ImoveisRepository.create({ ref: "https://b.com", features: {} });

    const total = await CrawlerRunsRepository.getTotalListings();
    expect(total).toBe(2);
  });

  test("getLatestPerSite returns one run per site", async () => {
    await CrawlerRunsRepository.create("olx-imoveis");
    await new Promise((r) => setTimeout(r, 10));
    await CrawlerRunsRepository.create("olx-imoveis");
    await CrawlerRunsRepository.create("zap-imoveis");

    const perSite = await CrawlerRunsRepository.getLatestPerSite();
    const names = perSite.map((r) => r.siteName).sort();
    expect(names).toEqual(["olx-imoveis", "zap-imoveis"]);
  });
});
