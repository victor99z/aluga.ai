import { useId, useMemo, useState, type CSSProperties } from "react";
import { Activity, Search, Terminal } from "lucide-react";
import { formatDateTimeBR, formatPortalLabel } from "../lib/format";
import type { CrawlerLogItem, CrawlerRunItem } from "../lib/pocketbase";
import { KnollSelect } from "./KnollSelect";

interface MonitoringSectionProps {
  runs: CrawlerRunItem[];
  logs: CrawlerLogItem[];
  runsAvailable: boolean;
  logsAvailable: boolean;
}

const STATUS_STYLES: Record<string, string> = {
  completed: "bg-[#D0F0C0] text-[#2D2D2D]",
  running: "bg-[#CBE4F0] text-[#2D2D2D]",
  error: "bg-[#FADCE0] text-[#9F2D3B]",
};

const LEVEL_STYLES: Record<string, string> = {
  info: "bg-[#CBE4F0] text-[#2D2D2D]",
  warn: "bg-[#F6D0D6] text-[#2D2D2D]",
  error: "bg-[#FADCE0] text-[#9F2D3B]",
  debug: "bg-[#E6E6FA] text-[#5C5559]",
};

export function MonitoringSection({
  runs,
  logs,
  runsAvailable,
  logsAvailable,
}: MonitoringSectionProps) {
  const runsCaptionId = useId();
  const logsCaptionId = useId();
  const [levelFilter, setLevelFilter] = useState<string>("");
  const [logSearch, setLogSearch] = useState("");

  const filteredLogs = useMemo(() => {
    const q = logSearch.trim().toLowerCase();
    return logs.filter((log) => {
      if (levelFilter && log.level !== levelFilter) return false;
      if (!q) return true;
      return (
        log.message.toLowerCase().includes(q) ||
        log.context.toLowerCase().includes(q)
      );
    });
  }, [logs, levelFilter, logSearch]);

  return (
    <div className="knoll-enter space-y-8">
      <section className="space-y-4">
        <div className="knoll-card flex items-center gap-3 p-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#00000020] bg-[#CBE4F0]">
            <Activity className="h-4 w-4 text-[#2D2D2D]" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[#2D2D2D]">
              Últimas coletas
            </h2>
            <p className="text-xs text-[#5C5559]">
              Resumo de páginas percorridas, anúncios encontrados e eventuais
              falhas por portal.
            </p>
          </div>
        </div>

        {!runsAvailable ? (
          <div className="knoll-card p-5 text-sm text-[#5C5559]">
            O histórico de coletas ainda não está disponível para esta conta.
          </div>
        ) : runs.length === 0 ? (
          <div className="knoll-card flex flex-col items-center gap-2 p-8 text-center">
            <Activity className="h-7 w-7 text-[#5C5559]" aria-hidden="true" />
            <p className="text-sm font-medium text-[#2D2D2D]">
              Nenhuma execução registrada até o momento.
            </p>
          </div>
        ) : (
          <div
            tabIndex={0}
            role="region"
            aria-labelledby={runsCaptionId}
            className="table-wrapper"
          >
            <table
              className="text-sm text-[#2D2D2D]"
              style={
                {
                  "--label-2": '"Status"',
                  "--label-3": '"Início"',
                  "--label-4": '"Fim"',
                  "--label-5": '"Páginas"',
                  "--label-6": '"Anúncios"',
                  "--label-7": '"Erros"',
                  "--label-8": '"Observação"',
                } as CSSProperties
              }
            >
              <caption id={runsCaptionId} className="sr-only">
                Histórico de execuções do crawler
              </caption>
              <thead>
                <tr className="text-left text-xs font-bold text-[#2D2D2D]">
                  <th className="px-4 py-3">Portal</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Início</th>
                  <th className="px-4 py-3">Fim</th>
                  <th className="px-4 py-3">Páginas</th>
                  <th className="px-4 py-3">Anúncios</th>
                  <th className="px-4 py-3">Erros</th>
                  <th className="px-4 py-3">Observação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#00000020]/40">
                {runs.map((run) => (
                  <tr key={run.id}>
                    <th
                      scope="row"
                      className="px-4 py-3 whitespace-nowrap font-bold text-[#2D2D2D]"
                    >
                      {formatPortalLabel(run.siteName)}
                    </th>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`inline-flex rounded-lg border border-[#00000020] px-2.5 py-0.5 font-mono text-xs font-semibold ${
                          STATUS_STYLES[run.status] ??
                          "bg-[#E6E6FA] text-[#2D2D2D]"
                        }`}
                      >
                        {run.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono whitespace-nowrap text-xs text-[#5C5559]">
                      {formatDateTimeBR(run.startedAt)}
                    </td>
                    <td className="px-4 py-3 font-mono whitespace-nowrap text-xs text-[#5C5559]">
                      {formatDateTimeBR(run.finishedAt)}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-[#2D2D2D]">
                      {run.pagesCrawled}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-[#2D2D2D]">
                      {run.listingsScraped}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-[#9F2D3B]">
                      {run.errors}
                    </td>
                    <td className="max-w-xs truncate px-4 py-3 text-xs text-[#5C5559]">
                      {run.errorMsg || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div className="knoll-card flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#00000020] bg-[#D0F0C0]">
              <Terminal className="h-4 w-4 text-[#2D2D2D]" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#2D2D2D]">
                Registro de atividade
              </h2>
              <p className="text-xs text-[#5C5559]">
                Eventos recentes gravados durante a execução automática.
              </p>
            </div>
          </div>

          {logsAvailable && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search
                  className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[#5C5559]"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  aria-label="Filtrar logs"
                  value={logSearch}
                  onChange={(e) => setLogSearch(e.target.value)}
                  placeholder="Filtrar mensagem ou contexto..."
                  className="knoll-input py-2 pr-3.5 pl-9 text-sm placeholder:text-[#5C5559]/70"
                />
              </div>
              <KnollSelect
                ariaLabel="Filtrar por nível de log"
                value={levelFilter}
                onChange={setLevelFilter}
                className="min-w-[170px]"
                options={[
                  { value: "", label: "Todos os níveis" },
                  { value: "info", label: "info" },
                  { value: "warn", label: "warn" },
                  { value: "error", label: "error" },
                  { value: "debug", label: "debug" },
                ]}
              />
            </div>
          )}
        </div>

        {!logsAvailable ? (
          <div className="knoll-card p-5 text-sm text-[#5C5559]">
            O registro de atividade ainda não está disponível para esta conta.
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="knoll-card flex flex-col items-center gap-2 p-8 text-center">
            <Terminal className="h-7 w-7 text-[#5C5559]" aria-hidden="true" />
            <p className="text-sm font-medium text-[#2D2D2D]">
              Nenhum log encontrado para o filtro selecionado.
            </p>
          </div>
        ) : (
          <div
            tabIndex={0}
            role="region"
            aria-labelledby={logsCaptionId}
            className="table-wrapper"
          >
            <table
              className="text-xs text-[#2D2D2D]"
              style={
                {
                  "--label-2": '"Nível"',
                  "--label-3": '"Mensagem"',
                  "--label-4": '"Contexto"',
                } as CSSProperties
              }
            >
              <caption id={logsCaptionId} className="sr-only">
                Logs recentes do crawler
              </caption>
              <thead>
                <tr className="text-left text-xs font-bold text-[#2D2D2D]">
                  <th className="px-4 py-3">Data e hora</th>
                  <th className="px-4 py-3">Nível</th>
                  <th className="px-4 py-3">Mensagem</th>
                  <th className="px-4 py-3">Detalhes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#00000020]/40">
                {filteredLogs.map((log) => (
                  <tr key={log.id}>
                    <th
                      scope="row"
                      className="px-4 py-2.5 font-mono whitespace-nowrap font-medium text-[#5C5559]"
                    >
                      {formatDateTimeBR(log.createdAt)}
                    </th>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span
                        className={`inline-flex rounded-md border border-[#00000020] px-2 py-0.5 font-mono text-[11px] font-semibold uppercase ${
                          LEVEL_STYLES[log.level] ??
                          "bg-[#E6E6FA] text-[#2D2D2D]"
                        }`}
                      >
                        {log.level}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-medium text-[#2D2D2D]">
                      {log.message}
                    </td>
                    <td className="max-w-md truncate px-4 py-2.5 font-mono text-[11px] text-[#5C5559]">
                      {log.context || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
