import { useId, useState, type CSSProperties } from "react";
import { Check, ExternalLink, RotateCcw, Save } from "lucide-react";
import { formatDateTimeBR, formatPortalLabel } from "../lib/format";
import type { ListingItem } from "../lib/pocketbase";

interface PortalsSectionProps {
  listings: ListingItem[];
  onUpdateListing: (
    id: string,
    patch: {
      active?: boolean;
      lastPage?: number;
      url?: string;
      maxPages?: number;
      delayMs?: number;
    },
  ) => Promise<void>;
}

interface DraftState {
  url: string;
  maxPages: number;
  delayMs: number;
}

export function PortalsSection({
  listings,
  onUpdateListing,
}: PortalsSectionProps) {
  const captionId = useId();
  const [drafts, setDrafts] = useState<Record<string, DraftState>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function getDraft(item: ListingItem): DraftState {
    return (
      drafts[item.id] ?? {
        url: item.url,
        maxPages: item.maxPages,
        delayMs: item.delayMs,
      }
    );
  }

  function updateDraft(item: ListingItem, patch: Partial<DraftState>) {
    const current = getDraft(item);
    setDrafts((prev) => ({
      ...prev,
      [item.id]: { ...current, ...patch },
    }));
  }

  async function runPatch(
    id: string,
    patch: Parameters<PortalsSectionProps["onUpdateListing"]>[1],
  ) {
    setError(null);
    setSavingId(id);
    try {
      await onUpdateListing(id, patch);
      setSavedId(id);
      setTimeout(() => {
        setSavedId((cur) => (cur === id ? null : cur));
      }, 2000);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Sem permissão para atualizar a collection listings.",
      );
    } finally {
      setSavingId(null);
    }
  }

  return (
    <section className="knoll-enter space-y-4">
      <div className="knoll-card flex flex-wrap items-center justify-between gap-2 p-5">
        <div>
          <h2 className="text-xl font-bold text-[#2D2D2D]">
            Portais de busca
          </h2>
          <p className="text-sm text-[#5C5559]">
            Ative ou pause os portais, ajuste os endereços de pesquisa e volte
            a coleta para a página 1 quando precisar reiniciar.
          </p>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-[#9F2D3B]/30 bg-[#FADCE0] px-4 py-3 text-sm text-[#9F2D3B]"
        >
          {error}
        </div>
      )}

      <div
        tabIndex={0}
        role="region"
        aria-labelledby={captionId}
        className="table-wrapper"
      >
        <table
          className="text-sm text-[#2D2D2D]"
          style={
            {
              "--label-2": '"Status"',
              "--label-3": '"Última Página"',
              "--label-4": '"URL de Busca"',
              "--label-5": '"Máx. Páginas"',
              "--label-6": '"Delay (ms)"',
              "--label-7": '"Atualizado"',
              "--label-8": '"Salvar"',
            } as CSSProperties
          }
        >
          <caption id={captionId} className="sr-only">
            Configuração dos portais de coleta
          </caption>
          <thead>
            <tr className="text-left text-xs font-bold text-[#2D2D2D]">
              <th className="px-4 py-3">Portal</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Página atual</th>
              <th className="px-4 py-3">Endereço de busca</th>
              <th className="px-4 py-3">Máx. páginas</th>
              <th className="px-4 py-3">Intervalo (ms)</th>
              <th className="px-4 py-3">Atualizado</th>
              <th className="px-4 py-3">Ação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#00000020]/40">
            {listings.map((item) => {
              const draft = getDraft(item);
              const dirty =
                draft.url !== item.url ||
                draft.maxPages !== item.maxPages ||
                draft.delayMs !== item.delayMs;
              const isSaving = savingId === item.id;
              const isSaved = savedId === item.id;

              return (
                <tr key={item.id}>
                  <th
                    scope="row"
                    className="px-4 py-3 whitespace-nowrap font-bold text-[#2D2D2D]"
                  >
                    <div>{formatPortalLabel(item.name)}</div>
                    <div className="font-mono text-[11px] font-normal text-[#5C5559]">
                      {item.name}
                    </div>
                  </th>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() =>
                        runPatch(item.id, { active: !item.active })
                      }
                      aria-pressed={item.active}
                      className={`rounded-xl border border-[#00000020] px-3 py-1 text-xs font-semibold transition ${
                        item.active
                          ? "bg-[#D0F0C0] text-[#2D2D2D] hover:bg-[#BEE5AC]"
                          : "bg-[#F6D0D6] text-[#2D2D2D] hover:bg-[#EEBAC3]"
                      }`}
                    >
                      {item.active ? "Ativo" : "Pausado"}
                    </button>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-[#2D2D2D]">
                        {item.lastPage}
                      </span>
                      <button
                        type="button"
                        disabled={isSaving || item.lastPage === 1}
                        onClick={() => runPatch(item.id, { lastPage: 1 })}
                        title="Voltar para página 1"
                        className="knoll-btn-secondary inline-flex items-center gap-1 !px-2 !py-1 font-mono text-[11px] disabled:opacity-40"
                      >
                        <RotateCcw className="h-3 w-3" aria-hidden="true" />
                        p/ 1
                      </button>
                    </div>
                  </td>
                  <td className="min-w-[260px] px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <input
                        type="url"
                        aria-label={`URL de busca para ${item.name}`}
                        value={draft.url}
                        onChange={(e) =>
                          updateDraft(item, { url: e.target.value })
                        }
                        className="knoll-input w-full px-2.5 py-1.5 font-mono text-xs"
                      />
                      {draft.url && (
                        <a
                          href={draft.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Abrir URL de ${item.name}`}
                          className="knoll-btn-secondary shrink-0 !p-1.5 text-[#2D2D2D]"
                        >
                          <ExternalLink
                            className="h-3.5 w-3.5"
                            aria-hidden="true"
                          />
                        </a>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      min={1}
                      aria-label={`Máximo de páginas para ${item.name}`}
                      value={draft.maxPages}
                      onChange={(e) =>
                        updateDraft(item, {
                          maxPages: Math.max(1, Number(e.target.value) || 1),
                        })
                      }
                      className="knoll-input w-20 px-2.5 py-1.5 font-mono text-xs"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      min={0}
                      step={250}
                      aria-label={`Delay em ms para ${item.name}`}
                      value={draft.delayMs}
                      onChange={(e) =>
                        updateDraft(item, {
                          delayMs: Math.max(0, Number(e.target.value) || 0),
                        })
                      }
                      className="knoll-input w-24 px-2.5 py-1.5 font-mono text-xs"
                    />
                  </td>
                  <td className="px-4 py-3 font-mono whitespace-nowrap text-xs text-[#5C5559]">
                    {formatDateTimeBR(item.updated)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <button
                      type="button"
                      disabled={isSaving || !dirty}
                      onClick={() =>
                        runPatch(item.id, {
                          url: draft.url,
                          maxPages: draft.maxPages,
                          delayMs: draft.delayMs,
                        })
                      }
                      className={`inline-flex items-center gap-1.5 rounded-xl border border-[#00000020] px-3 py-1.5 text-xs font-semibold transition ${
                        isSaved
                          ? "bg-[#D0F0C0] text-[#2D2D2D]"
                          : dirty
                            ? "bg-[#CBE4F0] text-[#2D2D2D] hover:bg-[#B6D7E7]"
                            : "bg-[#E6E6FA]/50 text-[#5C5559] opacity-60"
                      }`}
                    >
                      {isSaved ? (
                        <>
                          <Check className="h-3.5 w-3.5" aria-hidden="true" />
                          Alterações salvas
                        </>
                      ) : (
                        <>
                          <Save className="h-3.5 w-3.5" aria-hidden="true" />
                          Salvar alterações
                        </>
                      )}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
