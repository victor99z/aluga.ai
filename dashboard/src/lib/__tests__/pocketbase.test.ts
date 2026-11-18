import { describe, expect, test } from "bun:test";
import type PocketBase from "pocketbase";
import {
  formatRelativeSeen,
  getDaysSince,
  RECENTLY_UPDATED_DAYS,
} from "../format";
import {
  authenticateWithPocketBase,
  buildCanonicalGroups,
  DEFAULT_FILTERS,
  DEFAULT_POCKETBASE_URL,
  deleteImovelRecords,
  filterAndSortImoveis,
  getAuthSessionUser,
  getSavedPocketBaseUrl,
  isInvalidOlxRef,
  normalizeCityName,
  normalizeImovelRecord,
  normalizeNeighborhood,
  normalizePropertyType,
  setRuntimeConfigForTest,
  type ImovelItem,
} from "../pocketbase";

describe("normalizeImovelRecord", () => {
  test("parses features, calculates total/pricePerM2, and resolves PocketBase + external image URLs", () => {
    const item = normalizeImovelRecord(
      {
        id: "rec123",
        collectionId: "pbc_imoveis",
        ref: "https://sc.olx.com.br/norte-de-santa-catarina/imoveis/apto-1",
        text_description: "Apartamento América 2 quartos",
        id_listing: "lst-olx",
        price_aluguel: 2000,
        price_condominio: 400,
        price_iptu: 100,
        area_m2: 50,
        bedroom: 2,
        bathroom: 1,
        garage: 1,
        neighborhood: "América",
        city: "Joinville",
        property_type: "Apartamento",
        features: JSON.stringify({
          address: "Rua X, América, Joinville",
          _favorite: true,
        }),
        images: [
          "foto_1_abc.webp",
          "https://cdn.example.com/external.jpg",
        ],
        created: "2026-11-16T10:00:00Z",
        updated: "2026-11-16T12:00:00Z",
      },
      "https://pb.example.com/",
      { "lst-olx": { name: "olx-imoveis" } },
      { rec123: { hidden: true } },
    );

    expect(item.portalName).toBe("olx-imoveis");
    expect(item.totalPrice).toBe(2500);
    expect(item.pricePerM2).toBe(40);
    expect(item.favorite).toBe(true);
    expect(item.hidden).toBe(true);
    expect(item.images).toEqual([
      {
        fullUrl:
          "https://pb.example.com/api/files/pbc_imoveis/rec123/foto_1_abc.webp",
        thumbUrl:
          "https://pb.example.com/api/files/pbc_imoveis/rec123/foto_1_abc.webp?thumb=480x360",
      },
      {
        fullUrl: "https://cdn.example.com/external.jpg",
        thumbUrl: "https://cdn.example.com/external.jpg",
      },
    ]);
  });

  test("falls back to features JSON and infers portal from ref", () => {
    const item = normalizeImovelRecord(
      {
        id: "rec456",
        ref: "https://www.zapimoveis.com.br/imovel/999",
        features: {
          price_aluguel: 1800,
          area_m2: 60,
          bedroom: 2,
          neighborhood: "Glória",
          city: "Joinville",
          propertyType: "Casa",
          title: "Casa na Glória",
        },
        images: JSON.stringify(["pic.jpg"]),
      },
      "https://pb.example.com",
    );

    expect(item.portalName).toBe("zap-imoveis");
    expect(item.title).toBe("Casa na Glória");
    expect(item.priceAluguel).toBe(1800);
    expect(item.totalPrice).toBe(1800);
    expect(item.pricePerM2).toBe(30);
    expect(item.images[0]?.fullUrl).toBe(
      "https://pb.example.com/api/files/imoveis_temp/rec456/pic.jpg",
    );
  });

  test("rewrites resizedimgs.vivareal.com vr-listing URLs to active zapimoveis CDN host", () => {
    const item = normalizeImovelRecord(
      {
        id: "vr1",
        ref: "https://www.vivareal.com.br/imovel/apto-1",
        images: [
          "https://resizedimgs.vivareal.com/img/vr-listing/abc123/foto.webp?action=fit-in&dimension=614x297",
        ],
      },
      "https://pb.example.com",
    );

    expect(item.images).toEqual([
      {
        fullUrl:
          "https://resizedimgs.zapimoveis.com.br/img/vr-listing/abc123/foto.webp?action=fit-in&dimension=614x297",
        thumbUrl:
          "https://resizedimgs.zapimoveis.com.br/img/vr-listing/abc123/foto.webp?action=fit-in&dimension=614x297",
      },
    ]);
  });
});

