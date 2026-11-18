import { Database } from "bun:sqlite";
import { existsSync, statSync } from "node:fs";
import path from "node:path";

const DIST_DIR = path.resolve(import.meta.dir, "dist");
const INDEX_FILE = path.join(DIST_DIR, "index.html");
const SAMPLE_DB_PATH = path.resolve(
  import.meta.dir,
  "../crawler-pup/data/sample.db",
);
const ALUGA_DB_PATH = path.resolve(
  import.meta.dir,
  "../crawler-pup/data/aluga.db",
);
const PORT = Number(process.env.PORT ?? 3000);

interface LocalStore {
  listings: Array<Record<string, unknown>>;
  imoveis_temp: Array<Record<string, unknown>>;
  crawler_runs: Array<Record<string, unknown>>;
  crawler_logs: Array<Record<string, unknown>>;
}

function parseJsonSafe(raw: unknown): unknown {
  if (typeof raw !== "string") return raw ?? null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function mapImovelRow(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: String(row.id),
    collectionId: "imoveis_temp",
    collectionName: "imoveis_temp",
    ref: row.ref ?? "",
    text_description: row.text_description ?? "",
    features: parseJsonSafe(row.features) ?? {},
    id_listing: row.id_listing ?? "",
    images: parseJsonSafe(row.images) ?? [],
    price_aluguel: row.price_aluguel ?? 0,
    price_iptu: row.price_iptu ?? 0,
    price_condominio: row.price_condominio ?? 0,
    area_m2: row.area_m2 ?? 0,
    bedroom: row.bedroom ?? 0,
    bathroom: row.bathroom ?? 0,
    garage: row.garage ?? 0,
    neighborhood: row.neighborhood ?? "",
    city: row.city ?? "",
    property_type: row.property_type ?? "",
    created: row.created ?? new Date().toISOString(),
    updated: row.updated ?? new Date().toISOString(),
  };
}

function mapListingRow(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: String(row.id),
    collectionId: "listings",
    collectionName: "listings",
    name: row.name ?? "",
    active: Boolean(row.active),
    last_page: typeof row.last_page === "number" ? row.last_page : 1,
    url: row.url ?? "",
    max_pages: typeof row.max_pages === "number" ? row.max_pages : 50,
    delay_ms: typeof row.delay_ms === "number" ? row.delay_ms : 2000,
    created: row.created ?? new Date().toISOString(),
    updated: row.updated ?? new Date().toISOString(),
  };
}

function loadLocalStore(): LocalStore | null {
  if (!existsSync(SAMPLE_DB_PATH)) return null;

  const sampleDb = new Database(SAMPLE_DB_PATH, { readonly: true });
  try {
    const listings = (
      sampleDb.query("SELECT * FROM listings ORDER BY name ASC").all() as Array<
        Record<string, unknown>
      >
    ).map(mapListingRow);

    const sampleImoveis = (
      sampleDb
        .query("SELECT * FROM imoveis_temp ORDER BY updated DESC")
        .all() as Array<Record<string, unknown>>
    ).map(mapImovelRow);

    const seenRefs = new Set(sampleImoveis.map((r) => String(r.ref ?? "")));

    if (existsSync(ALUGA_DB_PATH)) {
      const alugaDb = new Database(ALUGA_DB_PATH, { readonly: true });
      try {
        const extra = (
          alugaDb
            .query("SELECT * FROM imoveis_temp ORDER BY updated DESC LIMIT 25")
            .all() as Array<Record<string, unknown>>
        ).map(mapImovelRow);
        for (const row of extra) {
          const ref = String(row.ref ?? "");
          if (ref && !seenRefs.has(ref)) {
            seenRefs.add(ref);
            sampleImoveis.push(row);
          }
        }
      } finally {
        alugaDb.close();
      }
    }

    const crawler_runs = (
      sampleDb
        .query("SELECT * FROM crawler_runs ORDER BY started_at DESC, id DESC")
        .all() as Array<Record<string, unknown>>
    ).map((row) => ({
      id: String(row.id),
      collectionId: "crawler_runs",
      collectionName: "crawler_runs",
      site_name: row.site_name ?? "",
      started_at: row.started_at ?? "",
      finished_at: row.finished_at ?? "",
      status: row.status ?? "completed",
      pages_crawled: row.pages_crawled ?? 0,
      listings_scraped: row.listings_scraped ?? 0,
      errors: row.errors ?? 0,
      error_msg: row.error_msg ?? "",
    }));

    const crawler_logs = (
      sampleDb
        .query("SELECT * FROM crawler_logs ORDER BY created_at DESC, id DESC")
        .all() as Array<Record<string, unknown>>
    ).map((row) => ({
      id: String(row.id),
      collectionId: "crawler_logs",
      collectionName: "crawler_logs",
      level: row.level ?? "info",
      message: row.message ?? "",
      context: parseJsonSafe(row.context),
      created_at: row.created_at ?? "",
    }));

    return {
      listings,
      imoveis_temp: sampleImoveis,
      crawler_runs,
      crawler_logs,
    };
  } finally {
    sampleDb.close();
  }
}

