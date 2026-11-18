import { useEffect, useId, useMemo, useState, type CSSProperties } from "react";
import {
  AlertTriangle,
  Bath,
  BedDouble,
  Building2,
  Car,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  Eye,
  EyeOff,
  Heart,
  ImageOff,
  LayoutGrid,
  MapPin,
  Maximize2,
  RotateCcw,
  Search,
  Sparkles,
  Table2,
  Trash2,
  X,
} from "lucide-react";
import {
  computeMedian,
  formatCurrencyBRL,
  formatCurrencyBRLDecimal,
  formatPortalLabel,
  formatRelativeSeen,
  RECENTLY_UPDATED_DAYS,
} from "../lib/format";
import {
  buildCanonicalGroups,
  DEFAULT_FILTERS,
  filterAndSortImoveis,
  isInvalidOlxRef,
  normalizeLocationKey,
  type ImovelFilters,
  type ImovelItem,
  type SortMode,
  type VisibilityMode,
} from "../lib/pocketbase";
import { KnollMultiSelect } from "./KnollMultiSelect";
import { KnollSelect } from "./KnollSelect";

interface CatalogSectionProps {
  items: ImovelItem[];
  onSelect: (item: ImovelItem) => void;
  onToggleFavorite: (item: ImovelItem) => void;
  onToggleHidden: (item: ImovelItem) => void;
  onDelete: (item: ImovelItem) => Promise<void>;
  onCleanInvalidOlx: (ids: string[]) => Promise<void>;
}

const PAGE_SIZE = 24;