describe("filterAndSortImoveis", () => {
  const baseItem = (overrides: Partial<ImovelItem>): ImovelItem => ({
    id: "id-1",
    ref: "https://sc.olx.com.br/norte-de-santa-catarina/imoveis/1",
    title: "Apartamento Centro",
    textDescription: "Apartamento Centro",
    portalName: "olx-imoveis",
    idListing: "l1",
    priceAluguel: 2000,
    priceCondominio: 500,
    priceIptu: 100,
    totalPrice: 2600,
    areaM2: 65,
    pricePerM2: 30.77,
    bedroom: 2,
    bathroom: 1,
    garage: 1,
    neighborhood: "Centro",
    city: "Joinville",
    address: "Centro, Joinville",
    propertyType: "Apartamento",
    images: [{ fullUrl: "https://img/1.jpg", thumbUrl: "https://img/1.jpg" }],
    favorite: false,
    hidden: false,
    rawFeatures: {},
    created: "2026-11-16T10:00:00Z",
    updated: "2026-11-16T10:00:00Z",
    ...overrides,
  });

  const sample: ImovelItem[] = [
    baseItem({
      id: "1",
      title: "Apartamento Saguaçu",
      neighborhood: "Saguaçu",
      priceAluguel: 2200,
      priceCondominio: 300,
      priceIptu: 0,
      totalPrice: 2500,
      areaM2: 70,
      pricePerM2: 31.43,
      bedroom: 2,
      favorite: true,
      updated: "2026-11-16T14:00:00Z",
    }),
    baseItem({
      id: "2",
      title: "Casa Costa e Silva",
      portalName: "chaves-na-mao",
      neighborhood: "Costa e Silva",
      propertyType: "Casa",
      priceAluguel: 1900,
      priceCondominio: 0,
      priceIptu: 0,
      totalPrice: 1900,
      areaM2: 90,
      pricePerM2: 21.11,
      bedroom: 3,
      images: [],
      updated: "2026-11-16T12:00:00Z",
    }),
    baseItem({
      id: "3",
      title: "Kitnet Oculta",
      hidden: true,
      priceAluguel: 1200,
      priceCondominio: 100,
      priceIptu: 0,
      totalPrice: 1300,
      areaM2: 30,
      pricePerM2: 40,
      bedroom: 1,
    }),
  ];

  test("filters by visibility, accent-insensitive search, price mode, rooms, and images", () => {
    expect(filterAndSortImoveis(sample, DEFAULT_FILTERS).map((i) => i.id)).toEqual([
      "1",
      "2",
    ]);

    expect(
      filterAndSortImoveis(sample, {
        ...DEFAULT_FILTERS,
        search: "saguacu",
      }).map((i) => i.id),
    ).toEqual(["1"]);

    expect(
      filterAndSortImoveis(sample, {
        ...DEFAULT_FILTERS,
        visibilityMode: "hidden",
      }).map((i) => i.id),
    ).toEqual(["3"]);

    expect(
      filterAndSortImoveis(sample, {
        ...DEFAULT_FILTERS,
        visibilityMode: "favorites",
      }).map((i) => i.id),
    ).toEqual(["1"]);

    expect(
      filterAndSortImoveis(sample, {
        ...DEFAULT_FILTERS,
        onlyWithImages: true,
      }).map((i) => i.id),
    ).toEqual(["1"]);

    expect(
      filterAndSortImoveis(sample, {
        ...DEFAULT_FILTERS,
        priceMode: "total",
        maxPrice: "2000",
      }).map((i) => i.id),
    ).toEqual(["2"]);

    expect(
      filterAndSortImoveis(sample, {
        ...DEFAULT_FILTERS,
        minBedrooms: 3,
      }).map((i) => i.id),
    ).toEqual(["2"]);

    expect(
      filterAndSortImoveis(sample, {
        ...DEFAULT_FILTERS,
        neighborhoods: ["Saguaçu", "Costa e Silva"],
      }).map((i) => i.id),
    ).toEqual(["1", "2"]);

    expect(
      filterAndSortImoveis(sample, {
        ...DEFAULT_FILTERS,
        neighborhoods: ["saguacu"],
      }).map((i) => i.id),
    ).toEqual(["1"]);
  });

  test("sorts by price_asc, area_desc, and price_per_m2_asc", () => {
    expect(
      filterAndSortImoveis(sample, {
        ...DEFAULT_FILTERS,
        sortBy: "price_asc",
      }).map((i) => i.id),
    ).toEqual(["2", "1"]);

    expect(
      filterAndSortImoveis(sample, {
        ...DEFAULT_FILTERS,
        sortBy: "area_desc",
      }).map((i) => i.id),
    ).toEqual(["2", "1"]);

    expect(
      filterAndSortImoveis(sample, {
        ...DEFAULT_FILTERS,
        sortBy: "price_per_m2_asc",
      }).map((i) => i.id),
    ).toEqual(["2", "1"]);
  });
});