const localStore = loadLocalStore();

function createLocalJwt(email: string): string {
  const header = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" }),
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      id: "local-superuser",
      type: "auth",
      collectionId: "pbc_3142635823",
      email,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
    }),
  ).toString("base64url");
  return `${header}.${payload}.local-dev-sig`;
}

function paginateItems(
  items: Array<Record<string, unknown>>,
  url: URL,
): Record<string, unknown> {
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
  const perPage = Math.max(
    1,
    Math.min(1000, Number(url.searchParams.get("perPage") ?? 500) || 500),
  );
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / perPage));
  const start = (page - 1) * perPage;

  return {
    page,
    perPage,
    totalItems,
    totalPages,
    items: items.slice(start, start + perPage),
  };
}

function deleteFromImoveis(id: string): boolean {
  if (!localStore) return false;
  const idx = localStore.imoveis_temp.findIndex((item) => item.id === id);
  if (idx === -1) return false;
  localStore.imoveis_temp.splice(idx, 1);
  return true;
}

async function handleBuiltInRoutes(
  req: Request,
  url: URL,
): Promise<Response | null> {
  if (url.pathname === "/api/health" && req.method === "GET") {
    return Response.json({
      code: 200,
      status: "ok",
      localSampleMode: Boolean(localStore),
    });
  }

  if (url.pathname === "/config.json" && req.method === "GET") {
    const pocketbaseUrl = (
      process.env.POCKETBASE_URL ||
      process.env.VITE_POCKETBASE_URL ||
      ""
    )
      .trim()
      .replace(/\/+$/, "");

    return Response.json(
      {
        pocketbaseUrl,
        localSampleMode: Boolean(localStore),
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }

  return null;
}

async function handleLocalApi(req: Request, url: URL): Promise<Response | null> {
  if (!localStore || !url.pathname.startsWith("/api/")) return null;

  if (
    (url.pathname === "/api/collections/users/auth-with-password" ||
      url.pathname === "/api/collections/_superusers/auth-with-password" ||
      url.pathname === "/api/admins/auth-with-password") &&
    req.method === "POST"
  ) {
    const body = (await req.json().catch(() => ({}))) as {
      identity?: string;
      password?: string;
    };
    const identity = String(body.identity ?? "").trim();
    const password = String(body.password ?? "");
    if (!identity || !password) {
      return Response.json(
        { status: 400, message: "Failed to authenticate.", data: {} },
        { status: 400 },
      );
    }

    return Response.json({
      token: createLocalJwt(identity),
      record: {
        id: "local-superuser",
        collectionId: "pbc_3142635823",
        collectionName: "_superusers",
        email: identity,
      },
    });
  }

  if (url.pathname === "/api/batch" && req.method === "POST") {
    const contentType = req.headers.get("content-type") ?? "";
    let requests: Array<{ method?: string; url?: string }> = [];
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const rawPayload = form.get("@jsonPayload");
      if (typeof rawPayload === "string") {
        const parsed = JSON.parse(rawPayload) as {
          requests?: Array<{ method?: string; url?: string }>;
        };
        requests = parsed.requests ?? [];
      }
    } else {
      const body = (await req.json().catch(() => ({}))) as {
        requests?: Array<{ method?: string; url?: string }>;
      };
      requests = body.requests ?? [];
    }

    const results = requests.map((subReq) => {
      const method = (subReq.method ?? "GET").toUpperCase();
      const match = subReq.url?.match(
        /^\/api\/collections\/imoveis_temp\/records\/([^/?]+)/,
      );
      if (method === "DELETE" && match?.[1]) {
        deleteFromImoveis(decodeURIComponent(match[1]));
        return { status: 204, body: null };
      }
      return { status: 400, body: { message: "Unsupported batch operation" } };
    });

    return Response.json(results);
  }

  const listMatch = url.pathname.match(
    /^\/api\/collections\/([^/]+)\/records$/,
  );
  if (listMatch?.[1] && req.method === "GET") {
    const collection = decodeURIComponent(listMatch[1]);
    if (collection in localStore) {
      const items = localStore[collection as keyof LocalStore];
      return Response.json(paginateItems(items, url));
    }
    return Response.json({ status: 404, message: "Not found" }, { status: 404 });
  }

  const recordMatch = url.pathname.match(
    /^\/api\/collections\/([^/]+)\/records\/([^/]+)$/,
  );
  if (recordMatch?.[1] && recordMatch?.[2]) {
    const collection = decodeURIComponent(recordMatch[1]);
    const id = decodeURIComponent(recordMatch[2]);

    if (collection === "listings" && req.method === "PATCH") {
      const idx = localStore.listings.findIndex((item) => item.id === id);
      if (idx === -1) {
        return Response.json({ status: 404, message: "Not found" }, { status: 404 });
      }
      const patch = (await req.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      const updated = {
        ...localStore.listings[idx],
        ...patch,
        updated: new Date().toISOString(),
      };
      localStore.listings[idx] = updated;
      return Response.json(updated);
    }

    if (collection === "imoveis_temp" && req.method === "PATCH") {
      const idx = localStore.imoveis_temp.findIndex((item) => item.id === id);
      if (idx === -1) {
        return Response.json({ status: 404, message: "Not found" }, { status: 404 });
      }
      const patch = (await req.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      const updated = {
        ...localStore.imoveis_temp[idx],
        ...patch,
        updated: new Date().toISOString(),
      };
      localStore.imoveis_temp[idx] = updated;
      return Response.json(updated);
    }

    if (collection === "imoveis_temp" && req.method === "DELETE") {
      if (!deleteFromImoveis(id)) {
        return Response.json({ status: 404, message: "Not found" }, { status: 404 });
      }
      return new Response(null, { status: 204 });
    }
  }

  return Response.json({ status: 404, message: "Not found" }, { status: 404 });
}

function resolveStaticPath(urlPath: string): string | null {
  const decoded = decodeURIComponent(urlPath.split("?")[0] ?? "/");
  const normalized =
    decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const candidate = path.resolve(DIST_DIR, normalized);

  if (candidate !== DIST_DIR && !candidate.startsWith(`${DIST_DIR}${path.sep}`)) {
    return null;
  }

  if (existsSync(candidate) && statSync(candidate).isFile()) {
    return candidate;
  }

  return null;
}

const server = Bun.serve({
  port: Number.isFinite(PORT) && PORT > 0 ? PORT : 3000,
  async fetch(req) {
    const url = new URL(req.url);
    const builtInResponse = await handleBuiltInRoutes(req, url);
    if (builtInResponse) return builtInResponse;

    const apiResponse = await handleLocalApi(req, url);
    if (apiResponse) return apiResponse;

    const staticFile = resolveStaticPath(url.pathname);
    if (staticFile) {
      return new Response(Bun.file(staticFile), {
        headers: {
          "Cache-Control": staticFile.includes(`${path.sep}assets${path.sep}`)
            ? "public, max-age=31536000, immutable"
            : "no-cache",
        },
      });
    }

    if (existsSync(INDEX_FILE)) {
      return new Response(Bun.file(INDEX_FILE), {
        headers: { "Cache-Control": "no-cache" },
      });
    }

    return new Response("Build not found. Run `bun run build` first.", {
      status: 404,
    });
  },
});

console.log(
  `Aluga.ai Dashboard listening on http://localhost:${server.port}` +
    (localStore
      ? ` (local sample mode: ${localStore.imoveis_temp.length} imoveis loaded)`
      : ""),
);
