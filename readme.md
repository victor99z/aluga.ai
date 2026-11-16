# Aluga.ai

## Description

Crawler to extract rental property data from Brazilian real estate portals and persist structured listings (plus images) into **PocketBase** (with a SQLite fallback for local development and automated tests), monitored with **Prometheus** and **Grafana**.

## Features

- Scrapes rental listings from multiple real estate websites (OLX, Chaves na Mão, Zap Imóveis, Imóveis SC, Vivareal).
- Extracts and normalizes structured fields (rent, condo fee, IPTU, area m², bedrooms, bathrooms, garage, neighborhood, city, property type) from JSON-LD and DOM cards.
- Persists listings and uploads image files to **PocketBase** via a `DbAdapter` abstraction (with `bun:sqlite` support for local runs and tests).
- Resumable pagination (`last_page` checkpointing per portal) and automatic empty-page stop.
- Prometheus `/metrics` and `/health` endpoints + pre-provisioned Grafana dashboard.

## Websites Supported

- `olx-imoveis` — https://www.olx.com.br/imoveis
- `chaves-na-mao` — https://www.chavesnamao.com.br/
- `zap-imoveis` — https://www.zapimoveis.com.br/
- `imoveis-sc` — https://www.imoveis-sc.com.br/
- `vivareal-imoveis` — https://www.vivareal.com.br/

## Quick Start

```bash
cd crawler-pup
bun install
cp .env.example .env

# Run with PocketBase (default)
bun run start

# Or run locally with SQLite
bun run dev:fresh

# Run tests
bun test
```

For full stack monitoring (`crawler-pup` + Prometheus + Grafana):

```bash
cp .env.example .env
docker compose up -d
```