describe("authenticateWithPocketBase", () => {
  test("authenticates regular users first and falls back to _superusers", async () => {
    const authStore: {
      isValid: boolean;
      record: Record<string, unknown> | null;
    } = { isValid: false, record: null };

    const mockPbUser = {
      baseURL: "https://pb.example.com",
      authStore,
      collection: (name: string) => ({
        authWithPassword: async (email: string) => {
          if (name === "users") {
            authStore.isValid = true;
            authStore.record = {
              id: "u1",
              email,
              collectionName: "users",
            };
            return {};
          }
          throw new Error("Should not reach _superusers");
        },
      }),
    } as unknown as PocketBase;

    const userSession = await authenticateWithPocketBase(
      mockPbUser,
      "user@example.com",
      "secret",
    );
    expect(userSession.role).toBe("user");
    expect(userSession.email).toBe("user@example.com");

    const superAuthStore: {
      isValid: boolean;
      record: Record<string, unknown> | null;
    } = { isValid: false, record: null };

    const mockPbSuper = {
      baseURL: "https://pb.example.com",
      authStore: superAuthStore,
      collection: (name: string) => ({
        authWithPassword: async (email: string) => {
          if (name === "users") {
            throw Object.assign(new Error("Failed to authenticate."), {
              status: 400,
            });
          }
          if (name === "_superusers") {
            superAuthStore.isValid = true;
            superAuthStore.record = {
              id: "su1",
              email,
              collectionName: "_superusers",
            };
            return {};
          }
          throw new Error("Unknown collection");
        },
      }),
    } as unknown as PocketBase;

    const superSession = await authenticateWithPocketBase(
      mockPbSuper,
      "admin@example.com",
      "secret",
    );
    expect(superSession.role).toBe("superuser");
    expect(superSession.email).toBe("admin@example.com");
  });

  test("falls back to legacy /api/admins/auth-with-password when _superusers rejects with 401", async () => {
    const legacyAuthStore: {
      isValid: boolean;
      token: string;
      record: Record<string, unknown> | null;
      save: (token: string, record: Record<string, unknown> | null) => void;
    } = {
      isValid: false,
      token: "",
      record: null,
      save(token, record) {
        this.isValid = Boolean(token);
        this.token = token;
        this.record = record;
      },
    };

    const mockPbLegacy = {
      baseURL: "https://pb.example.com",
      authStore: legacyAuthStore,
      collection: (name: string) => ({
        authWithPassword: async () => {
          if (name === "users") {
            throw Object.assign(new Error("Failed to authenticate."), {
              status: 400,
            });
          }
          throw Object.assign(
            new Error("Missing or invalid authentication."),
            { status: 401 },
          );
        },
      }),
      send: async (path: string, options: { body?: { identity?: string } }) => {
        if (path === "/api/admins/auth-with-password") {
          return {
            token: "legacy-admin-jwt",
            admin: {
              id: "adm1",
              email: options.body?.identity ?? "admin@example.com",
            },
          };
        }
        throw new Error(`Unexpected path: ${path}`);
      },
    } as unknown as PocketBase;

    const legacySession = await authenticateWithPocketBase(
      mockPbLegacy,
      "admin@example.com",
      "secret",
    );
    expect(legacySession).toEqual({
      id: "adm1",
      email: "admin@example.com",
      role: "superuser",
    });
    expect(legacyAuthStore.token).toBe("legacy-admin-jwt");
  });

  test("throws invalid credentials message when all auth collections reject", async () => {
    const mockPbFail = {
      baseURL: "https://pb.example.com",
      authStore: { isValid: false, record: null },
      collection: () => ({
        authWithPassword: async () => {
          throw Object.assign(new Error("Failed to authenticate."), {
            status: 400,
          });
        },
      }),
    } as unknown as PocketBase;

    await expect(
      authenticateWithPocketBase(mockPbFail, "bad@example.com", "wrong"),
    ).rejects.toThrow("E-mail ou senha inválidos.");

    const mockPbMissingAuth = {
      baseURL: "https://pb.example.com",
      authStore: { isValid: false, record: null },
      collection: () => ({
        authWithPassword: async () => {
          throw Object.assign(
            new Error("Missing or invalid authentication."),
            { status: 401 },
          );
        },
      }),
      send: async () => {
        throw Object.assign(new Error("Failed to authenticate."), {
          status: 400,
        });
      },
    } as unknown as PocketBase;

    await expect(
      authenticateWithPocketBase(
        mockPbMissingAuth,
        "bad@example.com",
        "wrong",
      ),
    ).rejects.toThrow("E-mail ou senha inválidos.");
  });

  test("clears stale or expired authStore tokens before checking session and before login requests", async () => {
    const staleStore: {
      isValid: boolean;
      token: string;
      record: Record<string, unknown> | null;
      clear: () => void;
      save: (token: string, record: Record<string, unknown> | null) => void;
    } = {
      isValid: false,
      token: "expired-jwt",
      record: { id: "old", email: "old@example.com" },
      clear() {
        this.token = "";
        this.isValid = false;
        this.record = null;
      },
      save(token, record) {
        this.token = token;
        this.isValid = Boolean(token);
        this.record = record;
      },
    };

    const mockPbWithStale = {
      baseURL: "https://pb.example.com",
      authStore: staleStore,
      collection: (name: string) => ({
        authWithPassword: async (email: string) => {
          if (staleStore.token) {
            throw Object.assign(
              new Error("Missing or invalid authentication."),
              { status: 401 },
            );
          }
          if (name === "_superusers") {
            staleStore.save("fresh-jwt", {
              id: "su1",
              email,
              collectionName: "_superusers",
            });
            return {};
          }
          throw Object.assign(new Error("Failed to authenticate."), {
            status: 400,
          });
        },
      }),
    } as unknown as PocketBase;

    expect(getAuthSessionUser(mockPbWithStale)).toBeNull();
    expect(staleStore.token).toBe("");

    staleStore.token = "expired-jwt";
    staleStore.isValid = false;
    staleStore.record = { id: "old", email: "old@example.com" };

    const session = await authenticateWithPocketBase(
      mockPbWithStale,
      "admin@example.com",
      "secret",
    );
    expect(session).toEqual({
      id: "su1",
      email: "admin@example.com",
      role: "superuser",
    });
    expect(staleStore.token).toBe("fresh-jwt");
  });
});