function ImovelCard({
  item,
  onSelect,
  onToggleFavorite,
  onToggleHidden,
  onDelete,
}: {
  item: ImovelItem;
  onSelect: (item: ImovelItem) => void;
  onToggleFavorite: (item: ImovelItem) => void;
  onToggleHidden: (item: ImovelItem) => void;
  onDelete: (item: ImovelItem) => Promise<void>;
}) {
  const [imgIdx, setImgIdx] = useState(0);
  const [failedUrls, setFailedUrls] = useState<Record<string, boolean>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);

  const availableImages = item.images.filter(
    (img) => !failedUrls[img.thumbUrl],
  );
  const safeIdx =
    availableImages.length > 0
      ? Math.min(imgIdx, availableImages.length - 1)
      : 0;
  const currentImg = availableImages[safeIdx];
  const seen = formatRelativeSeen(item.updated || item.created);

  return (
    <article className="knoll-card knoll-card-interactive group flex flex-col overflow-hidden">
      <div className="p-2.5 pb-0">
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg border border-[#00000020] bg-[#E6E6FA]/50">
          {currentImg ? (
            <button
              type="button"
              onClick={() => onSelect(item)}
              className="block h-full w-full text-left"
              aria-label={`Abrir galeria de ${item.title}`}
            >
              <img
                src={currentImg.thumbUrl}
                alt=""
                referrerPolicy="no-referrer"
                loading="lazy"
                onError={() =>
                  setFailedUrls((prev) => ({
                    ...prev,
                    [currentImg.thumbUrl]: true,
                  }))
                }
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
              />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onSelect(item)}
              aria-label={`Abrir detalhes de ${item.title}`}
              className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-[#5C5559]"
            >
              <ImageOff className="h-7 w-7" aria-hidden="true" />
              <span className="text-xs">Sem fotos disponíveis</span>
            </button>
          )}

          <div className="pointer-events-none absolute inset-x-2 top-2 flex items-start justify-between gap-2">
            <div className="flex flex-wrap gap-1">
              <span className="rounded-md border border-[#00000020] bg-[#CBE4F0]/95 px-2 py-0.5 text-xs font-bold text-[#2D2D2D] shadow-2xs">
                {formatPortalLabel(item.portalName)}
              </span>
              {item.propertyType && (
                <span className="rounded-md border border-[#00000020] bg-[#FFFDFD]/95 px-2 py-0.5 text-xs text-[#2D2D2D] shadow-2xs">
                  {item.propertyType}
                </span>
              )}
            </div>

            <div className="pointer-events-auto flex items-center gap-1">
              <button
                type="button"
                onClick={() => onToggleFavorite(item)}
                aria-label={
                  item.favorite
                    ? "Remover dos favoritos"
                    : "Adicionar aos favoritos"
                }
                aria-pressed={item.favorite}
                className={`rounded-lg border p-1.5 shadow-2xs transition ${
                  item.favorite
                    ? "border-[#9F2D3B]/30 bg-[#F6D0D6] text-[#9F2D3B]"
                    : "border-[#00000020] bg-[#FFFDFD]/90 text-[#2D2D2D] hover:bg-[#F6D0D6]"
                }`}
              >
                <Heart
                  className={`h-3.5 w-3.5 ${item.favorite ? "fill-current" : ""}`}
                  aria-hidden="true"
                />
              </button>
              <button
                type="button"
                onClick={() => onToggleHidden(item)}
                aria-label={item.hidden ? "Reexibir imóvel" : "Ocultar imóvel"}
                aria-pressed={item.hidden}
                className={`rounded-lg border border-[#00000020] p-1.5 shadow-2xs transition ${
                  item.hidden
                    ? "bg-[#E6E6FA] text-[#2D2D2D]"
                    : "bg-[#FFFDFD]/90 text-[#5C5559] hover:bg-[#E6E6FA] hover:text-[#2D2D2D]"
                }`}
              >
                {item.hidden ? (
                  <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          {availableImages.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setImgIdx((prev) =>
                    prev === 0 ? availableImages.length - 1 : prev - 1,
                  );
                }}
                aria-label="Foto anterior"
                className="absolute top-1/2 left-2 -translate-y-1/2 rounded-full border border-[#00000020] bg-[#FFFDFD]/90 p-1.5 text-[#2D2D2D] opacity-0 shadow-sm transition group-hover:opacity-100 focus:opacity-100"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setImgIdx((prev) =>
                    prev === availableImages.length - 1 ? 0 : prev + 1,
                  );
                }}
                aria-label="Próxima foto"
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full border border-[#00000020] bg-[#FFFDFD]/90 p-1.5 text-[#2D2D2D] opacity-0 shadow-sm transition group-hover:opacity-100 focus:opacity-100"
              >
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
              <span className="pointer-events-none absolute right-2 bottom-2 rounded-md border border-[#00000020] bg-[#FFFDFD]/90 px-2 py-0.5 font-mono text-xs text-[#2D2D2D]">
                {safeIdx + 1}/{availableImages.length}
              </span>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xl font-bold text-[#2D2D2D] tabular-nums">
              {formatCurrencyBRL(item.totalPrice)}
              <span className="ml-1 text-xs font-normal text-[#5C5559]">
                /mês
              </span>
            </p>
          </div>
          {item.pricePerM2 && (
            <span className="shrink-0 rounded-lg border border-[#00000020] bg-[#D0F0C0] px-2 py-1 font-mono text-xs text-[#2D2D2D]">
              {formatCurrencyBRLDecimal(item.pricePerM2)}/m²
            </span>
          )}
        </div>

        {(item.priceCondominio > 0 || item.priceIptu > 0) && (
          <dl className="grid grid-cols-3 divide-x divide-[#00000020] rounded-lg border border-[#00000020] bg-[#E6E6FA]/30 text-xs">
            <div className="px-2 py-1.5">
              <dt className="text-[11px] text-[#5C5559]">Aluguel</dt>
              <dd className="font-mono font-medium text-[#2D2D2D]">
                {formatCurrencyBRL(item.priceAluguel)}
              </dd>
            </div>
            <div className="px-2 py-1.5">
              <dt className="text-[11px] text-[#5C5559]">Condomínio</dt>
              <dd className="font-mono font-medium text-[#2D2D2D]">
                {item.priceCondominio > 0
                  ? formatCurrencyBRL(item.priceCondominio)
                  : "—"}
              </dd>
            </div>
            <div className="px-2 py-1.5">
              <dt className="text-[11px] text-[#5C5559]">IPTU</dt>
              <dd className="font-mono font-medium text-[#2D2D2D]">
                {item.priceIptu > 0 ? formatCurrencyBRL(item.priceIptu) : "—"}
              </dd>
            </div>
          </dl>
        )}

        <h3 className="line-clamp-2 text-sm font-bold leading-snug text-[#2D2D2D]">
          {item.title}
        </h3>

        <div className="mt-auto flex flex-col gap-2.5 pt-1">
          <p className="flex items-center gap-1.5 text-xs text-[#5C5559]">
            <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">
              {item.address ||
                [item.neighborhood, item.city].filter(Boolean).join(", ") ||
                "Localização não informada"}
            </span>
          </p>

          <div className="grid grid-cols-4 divide-x divide-[#00000020] rounded-lg border border-[#00000020] text-center font-mono text-xs text-[#2D2D2D]">
            <div className="flex items-center justify-center gap-1 py-1.5" title="Área útil">
              <Maximize2 className="h-3 w-3 text-[#5C5559]" aria-hidden="true" />
              <span>{item.areaM2 > 0 ? `${item.areaM2}m²` : "—"}</span>
            </div>
            <div className="flex items-center justify-center gap-1 py-1.5" title="Quartos">
              <BedDouble className="h-3 w-3 text-[#5C5559]" aria-hidden="true" />
              <span>{item.bedroom > 0 ? item.bedroom : "—"}</span>
            </div>
            <div className="flex items-center justify-center gap-1 py-1.5" title="Banheiros">
              <Bath className="h-3 w-3 text-[#5C5559]" aria-hidden="true" />
              <span>{item.bathroom > 0 ? item.bathroom : "—"}</span>
            </div>
            <div className="flex items-center justify-center gap-1 py-1.5" title="Vagas">
              <Car className="h-3 w-3 text-[#5C5559]" aria-hidden="true" />
              <span>{item.garage > 0 ? item.garage : "—"}</span>
            </div>
          </div>

          {seen.isStale ? (
            <div
              className="flex items-center gap-1.5 rounded-lg border border-[#9F2D3B]/25 bg-[#FADCE0]/70 px-2.5 py-1 text-xs font-medium text-[#9F2D3B]"
              title="Sem atualização recente pelo robô — o anúncio pode não estar mais disponível"
            >
              <AlertTriangle
                className="h-3.5 w-3.5 shrink-0"
                aria-hidden="true"
              />
              <span className="truncate">{seen.label} (possível inativo)</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 border border-transparent py-1 text-xs text-[#5C5559]">
              <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{seen.label}</span>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 pt-0.5">
            <button
              type="button"
              onClick={() => onSelect(item)}
              className="knoll-btn-primary flex-1 !py-2 text-xs"
            >
              Ver detalhes
            </button>

            {item.ref && (
              <a
                href={item.ref}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Abrir anúncio original em nova aba"
                className="knoll-btn-secondary !p-2 text-[#2D2D2D]"
              >
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </a>
            )}

            {confirmDelete ? (
              <button
                type="button"
                onClick={() => void onDelete(item)}
                className="rounded-xl border border-[#9F2D3B]/30 bg-[#FADCE0] px-2.5 py-2 text-xs font-bold text-[#9F2D3B] transition hover:bg-[#F5C5CC]"
              >
                Excluir
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                aria-label="Excluir anúncio"
                className="knoll-btn-secondary !p-2 text-[#5C5559] hover:!bg-[#FADCE0] hover:text-[#9F2D3B]"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

export function CatalogSection({
  items,
  onSelect,
  onToggleFavorite,
  onToggleHidden,
  onDelete,
  onCleanInvalidOlx,
}: CatalogSectionProps) {
  const [filters, setFilters] = useState<ImovelFilters>(DEFAULT_FILTERS);
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [page, setPage] = useState(1);
  const [cleaningOlx, setCleaningOlx] = useState(false);
  const tableCaptionId = useId();

  const invalidOlxIds = useMemo(
    () => items.filter((i) => isInvalidOlxRef(i.ref)).map((i) => i.id),
    [items],
  );

  const filterOptions = useMemo(() => {
    const portals = new Set<string>();
    const rawCities: string[] = [];
    const rawNeighborhoods: string[] = [];
    const rawPropertyTypes: string[] = [];
    const selectedCityKey = filters.city
      ? normalizeLocationKey(filters.city)
      : "";

    for (const item of items) {
      if (item.portalName) portals.add(item.portalName);
      if (item.city) rawCities.push(item.city);
      if (
        item.neighborhood &&
        (!selectedCityKey ||
          normalizeLocationKey(item.city) === selectedCityKey)
      ) {
        rawNeighborhoods.push(item.neighborhood);
      }
      if (item.propertyType) rawPropertyTypes.push(item.propertyType);
    }

    const neighborhoods = buildCanonicalGroups(rawNeighborhoods);
    const neighborhoodLabelMap = new Map(
      neighborhoods.map((n) => [n.value, n.label]),
    );

    return {
      portals: [...portals].sort(),
      cities: buildCanonicalGroups(rawCities),
      neighborhoods,
      neighborhoodLabelMap,
      propertyTypes: buildCanonicalGroups(rawPropertyTypes),
    };
  }, [items, filters.city]);

  const filteredItems = useMemo(
    () => filterAndSortImoveis(items, filters),
    [items, filters],
  );

  useEffect(() => {
    setPage(1);
  }, [filters]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedItems = filteredItems.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  const stats = useMemo(() => {
    const rents = filteredItems
      .map((i) => i.priceAluguel)
      .filter((v) => v > 0);
    const totals = filteredItems
      .map((i) => i.totalPrice)
      .filter((v) => v > 0);
    const perM2 = filteredItems
      .map((i) => i.pricePerM2)
      .filter((v): v is number => v !== null && v > 0);

    const avgTotal =
      totals.length > 0
        ? totals.reduce((sum, v) => sum + v, 0) / totals.length
        : 0;
    const avgPerM2 =
      perM2.length > 0
        ? perM2.reduce((sum, v) => sum + v, 0) / perM2.length
        : 0;
    const favoritesCount = items.filter((i) => i.favorite && !i.hidden).length;

    return {
      medianRent: computeMedian(rents),
      avgTotal,
      avgPerM2,
      favoritesCount,
    };
  }, [filteredItems, items]);

  async function handleCleanOlx() {
    if (invalidOlxIds.length === 0) return;
    setCleaningOlx(true);
    try {
      await onCleanInvalidOlx(invalidOlxIds);
    } finally {
      setCleaningOlx(false);
    }
  }

  function updateFilter<K extends keyof ImovelFilters>(
    key: K,
    value: ImovelFilters[K],
  ) {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
      ...(key === "city" ? { neighborhoods: [] } : {}),
    }));
  }

  return (
    <div className="space-y-6">
      {invalidOlxIds.length > 0 && (
        <div className="knoll-card flex flex-wrap items-center justify-between gap-3 bg-[#FADCE0] px-4 py-3 text-sm text-[#2D2D2D]">
          <div className="flex items-center gap-2.5">
            <AlertTriangle
              className="h-5 w-5 shrink-0 text-[#9F2D3B]"
              aria-hidden="true"
            />
            <span>
              Encontrados{" "}
              <strong className="font-mono">{invalidOlxIds.length}</strong>{" "}
              anúncios da OLX fora da categoria de imóveis.
            </span>
          </div>
          <button
            type="button"
            disabled={cleaningOlx}
            onClick={handleCleanOlx}
            className="knoll-btn-primary inline-flex items-center gap-1.5 !py-1.5 text-xs disabled:opacity-60"
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            {cleaningOlx ? "Removendo..." : "Remover anúncios inválidos"}
          </button>
        </div>
      )}

      <section aria-label="Resumo e filtros do catálogo" className="knoll-card">
        <div
          aria-label="Resumo dos imóveis"
          className="grid divide-y divide-[#00000020] overflow-hidden rounded-t-[11px] border-b border-[#00000020] sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-5"
        >
          <div className="bg-[#FFFDFD] px-4 py-3.5">
            <span className="text-xs text-[#5C5559]">Imóveis exibidos</span>
            <p className="mt-0.5 font-mono text-xl font-bold text-[#2D2D2D]">
              {filteredItems.length}
              <span className="ml-1 text-xs font-normal text-[#5C5559]">
                / {items.length}
              </span>
            </p>
          </div>
          <div className="bg-[#CBE4F0]/55 px-4 py-3.5">
            <span className="text-xs text-[#2D2D2D]">Mediana do aluguel</span>
            <p className="mt-0.5 text-xl font-bold text-[#2D2D2D] tabular-nums">
              {formatCurrencyBRL(stats.medianRent)}
            </p>
          </div>
          <div className="bg-[#E6E6FA]/60 px-4 py-3.5">
            <span className="text-xs text-[#2D2D2D]">Média total mensal</span>
            <p className="mt-0.5 text-xl font-bold text-[#2D2D2D] tabular-nums">
              {formatCurrencyBRL(stats.avgTotal)}
            </p>
          </div>
          <div className="bg-[#D0F0C0]/60 px-4 py-3.5">
            <span className="text-xs text-[#2D2D2D]">Média por m²</span>
            <p className="mt-0.5 font-mono text-xl font-bold text-[#2D2D2D]">
              {formatCurrencyBRLDecimal(stats.avgPerM2)}
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              updateFilter(
                "visibilityMode",
                filters.visibilityMode === "favorites" ? "active" : "favorites",
              )
            }
            className={`px-4 py-3.5 text-left transition ${
              filters.visibilityMode === "favorites"
                ? "bg-[#F6D0D6]"
                : "bg-[#FFFDFD] hover:bg-[#F6D0D6]/45"
            }`}
          >
            <span className="text-xs text-[#5C5559]">Favoritos salvos</span>
            <p className="mt-0.5 flex items-center gap-2 font-mono text-xl font-bold text-[#9F2D3B]">
              <Heart className="h-4 w-4 fill-current" aria-hidden="true" />
              {stats.favoritesCount}
            </p>
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative min-w-[240px] flex-1">
              <Search
                className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-[#5C5559]"
                aria-hidden="true"
              />
              <input
                type="search"
                aria-label="Buscar por título, bairro, cidade ou URL"
                value={filters.search}
                onChange={(e) => updateFilter("search", e.target.value)}
                placeholder="Buscar por título, bairro, rua, tipo ou link..."
                className="knoll-input w-full py-2.5 pr-3.5 pl-10 text-sm placeholder:text-[#5C5559]/70"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  ["active", "Ativos"],
                  ["favorites", "Favoritos"],
                  ["hidden", "Ocultos"],
                  ["all", "Todos"],
                ] as Array<[VisibilityMode, string]>
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => updateFilter("visibilityMode", mode)}
                  aria-pressed={filters.visibilityMode === mode}
                  className={`rounded-xl border border-[#00000020] px-3.5 py-2 text-sm transition ${
                    filters.visibilityMode === mode
                      ? "bg-[#CBE4F0] font-bold text-[#2D2D2D]"
                      : "bg-[#FFFDFD] font-normal text-[#5C5559] hover:bg-[#E6E6FA]/60 hover:text-[#2D2D2D]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <KnollSelect
              id="filter-portal"
              label="Portal"
              value={filters.portal}
              onChange={(val) => updateFilter("portal", val)}
              options={[
                { value: "", label: "Todos os portais" },
                ...filterOptions.portals.map((p) => ({
                  value: p,
                  label: formatPortalLabel(p),
                })),
              ]}
            />

            <KnollSelect
              id="filter-city"
              label="Cidade"
              value={filters.city}
              onChange={(val) => updateFilter("city", val)}
              options={[
                { value: "", label: "Todas as cidades" },
                ...filterOptions.cities,
              ]}
            />

            <KnollMultiSelect
              id="filter-neighborhood"
              label="Bairros"
              values={filters.neighborhoods}
              onChange={(vals) => updateFilter("neighborhoods", vals)}
              placeholder="Todos os bairros"
              searchPlaceholder="Buscar bairro..."
              options={filterOptions.neighborhoods}
            />

            <KnollSelect
              id="filter-type"
              label="Tipo"
              value={filters.propertyType}
              onChange={(val) => updateFilter("propertyType", val)}
              options={[
                { value: "", label: "Todos os tipos" },
                ...filterOptions.propertyTypes,
              ]}
            />

            <KnollSelect
              id="filter-bedrooms"
              label="Quartos mín."
              value={filters.minBedrooms}
              onChange={(val) => updateFilter("minBedrooms", Number(val))}
              options={[
                { value: 0, label: "Qualquer" },
                { value: 1, label: "1+ quarto" },
                { value: 2, label: "2+ quartos" },
                { value: 3, label: "3+ quartos" },
                { value: 4, label: "4+ quartos" },
              ]}
            />

            <KnollSelect
              id="filter-garage"
              label="Vagas mín."
              value={filters.minGarage}
              onChange={(val) => updateFilter("minGarage", Number(val))}
              options={[
                { value: 0, label: "Qualquer" },
                { value: 1, label: "1+ vaga" },
                { value: 2, label: "2+ vagas" },
              ]}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <KnollSelect
              id="filter-price-mode"
              label="Base de preço"
              value={filters.priceMode}
              onChange={(val) =>
                updateFilter("priceMode", val as ImovelFilters["priceMode"])
              }
              options={[
                { value: "total", label: "Total (Aluguel+Cond+IPTU)" },
                { value: "rent", label: "Apenas aluguel" },
              ]}
            />

            <div>
              <label
                htmlFor="filter-min-price"
                className="mb-1.5 block text-sm font-bold text-[#2D2D2D]"
              >
                Preço mín. (R$)
              </label>
              <input
                id="filter-min-price"
                type="number"
                min={0}
                inputMode="numeric"
                value={filters.minPrice}
                onChange={(e) => updateFilter("minPrice", e.target.value)}
                placeholder="Ex: 1000"
                className="knoll-input w-full px-3.5 py-2 font-mono text-sm placeholder:text-[#5C5559]/60"
              />
            </div>

            <div>
              <label
                htmlFor="filter-max-price"
                className="mb-1.5 block text-sm font-bold text-[#2D2D2D]"
              >
                Preço máx. (R$)
              </label>
              <input
                id="filter-max-price"
                type="number"
                min={0}
                inputMode="numeric"
                value={filters.maxPrice}
                onChange={(e) => updateFilter("maxPrice", e.target.value)}
                placeholder="Ex: 3000"
                className="knoll-input w-full px-3.5 py-2 font-mono text-sm placeholder:text-[#5C5559]/60"
              />
            </div>

            <div>
              <label
                htmlFor="filter-min-area"
                className="mb-1.5 block text-sm font-bold text-[#2D2D2D]"
              >
                Área mín. (m²)
              </label>
              <input
                id="filter-min-area"
                type="number"
                min={0}
                inputMode="numeric"
                value={filters.minArea}
                onChange={(e) => updateFilter("minArea", e.target.value)}
                placeholder="Ex: 45"
                className="knoll-input w-full px-3.5 py-2 font-mono text-sm placeholder:text-[#5C5559]/60"
              />
            </div>

            <div>
              <label
                htmlFor="filter-max-area"
                className="mb-1.5 block text-sm font-bold text-[#2D2D2D]"
              >
                Área máx. (m²)
              </label>
              <input
                id="filter-max-area"
                type="number"
                min={0}
                inputMode="numeric"
                value={filters.maxArea}
                onChange={(e) => updateFilter("maxArea", e.target.value)}
                placeholder="Ex: 120"
                className="knoll-input w-full px-3.5 py-2 font-mono text-sm placeholder:text-[#5C5559]/60"
              />
            </div>

            <KnollSelect
              id="filter-sort"
              label="Ordenar por"
              value={filters.sortBy}
              onChange={(val) => updateFilter("sortBy", val as SortMode)}
              options={[
                { value: "newest", label: "Mais recentes" },
                { value: "price_asc", label: "Menor preço" },
                { value: "price_desc", label: "Maior preço" },
                { value: "area_desc", label: "Maior área" },
                { value: "price_per_m2_asc", label: "Menor R$/m²" },
              ]}
            />
          </div>

          {filters.neighborhoods.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 border-t border-[#00000020] pt-3">
              <span className="mr-1 text-xs font-bold text-[#5C5559]">
                Bairros selecionados:
              </span>
              {filters.neighborhoods.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() =>
                    updateFilter(
                      "neighborhoods",
                      filters.neighborhoods.filter((item) => item !== n),
                    )
                  }
                  className="inline-flex items-center gap-1 rounded-lg border border-[#00000020] bg-[#CBE4F0] px-2.5 py-1 text-xs font-bold text-[#2D2D2D] transition hover:bg-[#B6D7E7]"
                >
                  <span>
                    {filterOptions.neighborhoodLabelMap.get(n) ?? n}
                  </span>
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#00000020] pt-3">
            <div className="flex flex-wrap items-center gap-4">
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-[#2D2D2D]">
                <input
                  type="checkbox"
                  checked={filters.onlyWithImages}
                  onChange={(e) =>
                    updateFilter("onlyWithImages", e.target.checked)
                  }
                  className="h-4 w-4 rounded border-[#00000020] accent-[#2D2D2D]"
                />
                Apenas imóveis com fotos
              </label>

              <label
                className="inline-flex cursor-pointer items-center gap-2 text-sm text-[#2D2D2D]"
                title={`Exibe apenas anúncios atualizados nos últimos ${RECENTLY_UPDATED_DAYS} dias`}
              >
                <input
                  type="checkbox"
                  checked={filters.onlyRecentlyUpdated}
                  onChange={(e) =>
                    updateFilter("onlyRecentlyUpdated", e.target.checked)
                  }
                  className="h-4 w-4 rounded border-[#00000020] accent-[#2D2D2D]"
                />
                Atualizados recentemente
              </label>

              <button
                type="button"
                onClick={() => setFilters(DEFAULT_FILTERS)}
                className="inline-flex items-center gap-1.5 text-sm text-[#5C5559] hover:text-[#2D2D2D]"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                Limpar filtros
              </button>
            </div>

            <div className="flex items-center gap-1 rounded-xl border border-[#00000020] bg-[#E6E6FA]/60 p-1">
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                aria-pressed={viewMode === "grid"}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition ${
                  viewMode === "grid"
                    ? "bg-[#FFFDFD] font-bold text-[#2D2D2D] shadow-2xs"
                    : "text-[#5C5559] hover:text-[#2D2D2D]"
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" />
                Grade
              </button>
              <button
                type="button"
                onClick={() => setViewMode("table")}
                aria-pressed={viewMode === "table"}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition ${
                  viewMode === "table"
                    ? "bg-[#FFFDFD] font-bold text-[#2D2D2D] shadow-2xs"
                    : "text-[#5C5559] hover:text-[#2D2D2D]"
                }`}
              >
                <Table2 className="h-3.5 w-3.5" aria-hidden="true" />
                Tabela
              </button>
            </div>
          </div>
        </div>
      </section>

      {pagedItems.length === 0 ? (
        <div className="knoll-card flex flex-col items-center gap-4 p-12 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[#00000020] bg-[#E6E6FA] text-[#2D2D2D]">
            <Building2 className="h-7 w-7" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <p className="text-base font-bold text-[#2D2D2D]">
              Nenhum imóvel encontrado com os filtros atuais.
            </p>
            <p className="text-sm text-[#5C5559]">
              Amplie a faixa de preço ou redefina os filtros para ver todos os
              anúncios.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setFilters(DEFAULT_FILTERS)}
            className="knoll-btn-primary inline-flex items-center gap-2 text-sm"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Limpar filtros
          </button>
        </div>
      ) : viewMode === "grid" ? (
        <section
          aria-label="Lista de imóveis"
          className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4"
        >
          {pagedItems.map((item) => (
            <ImovelCard
              key={item.id}
              item={item}
              onSelect={onSelect}
              onToggleFavorite={onToggleFavorite}
              onToggleHidden={onToggleHidden}
              onDelete={onDelete}
            />
          ))}
        </section>
      ) : (
        <div
          tabIndex={0}
          role="region"
          aria-labelledby={tableCaptionId}
          className="table-wrapper"
        >
          <table
            className="text-sm text-[#2D2D2D]"
            style={
              {
                "--label-2": '"Portal"',
                "--label-3": '"Localização"',
                "--label-4": '"Total mensal"',
                "--label-5": '"Aluguel"',
                "--label-6": '"Área e quartos"',
                "--label-7": '"Fotos"',
                "--label-8": '"Ações"',
              } as CSSProperties
            }
          >
            <caption id={tableCaptionId} className="sr-only">
              Tabela de imóveis filtrados
            </caption>
            <thead>
              <tr className="text-left text-xs font-bold text-[#2D2D2D]">
                <th className="px-4 py-3">Imóvel</th>
                <th className="px-4 py-3">Portal</th>
                <th className="px-4 py-3">Localização</th>
                <th className="px-4 py-3">Total mensal</th>
                <th className="px-4 py-3">Aluguel</th>
                <th className="px-4 py-3">Área e quartos</th>
                <th className="px-4 py-3">Fotos</th>
                <th className="px-4 py-3">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#00000020]/50">
              {pagedItems.map((item) => {
                const seen = formatRelativeSeen(item.updated || item.created);
                return (
                <tr key={item.id}>
                  <th
                    scope="row"
                    className="max-w-xs px-4 py-3 font-bold text-[#2D2D2D]"
                  >
                    <button
                      type="button"
                      onClick={() => onSelect(item)}
                      className="line-clamp-2 text-left hover:underline"
                    >
                      {item.title}
                    </button>
                    {seen.days !== null && (
                      <div
                        className={`mt-1 inline-flex items-center gap-1 font-normal text-xs ${
                          seen.isStale
                            ? "text-[#9F2D3B]"
                            : "text-[#5C5559]"
                        }`}
                      >
                        {seen.isStale ? (
                          <AlertTriangle
                            className="h-3 w-3 shrink-0"
                            aria-hidden="true"
                          />
                        ) : (
                          <Clock
                            className="h-3 w-3 shrink-0"
                            aria-hidden="true"
                          />
                        )}
                        <span>
                          {seen.label}
                          {seen.isStale ? " (possível inativo)" : ""}
                        </span>
                      </div>
                    )}
                  </th>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="rounded-md border border-[#00000020] bg-[#CBE4F0] px-2 py-0.5 text-xs font-bold">
                      {formatPortalLabel(item.portalName)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-[#5C5559]">
                    {item.neighborhood || item.city || "—"}
                  </td>
                  <td className="px-4 py-3 font-mono font-bold whitespace-nowrap text-[#2D2D2D]">
                    {formatCurrencyBRL(item.totalPrice)}
                  </td>
                  <td className="px-4 py-3 font-mono whitespace-nowrap text-xs text-[#5C5559]">
                    {formatCurrencyBRL(item.priceAluguel)}
                  </td>
                  <td className="px-4 py-3 font-mono whitespace-nowrap text-xs text-[#5C5559]">
                    <div>{item.areaM2 > 0 ? `${item.areaM2} m²` : "—"}</div>
                    <div>
                      {item.bedroom > 0 ? `${item.bedroom} quartos` : ""}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {item.images.length}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onToggleFavorite(item)}
                        aria-label="Favoritar"
                        className={`rounded-lg border border-[#00000020] p-1.5 ${
                          item.favorite
                            ? "bg-[#F6D0D6] text-[#9F2D3B]"
                            : "bg-[#FFFDFD] text-[#5C5559] hover:bg-[#F6D0D6]"
                        }`}
                      >
                        <Heart
                          className={`h-3.5 w-3.5 ${item.favorite ? "fill-current" : ""}`}
                          aria-hidden="true"
                        />
                      </button>
                      <button
                        type="button"
                        onClick={() => onSelect(item)}
                        className="knoll-btn-primary !px-2.5 !py-1 text-xs"
                      >
                        Abrir
                      </button>
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <nav
          aria-label="Paginação dos imóveis"
          className="knoll-card flex items-center justify-between gap-3 px-4 py-3 text-sm"
        >
          <span className="font-mono text-xs text-[#5C5559]">
            Página <strong className="text-[#2D2D2D]">{safePage}</strong> de{" "}
            <strong className="text-[#2D2D2D]">{totalPages}</strong> (
            {filteredItems.length} resultados)
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="knoll-btn-secondary !px-3 !py-1.5 text-xs disabled:opacity-40"
            >
              Anterior
            </button>
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="knoll-btn-secondary !px-3 !py-1.5 text-xs disabled:opacity-40"
            >
              Próxima
            </button>
          </div>
        </nav>
      )}
    </div>
  );
}
