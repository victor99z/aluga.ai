# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with this repository.

## Commands

```bash
# Install dependencies
bun install

# Run the crawler (defaults to PocketBase via POCKETBASE_URL)
bun run src/index.ts

# Run locally with a fresh SQLite database
bun run dev:fresh

# Collect 3 samples per site locally in SQLite
bun run sample

# Run with CLI options
bun run src/index.ts --page-start=3        # override start page for all active listings
bun run src/index.ts --sample=3 --all-sites
bun run src/index.ts --delete=true         # wipe all records from imoveis_temp

# Tests
bun test
bun test --coverage
```

See `.env.example` for `DB_TYPE`, `POCKETBASE_URL`, `POCKETBASE_EMAIL`, `POCKETBASE_PASSWORD`, `POCKETBASE_TOKEN`, and `POCKETBASE_UPLOAD_IMAGES`.

## Architecture

Bun + TypeScript web crawler that scrapes real-estate rental listings from Brazilian property portals (OLX, Chaves na Mão, Zap Imóveis, Imóveis SC, Vivareal) into PocketBase (with an optional SQLite adapter for local development and tests).

### Data flow

1. `src/index.ts` — entry point. Ensures schema/collections/seeds via `getAdapter().ensureSchema()`, wires the logger sink via `CrawlerRunsRepository.init()`, reads `listings`, and dispatches via `SCRAPER_REGISTRY` (`src/pages/index.ts`).
2. `src/pages/base-scraper.ts` — `runScraper()` generic engine: launches a stealth Puppeteer browser, paginates through listing pages, executes the site `extract` function, persists valid items via `ImoveisRepository.create()`, and updates `lastPage` after each page.
3. `src/pages/extractors.ts` — shared JSON-LD (`parseJsonLdBlocks` / `extractJsonLdListings`) and DOM (`extractDomListings`) extraction utilities plus URL helpers.
4. `src/pages/{olx-imoveis,chaves-na-mao,zap-imoveis,imoveis-sc,vivareal-imoveis}.ts` — site configurations and pure card mappers.
5. `src/repository/{imoveis-repository,crawler-runs-repository}.ts` — static repository facades delegating to the active `DbAdapter` (`src/clients/db.ts`).
6. `src/clients/{pocketbase-adapter,sqlite-adapter}.ts` — `DbAdapter` implementations for PocketBase (default, including image upload, batched deletes, and auto-creation of `crawler_runs` / `crawler_logs`) and SQLite (`bun:sqlite`).

### Collections / Tables

- `listings` — one record per target site (`active`, `last_page`, `url`, `max_pages`, `delay_ms`).
- `imoveis_temp` — scraped property cards; unique on `ref` (listing URL); stores structured fields (`price_aluguel`, `price_iptu`, `price_condominio`, `area_m2`, `bedroom`, `bathroom`, `garage`, `neighborhood`, `city`, `property_type`), `features` JSON, and `images`.
- `crawler_runs` — per-run summary (`site_name`, `started_at`, `finished_at`, `status`, `pages_crawled`, `listings_scraped`, `errors`, `error_msg`).
- `crawler_logs` — structured application logs (`level`, `message`, `context`, `created_at`) persisted directly via `Logger` sink.

### Adding a new scraper

1. Create `src/pages/<site-name>.ts` using `runScraper()` and helpers from `src/pages/extractors.ts`.
2. Register the runner in `SCRAPER_REGISTRY` in `src/pages/index.ts`.
3. Add a seed entry to `DEFAULT_SEED_LISTINGS` in `src/clients/db-adapter.ts` (or create the row in PocketBase `listings`).