describe("isInvalidOlxRef and deleteImovelRecords", () => {
  test("detects invalid OLX refs and deletes records in batches", async () => {
    expect(
      isInvalidOlxRef("https://www.olx.com.br/vi/1553488450?rec=l"),
    ).toBe(true);
    expect(
      isInvalidOlxRef("https://sc.olx.com.br/norte-de-santa-catarina/imoveis/apto-1"),
    ).toBe(false);

    const deletedIds: string[] = [];
    const mockPb = {
      createBatch: () => {
        const queued: string[] = [];
        return {
          collection: () => ({
            delete: (id: string) => queued.push(id),
          }),
          send: async () => {
            deletedIds.push(...queued);
          },
        };
      },
    } as unknown as PocketBase;

    const ids = Array.from({ length: 45 }, (_, i) => `id-${i}`);
    const count = await deleteImovelRecords(mockPb, ids);
    expect(count).toBe(45);
    expect(deletedIds).toEqual(ids);
  });
});

describe("getSavedPocketBaseUrl", () => {
  test("uses runtime PocketBase URL when configured and falls back to default", () => {
    setRuntimeConfigForTest({ pocketbaseUrl: "https://pb.custom.example/" });
    expect(getSavedPocketBaseUrl()).toBe("https://pb.custom.example");

    setRuntimeConfigForTest({ pocketbaseUrl: "", localSampleMode: false });
    expect(getSavedPocketBaseUrl()).toBe(DEFAULT_POCKETBASE_URL);
  });
});

