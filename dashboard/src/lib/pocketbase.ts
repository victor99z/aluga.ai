import PocketBase, { ClientResponseError } from "pocketbase";
import { getDaysSince, RECENTLY_UPDATED_DAYS } from "./format";

export const DEFAULT_POCKETBASE_URL =
  import.meta.env.VITE_POCKETBASE_URL?.trim() || "https://pb.victorbernardes.me";

const PB_URL_STORAGE_KEY = "aluga_pb_url";
const PREFS_STORAGE_KEY = "aluga_imoveis_prefs";
const BATCH_CHUNK_SIZE = 40;

let runtimePocketBaseUrl = "";
let runtimeLocalSampleMode = false;

export async function loadRuntimeConfig(): Promise<void> {
  try {
    const res = await fetch("/config.json", { cache: "no-store" });
    const contentType = res.headers.get("content-type") ?? "";
    if (!res.ok || !contentType.includes("application/json")) return;
    const data = (await res.json()) as {
      pocketbaseUrl?: unknown;
      localSampleMode?: unknown;
    };
    if (typeof data.pocketbaseUrl === "string" && data.pocketbaseUrl.trim()) {
      runtimePocketBaseUrl = data.pocketbaseUrl.trim().replace(/\/+$/, "");
    }
    if (typeof data.localSampleMode === "boolean") {
      runtimeLocalSampleMode = data.localSampleMode;
    }
  } catch {
    // Ignore when /config.json is unavailable (e.g. vite dev server or tests)
  }
}

export function setRuntimeConfigForTest(config: {
  pocketbaseUrl?: string;
  localSampleMode?: boolean;
}): void {
  runtimePocketBaseUrl = config.pocketbaseUrl?.trim().replace(/\/+$/, "") ?? "";
  runtimeLocalSampleMode = Boolean(config.localSampleMode);
}

export type AuthRole = "user" | "superuser";

export interface AuthSessionUser {
  id: string;
  email: string;
  role: AuthRole;
}

export interface ImovelImage {
  fullUrl: string;
  thumbUrl: string;
}

export interface LocalImovelPref {
  favorite?: boolean;
  hidden?: boolean;
}

export type LocalImovelPrefsMap = Record<string, LocalImovelPref>;

export interface ListingItem {
  id: string;
  name: string;
  active: boolean;
  lastPage: number;
  url: string;
  maxPages: number;
  delayMs: number;
  created: string;
  updated: string;
}

export interface ImovelItem {
  id: string;
  ref: string;
  title: string;
  textDescription: string;
  portalName: string;
  idListing: string;
  priceAluguel: number;
  priceCondominio: number;
  priceIptu: number;
  totalPrice: number;
  areaM2: number;
  pricePerM2: number | null;
  bedroom: number;
  bathroom: number;
  garage: number;
  neighborhood: string;
  city: string;
  address: string;
  propertyType: string;
  images: ImovelImage[];
  favorite: boolean;
  hidden: boolean;
  rawFeatures: Record<string, unknown>;
  created: string;
  updated: string;
}

export interface CrawlerRunItem {
  id: string;
  siteName: string;
  startedAt: string;
  finishedAt: string;
  status: string;
  pagesCrawled: number;
  listingsScraped: number;
  errors: number;
  errorMsg: string;
}

export interface CrawlerLogItem {
  id: string;
  level: string;
  message: string;
  context: string;
  createdAt: string;
}

export type PriceFilterMode = "total" | "rent";
export type VisibilityMode = "active" | "favorites" | "hidden" | "all";
export type SortMode =
  | "newest"
  | "price_asc"
  | "price_desc"
  | "area_desc"
  | "price_per_m2_asc";

export interface ImovelFilters {
  search: string;
  portal: string;
  city: string;
  neighborhoods: string[];
  propertyType: string;
  priceMode: PriceFilterMode;
  minPrice: string;
  maxPrice: string;
  minArea: string;
  maxArea: string;
  minBedrooms: number;
  minBathrooms: number;
  minGarage: number;
  onlyWithImages: boolean;
  onlyRecentlyUpdated: boolean;
  visibilityMode: VisibilityMode;
  sortBy: SortMode;
}

export const DEFAULT_FILTERS: ImovelFilters = {
  search: "",
  portal: "",
  city: "",
  neighborhoods: [],
  propertyType: "",
  priceMode: "total",
  minPrice: "",
  maxPrice: "",
  minArea: "",
  maxArea: "",
  minBedrooms: 0,
  minBathrooms: 0,
  minGarage: 0,
  onlyWithImages: false,
  onlyRecentlyUpdated: false,
  visibilityMode: "active",
  sortBy: "newest",
};

function safeStorageGet(key: string): string | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

