import type { ScraperRunner } from "./base-scraper";
import { getChavesNaMao } from "./chaves-na-mao";
import { getImoveisSc } from "./imoveis-sc";
import { getOlxImoveis } from "./olx-imoveis";
import { getVivarealImoveis } from "./vivareal-imoveis";
import { getZapImoveis } from "./zap-imoveis";

export const SCRAPER_REGISTRY: Record<string, ScraperRunner> = {
  "olx-imoveis": getOlxImoveis,
  "chaves-na-mao": getChavesNaMao,
  "zap-imoveis": getZapImoveis,
  "imoveis-sc": getImoveisSc,
  "vivareal-imoveis": getVivarealImoveis,
};