describe("buildCanonicalGroups", () => {
  test("groups neighborhood variants differing by case, spacing, or accents", () => {
    const groups = buildCanonicalGroups([
      "Boa vista",
      "Boa Vista",
      "bom retiro",
      "Bom Retiro",
      "America",
      "América",
      "costa  e silva",
      "Costa e Silva",
    ]);

    expect(groups).toEqual([
      { value: "america", label: "América", count: 2 },
      { value: "boa vista", label: "Boa Vista", count: 2 },
      { value: "bom retiro", label: "Bom Retiro", count: 2 },
      { value: "costa e silva", label: "Costa e Silva", count: 2 },
    ]);
  });
});

describe("normalizePropertyType", () => {
  test("groups noisy title-extracted property types into canonical categories", () => {
    expect(normalizePropertyType("**Apartamento")).toBe("Apartamento");
    expect(normalizePropertyType("Aluga-se quitinete ...")).toBe("Kitnet");
    expect(normalizePropertyType("Alugo Mini Kitinete")).toBe("Kitnet");
    expect(normalizePropertyType("Alugo quartos")).toBe("Quarto");
    expect(
      normalizePropertyType(
        "15º andar com vista",
        "Apartamento no 15º andar com vista",
      ),
    ).toBe("Apartamento");
    expect(
      normalizePropertyType(
        "Aluga-se",
        "Excelente residência no Iririú",
        "https://sc.olx.com.br/imoveis/casa-123",
      ),
    ).toBe("Casa");
    expect(normalizePropertyType("Aluga-se", "Ótima oportunidade")).toBe("");
  });
});

describe("formatRelativeSeen and onlyRecentlyUpdated filter", () => {
  const nowMs = Date.parse("2026-11-16T18:00:00Z");

  test("computes days since update and flags stale listings after threshold", () => {
    expect(getDaysSince("2026-11-16 12:00:00.000Z", nowMs)).toBe(0);
    expect(formatRelativeSeen("2026-11-16T12:00:00Z", nowMs)).toEqual({
      label: "Visto hoje",
      days: 0,
      isStale: false,
    });
    expect(formatRelativeSeen("2026-11-15T12:00:00Z", nowMs)).toEqual({
      label: "Visto ontem",
      days: 1,
      isStale: false,
    });
    expect(formatRelativeSeen("2026-11-12T12:00:00Z", nowMs)).toEqual({
      label: "Visto há 4 dias",
      days: 4,
      isStale: false,
    });
    expect(
      formatRelativeSeen("2026-11-11T12:00:00Z", nowMs),
    ).toEqual({
      label: `Visto há ${RECENTLY_UPDATED_DAYS} dias`,
      days: RECENTLY_UPDATED_DAYS,
      isStale: true,
    });
    expect(formatRelativeSeen("", nowMs)).toEqual({
      label: "Sem data",
      days: null,
      isStale: false,
    });
  });

  test("onlyRecentlyUpdated filters out listings older than threshold or without dates", () => {
    const mk = (id: string, updated: string, created = ""): ImovelItem => ({
      id,
      ref: "https://sc.olx.com.br/imoveis/1",
      title: `Imóvel ${id}`,
      textDescription: "",
      portalName: "olx-imoveis",
      idListing: "l1",
      priceAluguel: 1500,
      priceCondominio: 0,
      priceIptu: 0,
      totalPrice: 1500,
      areaM2: 45,
      pricePerM2: 33.33,
      bedroom: 1,
      bathroom: 1,
      garage: 1,
      neighborhood: "Centro",
      city: "Joinville",
      address: "Centro, Joinville",
      propertyType: "Apartamento",
      images: [],
      favorite: false,
      hidden: false,
      rawFeatures: {},
      created,
      updated,
    });

    const items = [
      mk("today", "2026-11-16T10:00:00Z"),
      mk("four-days", "2026-11-12T10:00:00Z"),
      mk("stale-five-days", "2026-11-11T10:00:00Z"),
      mk("fallback-created-recent", "", "2026-11-15T10:00:00Z"),
      mk("no-date", "", ""),
    ];

    expect(
      filterAndSortImoveis(
        items,
        { ...DEFAULT_FILTERS, onlyRecentlyUpdated: true },
        nowMs,
      ).map((i) => i.id),
    ).toEqual(["today", "fallback-created-recent", "four-days"]);
  });
});