function safeStorageSet(key: string, value: string): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(key, value);
    }
  } catch {
    // Ignore storage quota/privacy mode errors
  }
}

export function getSavedPocketBaseUrl(): string {
  const stored = safeStorageGet(PB_URL_STORAGE_KEY)?.trim();
  if (stored) return stored;
  if (runtimeLocalSampleMode && typeof window !== "undefined") {
    return window.location.origin;
  }
  if (runtimePocketBaseUrl) {
    return runtimePocketBaseUrl;
  }
  if (
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1")
  ) {
    return window.location.origin;
  }
  return DEFAULT_POCKETBASE_URL;
}

export function savePocketBaseUrl(url: string): string {
  const normalized = url.trim().replace(/\/+$/, "") || DEFAULT_POCKETBASE_URL;
  safeStorageSet(PB_URL_STORAGE_KEY, normalized);
  return normalized;
}

export function createPocketBaseClient(url?: string): PocketBase {
  const client = new PocketBase((url ?? getSavedPocketBaseUrl()).replace(/\/+$/, ""));
  client.autoCancellation(false);
  return client;
}

export function loadLocalImovelPrefs(): LocalImovelPrefsMap {
  const raw = safeStorageGet(PREFS_STORAGE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as LocalImovelPrefsMap) : {};
  } catch {
    return {};
  }
}

export function saveLocalImovelPrefs(prefs: LocalImovelPrefsMap): void {
  safeStorageSet(PREFS_STORAGE_KEY, JSON.stringify(prefs));
}

export function getAuthSessionUser(pb: PocketBase): AuthSessionUser | null {
  if (!pb.authStore.isValid) return null;

  const store = pb.authStore as unknown as {
    record?: Record<string, unknown> | null;
    model?: Record<string, unknown> | null;
    isSuperuser?: boolean;
    isAdmin?: boolean;
  };
  const model = store.record ?? store.model ?? null;
  if (!model) return null;

  const collectionName =
    typeof model.collectionName === "string" ? model.collectionName : "";
  const role: AuthRole =
    collectionName === "_superusers" ||
    store.isSuperuser === true ||
    store.isAdmin === true ||
    collectionName === ""
      ? "superuser"
      : "user";

  return {
    id: String(model.id ?? ""),
    email: String(model.email ?? model.username ?? "Usuário"),
    role,
  };
}

function getHttpStatus(err: unknown): number | undefined {
  if (err instanceof ClientResponseError) return err.status;
  if (typeof err === "object" && err !== null && "status" in err) {
    const status = (err as { status?: unknown }).status;
    return typeof status === "number" ? status : undefined;
  }
  return undefined;
}

export async function authenticateWithPocketBase(
  pb: PocketBase,
  email: string,
  password: string,
): Promise<AuthSessionUser> {
  const trimmedEmail = email.trim();
  const attempts: Array<{ role: AuthRole; run: () => Promise<unknown> }> = [
    {
      role: "user",
      run: () => pb.collection("users").authWithPassword(trimmedEmail, password),
    },
    {
      role: "superuser",
      run: () => pb.collection("_superusers").authWithPassword(trimmedEmail, password),
    },
  ];

  const legacyAdmins = (
    pb as unknown as {
      admins?: { authWithPassword?: (e: string, p: string) => Promise<unknown> };
    }
  ).admins;
  if (typeof legacyAdmins?.authWithPassword === "function") {
    attempts.push({
      role: "superuser",
      run: () => legacyAdmins.authWithPassword!(trimmedEmail, password),
    });
  }

  let lastError: unknown;
  let allNetworkErrors = true;

  for (const attempt of attempts) {
    try {
      await attempt.run();
      const session = getAuthSessionUser(pb);
      if (session) return session;
      return {
        id: "",
        email: trimmedEmail,
        role: attempt.role,
      };
    } catch (err) {
      lastError = err;
      const status = getHttpStatus(err);
      if (status !== undefined && status !== 0) {
        allNetworkErrors = false;
      }
    }
  }

  if (allNetworkErrors) {
    throw new Error(
      `Não foi possível conectar ao PocketBase (${pb.baseURL}). Verifique a URL e a conexão de rede.`,
    );
  }

  const msg =
    lastError instanceof Error && lastError.message && !lastError.message.includes("Failed to authenticate")
      ? lastError.message
      : "E-mail ou senha inválidos.";
  throw new Error(msg);
}

function parseJsonObject(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

function toNonNegativeNumber(primary: unknown, fallback?: unknown): number {
  for (const candidate of [primary, fallback]) {
    if (typeof candidate === "number" && Number.isFinite(candidate) && candidate >= 0) {
      return candidate;
    }
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      const parsed = Number(candidate);
      if (Number.isFinite(parsed) && parsed >= 0) return parsed;
    }
  }
  return 0;
}

