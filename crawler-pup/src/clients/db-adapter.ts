export interface SeedListing {
  id: string;
  name: string;
  active: boolean;
  lastPage: number;
  url: string;
  maxPages: number;
  delayMs: number;
}

export const DEFAULT_SEED_LISTINGS: readonly SeedListing[] = [
  {
    id: "listing-olx-imoveis",
    name: "olx-imoveis",
    active: true,
    lastPage: 1,
    url: "https://www.olx.com.br/imoveis/aluguel/estado-sc/norte-de-santa-catarina/joinville",
    maxPages: 50,
    delayMs: 2000,
  },
  {
    id: "listing-chaves-na-mao",
    name: "chaves-na-mao",
    active: true,
    lastPage: 1,
    url: "https://www.chavesnamao.com.br/apartamentos-para-alugar/sc-joinville/",
    maxPages: 50,
    delayMs: 2000,
  },
  {
    id: "listing-zap-imoveis",
    name: "zap-imoveis",
    active: false,
    lastPage: 1,
    url: "https://www.zapimoveis.com.br/aluguel/imoveis/sc+joinville/",
    maxPages: 50,
    delayMs: 2000,
  },
  {
    id: "listing-imoveis-sc",
    name: "imoveis-sc",
    active: false,
    lastPage: 1,
    url: "https://www.imoveis-sc.com.br/joinville/alugar/apartamento+casa",
    maxPages: 50,
    delayMs: 2000,
  },
  {
    id: "listing-vivareal-imoveis",
    name: "vivareal-imoveis",
    active: false,
    lastPage: 1,
    url: "https://www.vivareal.com.br/aluguel/santa-catarina/joinville/",
    maxPages: 50,
    delayMs: 2000,
  },
];

export interface ImovelInsert {
  id: string;
  ref: string;
  textDescription: string | null;
  features: string | null;
  idListing: string | null;
  images: string;
  created: Date;
  updated: Date;
  priceAluguel: number;
  priceIptu: number;
  priceCondominio: number;
  areaM2: number;
  bedroom: number;
  bathroom: number;
  garage: number;
  neighborhood?: string;
  city?: string;
  propertyType?: string;
}

export interface ImovelUpdate {
  textDescription: string | null;
  features: string | null;
  idListing: string | null;
  images: string;
  updated: Date;
  priceAluguel: number;
  priceIptu: number;
  priceCondominio: number;
  areaM2: number;
  bedroom: number;
  bathroom: number;
  garage: number;
  neighborhood?: string;
  city?: string;
  propertyType?: string;
}

export interface ImovelPatch {
  textDescription: string | null;
  features: string | null;
  updated: Date;
}

export interface ImovelRow {
  id: string;
  ref: string;
  textDescription: string | null;
  features: string | null;
  idListing: string | null;
  images: string | null;
  priceAluguel: number | null;
  priceIptu: number | null;
  priceCondominio: number | null;
  areaM2: number | null;
  bedroom: number | null;
  bathroom: number | null;
  garage: number | null;
  neighborhood: string | null;
  city: string | null;
  propertyType: string | null;
  created: Date | null;
  updated: Date | null;
}

export interface ListingRow {
  id: string;
  name: string;
  active: boolean;
  lastPage: number;
  url: string | null;
  maxPages: number;
  delayMs: number;
  created: Date | null;
  updated: Date | null;
}

export interface ListingUpdate {
  name: string;
  active: boolean;
  lastPage: number;
  url: string | null;
  maxPages: number;
  delayMs: number;
}

export interface CrawlerRunRow {
  id: number;
  siteName: string;
  startedAt: Date;
  finishedAt: Date | null;
  status: string;
  pagesCrawled: number | null;
  listingsScraped: number | null;
  errors: number | null;
  errorMsg: string | null;
}

export interface CrawlerRunFinish {
  finishedAt?: string;
  status?: string;
  pagesCrawled?: number;
  listingsScraped?: number;
  errors?: number;
  errorMsg?: string;
}

export interface CrawlerLogInsert {
  level: "debug" | "info" | "warn" | "error";
  message: string;
  context?: Record<string, unknown> | null;
  createdAt?: Date;
}

export interface CrawlerLogRow {
  id: string | number;
  level: string;
  message: string;
  context: string | null;
  createdAt: Date;
}

export interface DbAdapter {
  ensureSchema(): Promise<void>;

  // imoveis_temp
  findImovelByRef(ref: string): Promise<{ id: string } | null>;
  getImovelById(id: string): Promise<ImovelRow | null>;
  getImovelsByRef(ref: string): Promise<ImovelRow[]>;
  insertImovel(data: ImovelInsert): Promise<void>;
  updateImovel(id: string, data: ImovelUpdate): Promise<void>;
  patchImovel(id: string, data: ImovelPatch): Promise<void>;
  deleteImovel(id: string): Promise<void>;
  deleteAllImoveis(): Promise<number>;
  countImoveis(): Promise<number>;
  getImoveisPrices(): Promise<number[]>;

  // listings
  getAllListings(): Promise<ListingRow[]>;
  getListingById(id: string): Promise<ListingRow | null>;
  updateListing(id: string, data: ListingUpdate): Promise<void>;
  getActiveListingNames(): Promise<string[]>;

  // crawler_runs
  createCrawlerRun(siteName: string): Promise<{ id: number }>;
  finishCrawlerRun(id: number, data: CrawlerRunFinish): Promise<void>;
  getLatestCrawlerRuns(limit: number): Promise<CrawlerRunRow[]>;
  getLatestPerSite(): Promise<CrawlerRunRow[]>;
  countErrorsSince(days: number): Promise<number>;
  countRunsSince(days: number): Promise<number>;

  // crawler_logs
  insertCrawlerLog(data: CrawlerLogInsert): Promise<void>;
  getLatestCrawlerLogs(limit: number): Promise<CrawlerLogRow[]>;
}