describe("normalizeNeighborhood and normalizeCityName", () => {
  test("strips city names, trailing listing codes, state suffixes, and prefixes from noisy neighborhoods", () => {
    const knownCities = ["Joinville"];

    expect(normalizeNeighborhood("Bom Retiro", "Joinville", knownCities)).toBe(
      "Bom Retiro",
    );
    expect(
      normalizeNeighborhood(
        "Bom Retiro, Joinville - 208",
        "Joinville",
        knownCities,
      ),
    ).toBe("Bom Retiro");
    expect(
      normalizeNeighborhood(
        "Bom Retiro, Joinville – 69",
        "",
        knownCities,
      ),
    ).toBe("Bom Retiro");
    expect(
      normalizeNeighborhood("Joinville, Bom Retiro", "", knownCities),
    ).toBe("Bom Retiro");
    expect(
      normalizeNeighborhood("Joinville - Bom Retiro", "", knownCities),
    ).toBe("Bom Retiro");
    expect(
      normalizeNeighborhood(
        "Rua X, 120, Bairro Saguaçú, Joinville - SC",
        "Joinville - SC",
        knownCities,
      ),
    ).toBe("Saguaçú");
    expect(normalizeCityName("Joinville - SC")).toBe("Joinville");

    const grouped = buildCanonicalGroups([
      normalizeNeighborhood("Bom Retiro", "Joinville", knownCities),
      normalizeNeighborhood("Bom Retiro, Joinville - 208", "Joinville", knownCities),
      normalizeNeighborhood("Bom Retiro, Joinville – 69", "", knownCities),
      normalizeNeighborhood("Joinville, Bom Retiro", "", knownCities),
    ]);
    expect(grouped).toEqual([
      { value: "bom retiro", label: "Bom Retiro", count: 4 },
    ]);
  });

  test("groups Pirabeiraba parenthetical districts and strips trailing listing phrases", () => {
    const knownCities = ["Joinville", "Jaraguá do Sul"];
    const variants = [
      "Dona Francisca (Pirabeiraba)",
      "Pirabeiraba",
      "Pirabeiraba (Pirabeiraba)",
      "Pirabeiraba para locação",
      "Pirabeiraba para locação com 2 quartos",
      "Rio Bonito (Pirabeiraba)",
      "Pirabeiraba.",
    ];

    for (const raw of variants) {
      expect(normalizeNeighborhood(raw, "Joinville", knownCities)).toBe(
        "Pirabeiraba",
      );
    }

    const grouped = buildCanonicalGroups(
      variants.map((raw) =>
        normalizeNeighborhood(raw, "Joinville", knownCities),
      ),
    );
    expect(grouped).toEqual([
      { value: "pirabeiraba", label: "Pirabeiraba", count: 7 },
    ]);

    expect(
      normalizeNeighborhood(
        "João Pessoa (Jaraguá do Sul)",
        "",
        knownCities,
      ),
    ).toBe("João Pessoa");
  });
});