function toTrimmedString(primary: unknown, fallback?: unknown): string {
  for (const candidate of [primary, fallback]) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  return "";
}

export function inferPortalFromRef(ref: string): string {
  const lower = ref.toLowerCase();
  if (lower.includes("olx.com.br")) return "olx-imoveis";
  if (lower.includes("chavesnamao.com.br")) return "chaves-na-mao";
  if (lower.includes("zapimoveis.com.br")) return "zap-imoveis";
  if (lower.includes("imoveis-sc.com.br")) return "imoveis-sc";
  if (lower.includes("vivareal.com.br")) return "vivareal-imoveis";
  return "outro";
}

function extractRawImages(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed
            .filter((item): item is string => typeof item === "string")
            .map((item) => item.trim())
            .filter(Boolean);
        }
      } catch {
        return [];
      }
    }
    return [trimmed];
  }
  return [];
}

function normalizeExternalImageUrl(url: string): string {
  return url.replace(
    /^https:\/\/resizedimgs\.vivareal\.com\/img\/vr-listing\//i,
    "https://resizedimgs.zapimoveis.com.br/img/vr-listing/",
  );
}

function resolveImovelImages(
  record: Record<string, unknown>,
  baseUrl: string,
): ImovelImage[] {
  const cleanBaseUrl = baseUrl.replace(/\/+$/, "");
  const collectionIdOrName =
    toTrimmedString(record.collectionId, record.collectionName) || "imoveis_temp";
  const recordId = String(record.id ?? "");

  return extractRawImages(record.images).map((entry) => {
    if (/^https?:\/\//i.test(entry)) {
      const normalized = normalizeExternalImageUrl(entry);
      return { fullUrl: normalized, thumbUrl: normalized };
    }
    const fullUrl = `${cleanBaseUrl}/api/files/${encodeURIComponent(collectionIdOrName)}/${encodeURIComponent(recordId)}/${encodeURIComponent(entry)}`;
    return {
      fullUrl,
      thumbUrl: `${fullUrl}?thumb=480x360`,
    };
  });
}

export function normalizeImovelRecord(
  record: Record<string, unknown>,
  baseUrl: string,
  listingsById?: Map<string, ListingItem> | Record<string, { name: string }>,
  localPrefs?: LocalImovelPrefsMap,
  knownCities?: Iterable<string>,
): ImovelItem {
  const id = String(record.id ?? "");
  const rawFeatures = parseJsonObject(record.features);
  const ref = toTrimmedString(record.ref);

  const idListingRaw = record.id_listing;
  const idListing = Array.isArray(idListingRaw)
    ? String(idListingRaw[0] ?? "")
    : typeof idListingRaw === "string"
      ? idListingRaw
      : "";

  const mappedListing =
    listingsById instanceof Map
      ? listingsById.get(idListing)
      : listingsById?.[idListing];
  const portalName = mappedListing?.name || inferPortalFromRef(ref);

  const priceAluguel = toNonNegativeNumber(
    record.price_aluguel,
    rawFeatures.price_aluguel,
  );
  const priceCondominio = toNonNegativeNumber(
    record.price_condominio,
    rawFeatures.price_condominio,
  );
  const priceIptu = toNonNegativeNumber(
    record.price_iptu,
    rawFeatures.price_iptu,
  );
  const totalPrice = priceAluguel + priceCondominio + priceIptu;

  const areaM2 = toNonNegativeNumber(record.area_m2, rawFeatures.area_m2);
  const pricePerM2 =
    areaM2 > 0 && priceAluguel > 0
      ? Math.round((priceAluguel / areaM2) * 100) / 100
      : null;

  const bedroom = toNonNegativeNumber(record.bedroom, rawFeatures.bedroom);
  const bathroom = toNonNegativeNumber(record.bathroom, rawFeatures.bathroom);
  const garage = toNonNegativeNumber(record.garage, rawFeatures.garage);

  const rawNeighborhood = toTrimmedString(
    record.neighborhood,
    rawFeatures.neighborhood,
  );
  const rawCity = toTrimmedString(record.city, rawFeatures.city);
  const city = normalizeCityName(rawCity);
  const neighborhood = normalizeNeighborhood(
    rawNeighborhood,
    city,
    knownCities,
  );
  const rawPropertyType = toTrimmedString(
    record.property_type,
    rawFeatures.propertyType,
  );
  const address =
    toTrimmedString(rawFeatures.address) ||
    [neighborhood || rawNeighborhood, city].filter(Boolean).join(", ");
  let textDescription = toTrimmedString(record.text_description);
  if (textDescription.startsWith("{")) {
    const parsedDesc = parseJsonObject(textDescription);
    if (typeof parsedDesc.title === "string" && parsedDesc.title.trim()) {
      textDescription = parsedDesc.title.trim();
    }
  }
  const title =
    textDescription ||
    toTrimmedString(rawFeatures.title) ||
    "Imóvel sem título";
  const propertyType = normalizePropertyType(rawPropertyType, title, ref);

  const localPref = localPrefs?.[id];
  const favorite = localPref?.favorite ?? Boolean(rawFeatures._favorite);
  const hidden = localPref?.hidden ?? Boolean(rawFeatures._hidden);

  return {
    id,
    ref,
    title,
    textDescription,
    portalName,
    idListing,
    priceAluguel,
    priceCondominio,
    priceIptu,
    totalPrice,
    areaM2,
    pricePerM2,
    bedroom,
    bathroom,
    garage,
    neighborhood,
    city,
    address,
    propertyType,
    images: resolveImovelImages(record, baseUrl),
    favorite,
    hidden,
    rawFeatures,
    created: toTrimmedString(record.created),
    updated: toTrimmedString(record.updated),
  };
}

