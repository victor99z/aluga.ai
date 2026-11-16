# AGENTS.md

High-signal context for sessions in this repo.

## Repository layout

- **`crawler-pup/`** — Bun + TypeScript crawler application. All dev commands run from here.
- **Root** — Docker Compose for `crawler-pup`, Prometheus, and Grafana.

## Runtime

- **Bun**, not Node.js. Use `bun install`, `bun run src/index.ts`, etc.
- No lint or format scripts exist in `package.json`.
- Tests use Bun's built-in runner (`bun test`, `bun test --coverage`).

## Persistence (`DbAdapter`)

- Persistence is abstracted behind `DbAdapter` (`src/clients/db-adapter.ts`) and resolved via `getAdapter()` / `setAdapter()` (`src/clients/db.ts`).
- **PocketBase (`PocketBaseAdapter`, default)**: Connects to an external PocketBase instance via `POCKETBASE_URL` (default `https://pb.victorbernardes.me`) with optional auth (`POCKETBASE_EMAIL`/`POCKETBASE_PASSWORD` or `POCKETBASE_TOKEN`). Uploads downloaded image `File`s to `imoveis_temp.images` unless `POCKETBASE_UPLOAD_IMAGES=false`. Falls back to in-memory run telemetry if the `crawler_runs` collection is absent.
- **SQLite (`SqliteAdapter`)**: Activated when `DB_TYPE=sqlite` (using `bun:sqlite`, `DATABASE_URL` or `./crawler.sqlite`). Also used in-memory (`:memory:`) by the integration test suite.
- Seeds default `listings` rows from `DEFAULT_SEED_LISTINGS` via `ensureSchema()`.

## Testing

```bash
cd crawler-pup
bun test              # run all unit and integration tests (uses in-memory SQLite + mocked PocketBase)
bun test --coverage   # run with coverage report
```

- Does not require any external database service running.
- Test files live in `__tests__/` next to the code they verify.

## Running the crawler

```bash
cd crawler-pup
bun run src/index.ts                 # crawl all active listings using PocketBase
bun run dev:fresh                    # fresh local run using SQLite (./data/aluga.db)
bun run src/index.ts --page-start=3  # override start page for active listings
bun run src/index.ts --delete=true   # wipe all records from imoveis_temp
```

- The crawler **starts a metrics server on `METRICS_PORT` (default 9100)** immediately on startup.
  - `/metrics` — Prometheus format, 15s cache.
  - `/health` — returns `healthy` only if a run started within the last 24h.

## Scrapers

- **Only `olx-imoveis` and `chaves-na-mao` are active by default.** `zap-imoveis`, `imoveis-sc`, and `vivareal-imoveis` are seeded with `active: false`.
- Crawls are **resumable**: `listings.last_page` is updated after each page, so interrupted runs pick up where they left off.
- Shared engine and extractors:
  - `runScraper()` (`src/pages/base-scraper.ts`) — Puppeteer Stealth pagination, retry, persistence, and progress tracking.
  - `extractJsonLdListings()` / `parseJsonLdBlocks()` (`src/pages/extractors.ts`) — JSON-LD (`RealEstateListing`) extraction with title-parser fallback and image collection.
  - `extractDomListings()` (`src/pages/extractors.ts`) — data-driven DOM extraction paired with pure site mappers.
- `SCRAPER_REGISTRY` (`src/pages/index.ts`) dispatches scrapers by `listings.name`.

## Adding a new scraper

1. Create `src/pages/<site>.ts` using `runScraper` and helpers from `src/pages/extractors.ts`.
2. Register it in `SCRAPER_REGISTRY` (`src/pages/index.ts`).
3. Add a seed entry to `DEFAULT_SEED_LISTINGS` (`src/clients/db-adapter.ts`) or create the record in PocketBase `listings`.

## Docker / Puppeteer quirk

The `crawler-pup/Dockerfile` uses Alpine and sets `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser` because Puppeteer's bundled Chrome is glibc-linked and will not run on musl.
