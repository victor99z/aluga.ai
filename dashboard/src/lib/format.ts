export function formatCurrencyBRL(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return "Sob consulta";
  }
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

export function formatCurrencyBRLDecimal(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return "—";
  }
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export const RECENTLY_UPDATED_DAYS = 5;
const MS_PER_DAY = 86_400_000;

export function parseTimestampMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const normalized = iso
    .trim()
    .replace(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})/, "$1T$2");
  const parsed = Date.parse(normalized);
  return Number.isNaN(parsed) ? null : parsed;
}

export function getDaysSince(
  iso: string | null | undefined,
  nowMs = Date.now(),
): number | null {
  const parsed = parseTimestampMs(iso);
  if (parsed === null) return null;
  return Math.max(0, Math.floor((nowMs - parsed) / MS_PER_DAY));
}

export interface RelativeSeenInfo {
  label: string;
  days: number | null;
  isStale: boolean;
}

export function formatRelativeSeen(
  iso: string | null | undefined,
  nowMs = Date.now(),
): RelativeSeenInfo {
  const days = getDaysSince(iso, nowMs);
  if (days === null) {
    return { label: "Sem data", days: null, isStale: false };
  }
  if (days === 0) {
    return { label: "Visto hoje", days: 0, isStale: false };
  }
  if (days === 1) {
    return { label: "Visto ontem", days: 1, isStale: false };
  }
  return {
    label: `Visto há ${days} dias`,
    days,
    isStale: days >= RECENTLY_UPDATED_DAYS,
  };
}

export function formatDateTimeBR(iso: string | null | undefined): string {
  if (!iso) return "—";
  const parsed = parseTimestampMs(iso);
  if (parsed === null) return iso;
  return new Date(parsed).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function computeMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  }
  return sorted[mid] ?? 0;
}

const PORTAL_LABELS: Record<string, string> = {
  "olx-imoveis": "OLX",
  "chaves-na-mao": "Chaves na Mão",
  "zap-imoveis": "Zap Imóveis",
  "imoveis-sc": "Imóveis SC",
  "vivareal-imoveis": "VivaReal",
  outro: "Outro",
};

export function formatPortalLabel(name: string): string {
  return PORTAL_LABELS[name] ?? (name || "Outro");
}
