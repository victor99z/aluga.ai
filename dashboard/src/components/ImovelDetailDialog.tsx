import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  Bath,
  BedDouble,
  Car,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  EyeOff,
  Heart,
  ImageOff,
  MapPin,
  Maximize2,
  Trash2,
  X,
} from "lucide-react";
import {
  formatCurrencyBRL,
  formatCurrencyBRLDecimal,
  formatDateTimeBR,
  formatPortalLabel,
} from "../lib/format";
import type { ImovelItem } from "../lib/pocketbase";

interface ImovelDetailDialogProps {
  item: ImovelItem | null;
  onClose: () => void;
  onToggleFavorite: (item: ImovelItem) => void;
  onToggleHidden: (item: ImovelItem) => void;
  onDelete: (item: ImovelItem) => Promise<void>;
}

export function ImovelDetailDialog({
  item,
  onClose,
  onToggleFavorite,
  onToggleHidden,
  onDelete,
}: ImovelDetailDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [activeImageIdx, setActiveImageIdx] = useState(0);
  const [failedUrls, setFailedUrls] = useState<Record<string, boolean>>({});
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setActiveImageIdx(0);
    setFailedUrls({});
    setConfirmingDelete(false);
    setDeleting(false);

    const dialog = dialogRef.current;
    if (!dialog) return;

    if (item && !dialog.open) {
      dialog.showModal();
    } else if (!item && dialog.open) {
      dialog.close();
    }
  }, [item]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleNativeClose = () => {
      onClose();
    };
    dialog.addEventListener("close", handleNativeClose);

    // Fallback for browsers without native `closedby="any"` support (e.g. Safari)
    let removeBackdropListener: (() => void) | undefined;
    if (!("closedBy" in HTMLDialogElement.prototype)) {
      const handleBackdropClick = (event: MouseEvent) => {
        if (event.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        const isDialogContent =
          rect.top <= event.clientY &&
          event.clientY <= rect.top + rect.height &&
          rect.left <= event.clientX &&
          event.clientX <= rect.left + rect.width;
        if (isDialogContent) return;
        dialog.close();
      };
      dialog.addEventListener("click", handleBackdropClick);
      removeBackdropListener = () =>
        dialog.removeEventListener("click", handleBackdropClick);
    }

    return () => {
      dialog.removeEventListener("close", handleNativeClose);
      removeBackdropListener?.();
    };
  }, [onClose]);

  const availableImages = useMemo(
    () =>
      item ? item.images.filter((img) => !failedUrls[img.fullUrl]) : [],
    [item, failedUrls],
  );

  useEffect(() => {
    if (!item || availableImages.length <= 1) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        setActiveImageIdx((prev) =>
          prev === 0 ? availableImages.length - 1 : prev - 1,
        );
      } else if (event.key === "ArrowRight") {
        setActiveImageIdx((prev) =>
          prev === availableImages.length - 1 ? 0 : prev + 1,
        );
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [item, availableImages.length]);

  const safeImageIdx =
    availableImages.length > 0
      ? Math.min(activeImageIdx, availableImages.length - 1)
      : 0;
  const activeImage = availableImages[safeImageIdx] ?? null;

  async function handleConfirmDelete() {
    if (!item) return;
    setDeleting(true);
    try {
      await onDelete(item);
      dialogRef.current?.close();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className="imovel-dialog"
      {...({ closedby: "any" } as Record<string, unknown>)}
    >
      {item && (
        <div className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden bg-[#FFFDFD]">
          <header className="flex items-start justify-between gap-4 border-b border-[#00000020] bg-[#E6E6FA]/70 px-5 py-4">
            <div className="min-w-0">
              <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-lg border border-[#00000020] bg-[#CBE4F0] px-2.5 py-0.5 font-mono font-medium text-[#2D2D2D]">
                  {formatPortalLabel(item.portalName)}
                </span>
                {item.propertyType && (
                  <span className="rounded-lg border border-[#00000020] bg-[#FFFDFD] px-2.5 py-0.5 font-medium text-[#2D2D2D]">
                    {item.propertyType}
                  </span>
                )}
                <span className="font-mono text-[#5C5559]">ID: {item.id}</span>
              </div>
              <h2
                id={titleId}
                className="text-lg font-bold text-[#2D2D2D] sm:text-xl"
              >
                {item.title}
              </h2>
            </div>

            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              aria-label="Fechar detalhes do imóvel"
              className="knoll-btn-secondary shrink-0 !p-2 text-[#2D2D2D]"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </header>

          <div className="grid gap-6 overflow-y-auto p-5 lg:grid-cols-[1.2fr_1fr]">
            <div className="space-y-3">
              <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-[#00000020] bg-[#E6E6FA]/40">
                {activeImage ? (
                  <img
                    src={activeImage.fullUrl}
                    alt=""
                    referrerPolicy="no-referrer"
                    onError={() =>
                      setFailedUrls((prev) => ({
                        ...prev,
                        [activeImage.fullUrl]: true,
                      }))
                    }
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-2 text-[#5C5559]">
                    <ImageOff className="h-10 w-10" aria-hidden="true" />
                    <span className="font-mono text-xs">
                      Sem fotos armazenadas
                    </span>
                  </div>
                )}

                {availableImages.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        setActiveImageIdx((prev) =>
                          prev === 0 ? availableImages.length - 1 : prev - 1,
                        )
                      }
                      aria-label="Foto anterior"
                      className="absolute top-1/2 left-2.5 -translate-y-1/2 rounded-full border border-[#00000020] bg-[#FFFDFD]/90 p-2 text-[#2D2D2D] shadow-sm transition hover:bg-[#CBE4F0]"
                    >
                      <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setActiveImageIdx((prev) =>
                          prev === availableImages.length - 1 ? 0 : prev + 1,
                        )
                      }
                      aria-label="Próxima foto"
                      className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded-full border border-[#00000020] bg-[#FFFDFD]/90 p-2 text-[#2D2D2D] shadow-sm transition hover:bg-[#CBE4F0]"
                    >
                      <ChevronRight className="h-5 w-5" aria-hidden="true" />
                    </button>
                    <div className="absolute right-3 bottom-3 rounded-lg border border-[#00000020] bg-[#FFFDFD]/95 px-2.5 py-1 font-mono text-xs font-medium text-[#2D2D2D]">
                      {safeImageIdx + 1} / {availableImages.length}
                    </div>
                  </>
                )}
              </div>

              {availableImages.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {availableImages.map((img, idx) => (
                    <button
                      key={`${img.fullUrl}-${idx}`}
                      type="button"
                      onClick={() => setActiveImageIdx(idx)}
                      aria-label={`Ver foto ${idx + 1}`}
                      className={`h-16 w-20 shrink-0 overflow-hidden rounded-lg border-2 transition ${
                        idx === safeImageIdx
                          ? "border-[#2D2D2D] shadow-sm"
                          : "border-[#00000020] opacity-70 hover:opacity-100"
                      }`}
                    >
                      <img
                        src={img.thumbUrl}
                        alt=""
                        referrerPolicy="no-referrer"
                        loading="lazy"
                        onError={() =>
                          setFailedUrls((prev) => ({
                            ...prev,
                            [img.fullUrl]: true,
                          }))
                        }
                        className="h-full w-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="rounded-xl border border-[#00000020] bg-[#D0F0C0]/55 p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-bold text-[#5C5559]">
                    Total mensal estimado
                  </span>
                  {item.pricePerM2 && (
                    <span className="rounded-md border border-[#00000020] bg-[#FFFDFD] px-2 py-0.5 font-mono text-xs font-medium text-[#2D2D2D]">
                      {formatCurrencyBRLDecimal(item.pricePerM2)}/m²
                    </span>
                  )}
                </div>
                <p className="mt-1 text-2xl font-bold text-[#2D2D2D]">
                  {formatCurrencyBRL(item.totalPrice)}
                </p>

                <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-[#00000020] pt-3 text-xs sm:grid-cols-[1.2fr_1fr_1fr]">
                  <div>
                    <dt className="text-[#5C5559]">Aluguel</dt>
                    <dd className="font-mono font-semibold text-[#2D2D2D]">
                      {formatCurrencyBRL(item.priceAluguel)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[#5C5559]">Condomínio</dt>
                    <dd className="font-mono font-semibold text-[#2D2D2D]">
                      {item.priceCondominio > 0
                        ? formatCurrencyBRL(item.priceCondominio)
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[#5C5559]">IPTU</dt>
                    <dd className="font-mono font-semibold text-[#2D2D2D]">
                      {item.priceIptu > 0
                        ? formatCurrencyBRL(item.priceIptu)
                        : "—"}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                <div className="rounded-xl border border-[#00000020] bg-[#E6E6FA]/55 p-2.5 text-center">
                  <Maximize2
                    className="mx-auto mb-1 h-4 w-4 text-[#5C5559]"
                    aria-hidden="true"
                  />
                  <div className="font-mono text-sm font-semibold text-[#2D2D2D]">
                    {item.areaM2 > 0 ? `${item.areaM2} m²` : "—"}
                  </div>
                  <div className="text-[11px] text-[#5C5559]">Área</div>
                </div>
                <div className="rounded-xl border border-[#00000020] bg-[#CBE4F0]/55 p-2.5 text-center">
                  <BedDouble
                    className="mx-auto mb-1 h-4 w-4 text-[#5C5559]"
                    aria-hidden="true"
                  />
                  <div className="font-mono text-sm font-semibold text-[#2D2D2D]">
                    {item.bedroom > 0 ? item.bedroom : "—"}
                  </div>
                  <div className="text-[11px] text-[#5C5559]">Quartos</div>
                </div>
                <div className="rounded-xl border border-[#00000020] bg-[#F6D0D6]/55 p-2.5 text-center">
                  <Bath
                    className="mx-auto mb-1 h-4 w-4 text-[#5C5559]"
                    aria-hidden="true"
                  />
                  <div className="font-mono text-sm font-semibold text-[#2D2D2D]">
                    {item.bathroom > 0 ? item.bathroom : "—"}
                  </div>
                  <div className="text-[11px] text-[#5C5559]">Banheiros</div>
                </div>
                <div className="rounded-xl border border-[#00000020] bg-[#D0F0C0]/55 p-2.5 text-center">
                  <Car
                    className="mx-auto mb-1 h-4 w-4 text-[#5C5559]"
                    aria-hidden="true"
                  />
                  <div className="font-mono text-sm font-semibold text-[#2D2D2D]">
                    {item.garage > 0 ? item.garage : "—"}
                  </div>
                  <div className="text-[11px] text-[#5C5559]">Vagas</div>
                </div>
              </div>

              <div className="space-y-2 rounded-xl border border-[#00000020] bg-[#FFFDFD] p-4 text-sm">
                <div className="flex items-start gap-2 text-[#2D2D2D]">
                  <MapPin
                    className="mt-0.5 h-4 w-4 shrink-0 text-[#5C5559]"
                    aria-hidden="true"
                  />
                  <span>
                    {item.address ||
                      [item.neighborhood, item.city]
                        .filter(Boolean)
                        .join(", ") ||
                      "Endereço não informado"}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 border-t border-[#00000020] pt-2 font-mono text-xs text-[#5C5559]">
                  <div>
                    <span className="block text-[11px]">Criado em</span>
                    {formatDateTimeBR(item.created)}
                  </div>
                  <div>
                    <span className="block text-[11px]">Atualizado em</span>
                    {formatDateTimeBR(item.updated)}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {item.ref && (
                  <a
                    href={item.ref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="knoll-btn-primary inline-flex flex-1 items-center justify-center gap-2 text-sm"
                  >
                    <ExternalLink className="h-4 w-4" aria-hidden="true" />
                    Abrir anúncio original
                  </a>
                )}

                <button
                  type="button"
                  onClick={() => onToggleFavorite(item)}
                  className={`knoll-btn-secondary inline-flex items-center gap-1.5 text-sm ${
                    item.favorite ? "!bg-[#F6D0D6] !text-[#9F2D3B]" : ""
                  }`}
                >
                  <Heart
                    className={`h-4 w-4 ${item.favorite ? "fill-current" : ""}`}
                    aria-hidden="true"
                  />
                  {item.favorite ? "Favorito" : "Favoritar"}
                </button>

                <button
                  type="button"
                  onClick={() => onToggleHidden(item)}
                  className={`knoll-btn-secondary inline-flex items-center gap-1.5 text-sm ${
                    item.hidden ? "!bg-[#E6E6FA]" : ""
                  }`}
                >
                  <EyeOff className="h-4 w-4" aria-hidden="true" />
                  {item.hidden ? "Reexibir" : "Ocultar"}
                </button>
              </div>

              <div className="border-t border-[#00000020] pt-3">
                {confirmingDelete ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#9F2D3B]/30 bg-[#FADCE0] p-3 text-xs">
                    <span className="text-[#9F2D3B]">
                      Excluir este registro do PocketBase permanentemente?
                    </span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirmingDelete(false)}
                        className="knoll-btn-secondary !px-2.5 !py-1 text-xs"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        disabled={deleting}
                        onClick={handleConfirmDelete}
                        className="rounded-lg bg-[#9F2D3B] px-2.5 py-1 font-semibold text-white hover:opacity-90 disabled:opacity-60"
                      >
                        {deleting ? "Excluindo..." : "Excluir anúncio"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(true)}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-[#9F2D3B] hover:underline"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Excluir anúncio
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </dialog>
  );
}