export function normalizeLocationKey(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

const STREET_PREFIX_REGEX =
  /^(?:rua|r\.|av\.?|avenida|servidao|servidão|travessa|estrada|rodovia|alameda|praca|praça|loteamento)\s+/i;
const STATE_OR_COUNTRY_KEYS = new Set([
  "sc",
  "santa catarina",
  "pr",
  "parana",
  "rs",
  "rio grande do sul",
  "sp",
  "sao paulo",
  "brasil",
  "brazil",
]);

export function normalizeCityName(rawCity: string): string {
  return rawCity
    .trim()
    .replace(
      /\s*(?:,|\s*[-–—/])\s*(?:SC|Santa Catarina|PR|RS|SP|Brasil)\b.*$/i,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function isKnownCitySegment(
  segmentKey: string,
  cityKeys: Set<string>,
): boolean {
  if (!segmentKey) return false;
  if (STATE_OR_COUNTRY_KEYS.has(segmentKey)) return true;
  for (const cityKey of cityKeys) {
    if (!cityKey) continue;
    if (
      segmentKey === cityKey ||
      segmentKey.startsWith(`${cityKey} `) ||
      segmentKey.startsWith(`${cityKey}-`) ||
      segmentKey.startsWith(`${cityKey}/`)
    ) {
      return true;
    }
  }
  return false;
}

const EDGE_PUNCT_REGEX = /^[.,;:!?/\\\-–—\s]+|[.,;:!?/\\\-–—\s]+$/g;
const NEIGHBORHOOD_PREFIX_REGEX =
  /^(?:(?:no|na)\s+)?(?:bairro\s*:?\s*)?(?:(?:no|na)\s+)?/i;
const TRAILING_AD_NOISE_PATTERNS: RegExp[] = [
  /\s*[-–—]\s*\d.*$/u,
  /\s+(?:dispon[ií]vel\s+)?(?:para|pra|p\/)\s+(?:loca[cç]?[aã]?o?|alugar|aluguel|venda|vender|solteiro|estudante)(?!\p{L}).*$/iu,
  /\s+(?:por|a\s+partir\s+de|s[oó])\s*R?(?:\$|\b).*$/i,
  /\s+R\$\s*[\d.,]+.*$/i,
  /\s+(?:compost[oa]|contendo|com|sendo|possui|tendo)\s+(?:por\s+)?(?:\d+|um|uma|dois|duas|tr[eê]s|quatro)\b.*$/i,
  /\s+(?:mobiliad[oa]|semimobiliad[oa]|semi[\s-]mobiliad[oa])\b.*$/i,
  /\s+(?:ref\.?|c[oó]d\.?)\s*[:#.-]?\s*\d+.*$/i,
];
const PAREN_NOISE_REGEX = /\b(?:cod|ref|suite|quarto|dorm|vaga)\b/;

function stripNeighborhoodNoise(segment: string): string {
  let cleaned = segment
    .trim()
    .replace(EDGE_PUNCT_REGEX, "")
    .replace(NEIGHBORHOOD_PREFIX_REGEX, "")
    .trim();

  for (const pattern of TRAILING_AD_NOISE_PATTERNS) {
    cleaned = cleaned.replace(pattern, "").trim();
  }

  return cleaned.replace(EDGE_PUNCT_REGEX, "").trim();
}

function isParentheticalNoise(
  insideKey: string,
  cityKeys: Set<string>,
): boolean {
  if (!insideKey || insideKey.length <= 2) return true;
  if (/\d/.test(insideKey)) return true;
  if (PAREN_NOISE_REGEX.test(insideKey)) return true;
  return isKnownCitySegment(insideKey, cityKeys);
}

/**
 * Cleans ad-title noise and resolves parenthetical district qualifiers
 * (e.g. "Dona Francisca (Pirabeiraba)" -> "Pirabeiraba",
 * while preserving "João Pessoa (Jaraguá do Sul)" -> "João Pessoa").
 */
function cleanNeighborhoodSegment(
  segment: string,
  cityKeys: Set<string>,
): string {
  let cleaned = stripNeighborhoodNoise(segment);
  if (!cleaned) return "";

  const closedParenMatch = cleaned.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (closedParenMatch) {
    const outside = stripNeighborhoodNoise(closedParenMatch[1] ?? "");
    const inside = stripNeighborhoodNoise(closedParenMatch[2] ?? "");
    const insideKey = normalizeLocationKey(inside);

    cleaned = isParentheticalNoise(insideKey, cityKeys)
      ? outside
      : stripNeighborhoodNoise(inside);
  } else {
    const unclosedParenMatch = cleaned.match(/^(.+?)\s*\(([^)]*)$/);
    if (unclosedParenMatch) {
      const outside = stripNeighborhoodNoise(unclosedParenMatch[1] ?? "");
      const inside = stripNeighborhoodNoise(unclosedParenMatch[2] ?? "");
      const outsideKey = normalizeLocationKey(outside);
      const insideKey = normalizeLocationKey(inside);

      if (
        (insideKey && outsideKey.startsWith(insideKey)) ||
        isParentheticalNoise(insideKey, cityKeys)
      ) {
        cleaned = outside;
      }
    }
  }

  if (!cleaned.includes("(")) {
    cleaned = cleaned.replace(/[()]/g, "");
  }

  return cleaned.replace(EDGE_PUNCT_REGEX, "").trim();
}

export function normalizeNeighborhood(
  rawNeighborhood: string,
  city = "",
  knownCities?: Iterable<string>,
): string {
  const cleanedRaw = rawNeighborhood
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\s*[-–—]\s*\d.*$/u, "")
    .trim();
  if (!cleanedRaw) return "";

  const cityKeys = new Set<string>();
  const normalizedCityKey = normalizeLocationKey(normalizeCityName(city));
  if (normalizedCityKey) cityKeys.add(normalizedCityKey);
  if (knownCities) {
    for (const knownCity of knownCities) {
      const k = normalizeLocationKey(normalizeCityName(knownCity));
      if (k) cityKeys.add(k);
    }
  }

  const rawParts = cleanedRaw
    .split(/\s*,\s*/)
    .flatMap((part) => {
      const subParts = part.split(/\s*(?:\s[-–—]\s|\/)\s*/);
      return subParts.length > 1 ? subParts : [part];
    })
    .map((part) => cleanNeighborhoodSegment(part, cityKeys))
    .filter(Boolean);

  const nonCityParts = rawParts.filter((part) => {
    if (/^\d+[a-z]?$/i.test(part)) return false;
    const key = normalizeLocationKey(part);
    if (!key) return false;
    return !isKnownCitySegment(key, cityKeys);
  });

  if (nonCityParts.length === 0) return "";

  const nonStreetParts = nonCityParts.filter(
    (part) => !STREET_PREFIX_REGEX.test(part),
  );
  const chosen = nonStreetParts[0] ?? nonCityParts[0] ?? "";
  return cleanNeighborhoodSegment(chosen, cityKeys);
}

const PROPERTY_TYPE_RULES: Array<[RegExp, string]> = [
  [/\bcobertura\b/i, "Cobertura"],
  [/\b(kitnet|kitinete|kitinet|quitinete|mini\s*kitinete)\b/i, "Kitnet"],
  [/\b(studio|estudio|flat)\b/i, "Studio"],
  [/\bloft\b/i, "Loft"],
  [/\b(geminado|germinado)\b/i, "Geminado"],
  [/\b(sobrado|duplex|triplex)\b/i, "Sobrado"],
  [/\b(apartamento|apartamentos|apto|ap)\b/i, "Apartamento"],
  [/\b(casa|casas|residencia|residencial)\b/i, "Casa"],
  [/\b(quarto|quartos|suite|suites|republica)\b/i, "Quarto"],
  [/\b(galpao|barracao|deposito|armazem|pavilhao)\b/i, "Galpão"],
  [
    /\b(sala\s+comercial|salas\s+comerciais|loja|salao|ponto\s+comercial|conjunto\s+comercial|predio\s+comercial|imovel\s+comercial|escritorio|consultorio|clinica|sala)\b/i,
    "Comercial",
  ],
  [/\b(terreno|lote|area\s+industrial|area\s+comercial)\b/i, "Terreno"],
  [/\b(chacara|sitio|fazenda|rancho)\b/i, "Chácara / Sítio"],
  [/\b(pousada|chale)\b/i, "Pousada / Chalé"],
];

export function normalizePropertyType(
  rawType: string,
  title = "",
  ref = "",
): string {
  const candidates = [rawType, title, ref.replace(/[-/_]+/g, " ")];
  for (const candidate of candidates) {
    const normalized = normalizeLocationKey(candidate);
    if (!normalized) continue;
    for (const [pattern, label] of PROPERTY_TYPE_RULES) {
      if (pattern.test(normalized)) {
        return label;
      }
    }
  }
  return "";
}

const PT_LOWER_WORDS = new Set([
  "da",
  "de",
  "do",
  "das",
  "dos",
  "e",
  "em",
  "no",
  "na",
]);

function isWellCapitalized(text: string): boolean {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return false;
  return words.every((word, idx) => {
    const lower = word.toLowerCase();
    if (idx > 0 && PT_LOWER_WORDS.has(lower)) {
      return word === lower;
    }
    return (
      word[0] === word[0]?.toUpperCase() &&
      word.slice(1) === word.slice(1).toLowerCase()
    );
  });
}

function toTitleCasePt(text: string): string {
  return text
    .trim()
    .split(/\s+/)
    .map((word, idx) => {
      const lower = word.toLowerCase();
      if (idx > 0 && PT_LOWER_WORDS.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

export interface CanonicalGroupOption {
  value: string;
  label: string;
  count: number;
}

export function buildCanonicalGroups(values: string[]): CanonicalGroupOption[] {
  const groups = new Map<
    string,
    { total: number; variants: Map<string, number> }
  >();

  for (const raw of values) {
    const cleaned = raw.trim().replace(/\s+/g, " ");
    if (!cleaned) continue;
    const key = normalizeLocationKey(cleaned);
    if (!key) continue;

    let group = groups.get(key);
    if (!group) {
      group = { total: 0, variants: new Map() };
      groups.set(key, group);
    }
    group.total++;
    group.variants.set(cleaned, (group.variants.get(cleaned) ?? 0) + 1);
  }

  const result: CanonicalGroupOption[] = [];

  for (const [key, group] of groups.entries()) {
    let bestLabel = "";
    let bestScore = -1;

    for (const [variant, count] of group.variants.entries()) {
      const hasAccents = /\p{Diacritic}/u.test(variant.normalize("NFD"));
      const score =
        (hasAccents ? 1000 : 0) +
        (isWellCapitalized(variant) ? 500 : 0) +
        count;
      if (score > bestScore) {
        bestScore = score;
        bestLabel = variant;
      }
    }

    if (
      bestLabel === bestLabel.toLowerCase() ||
      bestLabel === bestLabel.toUpperCase()
    ) {
      bestLabel = toTitleCasePt(bestLabel);
    }

    result.push({ value: key, label: bestLabel, count: group.total });
  }

  return result.sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}

function normalizeSearchText(value: string): string {
  return normalizeLocationKey(value);
}

function parseOptionalFilterNum(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function filterAndSortImoveis(
  items: ImovelItem[],
  filters: ImovelFilters,
  nowMs = Date.now(),
): ImovelItem[] {
  const searchTerm = normalizeSearchText(filters.search.trim());
  const selectedCityKey = filters.city
    ? normalizeLocationKey(filters.city)
    : "";
  const selectedNeighborhoodKeys = new Set(
    filters.neighborhoods.map(normalizeLocationKey).filter(Boolean),
  );
  const selectedTypeKey = filters.propertyType
    ? normalizeLocationKey(filters.propertyType)
    : "";
  const minPrice = parseOptionalFilterNum(filters.minPrice);
  const maxPrice = parseOptionalFilterNum(filters.maxPrice);
  const minArea = parseOptionalFilterNum(filters.minArea);
  const maxArea = parseOptionalFilterNum(filters.maxArea);

  const filtered = items.filter((item) => {
    if (filters.visibilityMode === "active" && item.hidden) return false;
    if (filters.visibilityMode === "favorites" && (!item.favorite || item.hidden)) {
      return false;
    }
    if (filters.visibilityMode === "hidden" && !item.hidden) return false;

    if (filters.portal && item.portalName !== filters.portal) return false;
    if (
      selectedCityKey &&
      normalizeLocationKey(item.city) !== selectedCityKey
    ) {
      return false;
    }
    if (
      selectedNeighborhoodKeys.size > 0 &&
      !selectedNeighborhoodKeys.has(normalizeLocationKey(item.neighborhood))
    ) {
      return false;
    }
    if (
      selectedTypeKey &&
      normalizeLocationKey(item.propertyType) !== selectedTypeKey
    ) {
      return false;
    }

    if (filters.onlyWithImages && item.images.length === 0) return false;
    if (filters.onlyRecentlyUpdated) {
      const days = getDaysSince(item.updated || item.created, nowMs);
      if (days === null || days >= RECENTLY_UPDATED_DAYS) return false;
    }
    if (filters.minBedrooms > 0 && item.bedroom < filters.minBedrooms) return false;
    if (filters.minBathrooms > 0 && item.bathroom < filters.minBathrooms) return false;
    if (filters.minGarage > 0 && item.garage < filters.minGarage) return false;

    const targetPrice =
      filters.priceMode === "total" ? item.totalPrice : item.priceAluguel;
    if (minPrice !== null && targetPrice < minPrice) return false;
    if (maxPrice !== null && (targetPrice <= 0 || targetPrice > maxPrice)) {
      return false;
    }

    if (minArea !== null && item.areaM2 < minArea) return false;
    if (maxArea !== null && (item.areaM2 <= 0 || item.areaM2 > maxArea)) {
      return false;
    }

    if (searchTerm) {
      const haystack = normalizeSearchText(
        [
          item.title,
          item.neighborhood,
          item.city,
          item.address,
          item.propertyType,
          item.portalName,
          item.ref,
        ].join(" "),
      );
      if (!haystack.includes(searchTerm)) return false;
    }

    return true;
  });

  return [...filtered].sort((a, b) => {
    switch (filters.sortBy) {
      case "price_asc": {
        const pa = filters.priceMode === "total" ? a.totalPrice : a.priceAluguel;
        const pb = filters.priceMode === "total" ? b.totalPrice : b.priceAluguel;
        if (pa <= 0 && pb <= 0) return 0;
        if (pa <= 0) return 1;
        if (pb <= 0) return -1;
        return pa - pb;
      }
      case "price_desc": {
        const pa = filters.priceMode === "total" ? a.totalPrice : a.priceAluguel;
        const pb = filters.priceMode === "total" ? b.totalPrice : b.priceAluguel;
        return pb - pa;
      }
      case "area_desc":
        return b.areaM2 - a.areaM2;
      case "price_per_m2_asc": {
        if (a.pricePerM2 === null && b.pricePerM2 === null) return 0;
        if (a.pricePerM2 === null) return 1;
        if (b.pricePerM2 === null) return -1;
        return a.pricePerM2 - b.pricePerM2;
      }
      case "newest":
      default: {
        const ta = Date.parse(a.updated || a.created || "") || 0;
        const tb = Date.parse(b.updated || b.created || "") || 0;
        return tb - ta;
      }
    }
  });
}

export function isInvalidOlxRef(ref: string): boolean {
  const lower = ref.toLowerCase();
  return (
    lower.includes("olx.com.br") &&
    (lower.includes("/vi/") ||
      lower.includes("rec=") ||
      !/\/imoveis(\/|$)/i.test(ref))
  );
}

export function normalizeListingRecord(record: Record<string, unknown>): ListingItem {
  return {
    id: String(record.id ?? ""),
    name: String(record.name ?? ""),
    active: Boolean(record.active),
    lastPage: typeof record.last_page === "number" ? record.last_page : 1,
    url: typeof record.url === "string" ? record.url : "",
    maxPages: typeof record.max_pages === "number" ? record.max_pages : 50,
    delayMs: typeof record.delay_ms === "number" ? record.delay_ms : 2000,
    created: toTrimmedString(record.created),
    updated: toTrimmedString(record.updated),
  };
}

function normalizeCrawlerRunRecord(record: Record<string, unknown>): CrawlerRunItem {
  return {
    id: String(record.id ?? ""),
    siteName: String(record.site_name ?? ""),
    startedAt: toTrimmedString(record.started_at, record.created),
    finishedAt: toTrimmedString(record.finished_at),
    status: String(record.status ?? "running"),
    pagesCrawled: typeof record.pages_crawled === "number" ? record.pages_crawled : 0,
    listingsScraped:
      typeof record.listings_scraped === "number" ? record.listings_scraped : 0,
    errors: typeof record.errors === "number" ? record.errors : 0,
    errorMsg: typeof record.error_msg === "string" ? record.error_msg : "",
  };
}

function normalizeCrawlerLogRecord(record: Record<string, unknown>): CrawlerLogItem {
  const ctx = record.context;
  const contextStr =
    ctx == null
      ? ""
      : typeof ctx === "string"
        ? ctx
        : JSON.stringify(ctx);

  return {
    id: String(record.id ?? ""),
    level: String(record.level ?? "info"),
    message: String(record.message ?? ""),
    context: contextStr,
    createdAt: toTrimmedString(record.created_at, record.created),
  };
}

export interface DashboardSnapshot {
  listings: ListingItem[];
  imoveis: ImovelItem[];
  runs: CrawlerRunItem[];
  logs: CrawlerLogItem[];
  runsAvailable: boolean;
  logsAvailable: boolean;
}

async function fetchFullListSafe(
  pb: PocketBase,
  collection: string,
  sortField?: string,
): Promise<Record<string, unknown>[]> {
  try {
    return await pb
      .collection(collection)
      .getFullList<Record<string, unknown>>(
        sortField ? { sort: sortField } : undefined,
      );
  } catch (err) {
    if (sortField && getHttpStatus(err) === 400) {
      return await pb.collection(collection).getFullList<Record<string, unknown>>();
    }
    throw err;
  }
}

export async function fetchDashboardSnapshot(
  pb: PocketBase,
): Promise<DashboardSnapshot> {
  const [rawListings, rawImoveis] = await Promise.all([
    fetchFullListSafe(pb, "listings", "name"),
    fetchFullListSafe(pb, "imoveis_temp", "-updated"),
  ]);

  const listings = rawListings.map(normalizeListingRecord);
  const listingsById = new Map(listings.map((item) => [item.id, item]));
  const localPrefs = loadLocalImovelPrefs();
  const knownCities = new Set<string>();
  for (const rec of rawImoveis) {
    const rawFeatures = parseJsonObject(rec.features);
    const city = normalizeCityName(toTrimmedString(rec.city, rawFeatures.city));
    if (city) knownCities.add(city);
  }
  const imoveis = rawImoveis.map((rec) =>
    normalizeImovelRecord(rec, pb.baseURL, listingsById, localPrefs, knownCities),
  );

  let runs: CrawlerRunItem[] = [];
  let runsAvailable = true;
  try {
    const res = await pb
      .collection("crawler_runs")
      .getList<Record<string, unknown>>(1, 100, { sort: "-started_at" });
    runs = res.items.map(normalizeCrawlerRunRecord);
  } catch (err) {
    const status = getHttpStatus(err);
    if (status === 404 || status === 400 || status === 403) {
      runsAvailable = false;
    } else {
      throw err;
    }
  }

  let logs: CrawlerLogItem[] = [];
  let logsAvailable = true;
  try {
    const res = await pb
      .collection("crawler_logs")
      .getList<Record<string, unknown>>(1, 200, { sort: "-created_at" });
    logs = res.items.map(normalizeCrawlerLogRecord);
  } catch (err) {
    const status = getHttpStatus(err);
    if (status === 404 || status === 400 || status === 403) {
      logsAvailable = false;
    } else {
      throw err;
    }
  }

  return {
    listings,
    imoveis,
    runs,
    logs,
    runsAvailable,
    logsAvailable,
  };
}

export async function toggleImovelFlag(
  pb: PocketBase,
  item: ImovelItem,
  flag: "favorite" | "hidden",
  nextValue: boolean,
): Promise<{ persistedRemote: boolean }> {
  const prefs = loadLocalImovelPrefs();
  prefs[item.id] = {
    ...prefs[item.id],
    [flag]: nextValue,
  };
  saveLocalImovelPrefs(prefs);

  try {
    const nextFeatures = {
      ...item.rawFeatures,
      [flag === "favorite" ? "_favorite" : "_hidden"]: nextValue,
    };
    await pb.collection("imoveis_temp").update(item.id, {
      features: nextFeatures,
    });
    return { persistedRemote: true };
  } catch {
    return { persistedRemote: false };
  }
}

export async function deleteImovelRecords(
  pb: PocketBase,
  ids: string[],
): Promise<number> {
  if (ids.length === 0) return 0;

  for (let i = 0; i < ids.length; i += BATCH_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + BATCH_CHUNK_SIZE);
    try {
      const batch = pb.createBatch();
      for (const id of chunk) {
        batch.collection("imoveis_temp").delete(id);
      }
      await batch.send();
    } catch {
      for (const id of chunk) {
        await pb.collection("imoveis_temp").delete(id);
      }
    }
  }

  return ids.length;
}

export async function updateListingRecord(
  pb: PocketBase,
  id: string,
  patch: {
    active?: boolean;
    lastPage?: number;
    url?: string;
    maxPages?: number;
    delayMs?: number;
  },
): Promise<ListingItem> {
  const payload: Record<string, unknown> = {};
  if (patch.active !== undefined) payload.active = patch.active;
  if (patch.lastPage !== undefined) payload.last_page = patch.lastPage;
  if (patch.url !== undefined) payload.url = patch.url;
  if (patch.maxPages !== undefined) payload.max_pages = patch.maxPages;
  if (patch.delayMs !== undefined) payload.delay_ms = patch.delayMs;

  const updated = await pb
    .collection("listings")
    .update<Record<string, unknown>>(id, payload);
  return normalizeListingRecord(updated);
}
