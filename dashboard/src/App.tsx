import { useCallback, useEffect, useState } from "react";
import type PocketBase from "pocketbase";
import {
  Activity,
  Building2,
  Globe,
  LogOut,
  RefreshCw,
  ShieldCheck,
  User,
} from "lucide-react";
import { CatalogSection } from "./components/CatalogSection";
import { ImovelDetailDialog } from "./components/ImovelDetailDialog";
import { LoginView } from "./components/LoginView";
import { MonitoringSection } from "./components/MonitoringSection";
import { PortalsSection } from "./components/PortalsSection";
import {
  authenticateWithPocketBase,
  createPocketBaseClient,
  deleteImovelRecords,
  fetchDashboardSnapshot,
  getAuthSessionUser,
  getSavedPocketBaseUrl,
  savePocketBaseUrl,
  toggleImovelFlag,
  updateListingRecord,
  type AuthSessionUser,
  type DashboardSnapshot,
  type ImovelItem,
} from "./lib/pocketbase";

type ActiveTab = "imoveis" | "portais" | "monitoramento";

const EMPTY_SNAPSHOT: DashboardSnapshot = {
  listings: [],
  imoveis: [],
  runs: [],
  logs: [],
  runsAvailable: true,
  logsAvailable: true,
};

export function App() {
  const [pbUrl, setPbUrl] = useState<string>(() => getSavedPocketBaseUrl());
  const [pb, setPb] = useState<PocketBase>(() =>
    createPocketBaseClient(getSavedPocketBaseUrl()),
  );
  const [sessionUser, setSessionUser] = useState<AuthSessionUser | null>(() =>
    getAuthSessionUser(pb),
  );
  const [activeTab, setActiveTab] = useState<ActiveTab>("imoveis");
  const [snapshot, setSnapshot] = useState<DashboardSnapshot>(EMPTY_SNAPSHOT);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedImovel, setSelectedImovel] = useState<ImovelItem | null>(null);

  const loadData = useCallback(async (client: PocketBase) => {
    setLoading(true);
    setLoadError(null);
    try {
      const next = await fetchDashboardSnapshot(client);
      setSnapshot(next);
    } catch (err) {
      setLoadError(
        err instanceof Error
          ? err.message
          : "Erro ao carregar dados do PocketBase.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (sessionUser) {
      void loadData(pb);
    }
  }, [pb, sessionUser, loadData]);

  function showNotice(message: string) {
    setNotice(message);
    setTimeout(() => {
      setNotice((cur) => (cur === message ? null : cur));
    }, 3500);
  }

  async function handleLogin(params: {
    url: string;
    email: string;
    password: string;
  }) {
    const normalizedUrl = savePocketBaseUrl(params.url);
    const client = createPocketBaseClient(normalizedUrl);
    const user = await authenticateWithPocketBase(
      client,
      params.email,
      params.password,
    );
    setPbUrl(normalizedUrl);
    setPb(client);
    setSessionUser(user);
  }

  function handleLogout() {
    pb.authStore.clear();
    setSessionUser(null);
    setSnapshot(EMPTY_SNAPSHOT);
    setSelectedImovel(null);
    setLoadError(null);
  }

  async function handleToggleFlag(
    item: ImovelItem,
    flag: "favorite" | "hidden",
  ) {
    const nextValue = !item[flag];
    setSnapshot((prev) => ({
      ...prev,
      imoveis: prev.imoveis.map((entry) =>
        entry.id === item.id ? { ...entry, [flag]: nextValue } : entry,
      ),
    }));
    setSelectedImovel((prev) =>
      prev && prev.id === item.id ? { ...prev, [flag]: nextValue } : prev,
    );

    const res = await toggleImovelFlag(pb, item, flag, nextValue);
    if (!res.persistedRemote) {
      showNotice("Preferência salva neste navegador.");
    }
  }

  async function handleDeleteImovel(item: ImovelItem) {
    try {
      await deleteImovelRecords(pb, [item.id]);
      setSnapshot((prev) => ({
        ...prev,
        imoveis: prev.imoveis.filter((entry) => entry.id !== item.id),
      }));
      setSelectedImovel((prev) => (prev?.id === item.id ? null : prev));
      showNotice("Anúncio excluído.");
    } catch (err) {
      setLoadError(
        err instanceof Error
          ? err.message
          : "Não foi possível excluir o anúncio. Tente novamente.",
      );
    }
  }

  async function handleCleanInvalidOlx(ids: string[]) {
    try {
      const deleted = await deleteImovelRecords(pb, ids);
      const idSet = new Set(ids);
      setSnapshot((prev) => ({
        ...prev,
        imoveis: prev.imoveis.filter((entry) => !idSet.has(entry.id)),
      }));
      showNotice(`${deleted} anúncios inválidos da OLX removidos.`);
    } catch (err) {
      setLoadError(
        err instanceof Error
          ? err.message
          : "Erro ao remover anúncios inválidos da OLX.",
      );
    }
  }

  async function handleUpdateListing(
    id: string,
    patch: Parameters<typeof updateListingRecord>[2],
  ) {
    const updated = await updateListingRecord(pb, id, patch);
    setSnapshot((prev) => ({
      ...prev,
      listings: prev.listings.map((entry) =>
        entry.id === id ? updated : entry,
      ),
    }));
  }

  if (!sessionUser) {
    return <LoginView initialUrl={pbUrl} onLogin={handleLogin} />;
  }

  return (
    <div className="knoll-app-canvas min-h-[100dvh] text-[#2D2D2D]">
      <header className="sticky top-0 z-[100] border-b border-[#00000020] bg-[#E6E6FA]/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#00000020] bg-[#CBE4F0] text-[#2D2D2D] shadow-xs">
              <Building2 className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-[#2D2D2D]">
                Aluga.ai
              </h1>
              <p className="font-mono text-[11px] text-[#5C5559]">{pbUrl}</p>
            </div>
          </div>

          <nav
            aria-label="Navegação principal"
            className="flex flex-wrap items-center gap-1 rounded-xl border border-[#00000020] bg-[#FFFDFD] p-1 shadow-xs"
          >
            <button
              type="button"
              onClick={() => setActiveTab("imoveis")}
              aria-current={activeTab === "imoveis" ? "page" : undefined}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition ${
                activeTab === "imoveis"
                  ? "bg-[#CBE4F0] font-medium text-[#2D2D2D] shadow-2xs"
                  : "text-[#5C5559] hover:bg-[#E6E6FA]/60 hover:text-[#2D2D2D]"
              }`}
            >
              <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Imóveis</span>
              <span className="font-mono text-[11px]">
                ({snapshot.imoveis.length})
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("portais")}
              aria-current={activeTab === "portais" ? "page" : undefined}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition ${
                activeTab === "portais"
                  ? "bg-[#CBE4F0] font-medium text-[#2D2D2D] shadow-2xs"
                  : "text-[#5C5559] hover:bg-[#E6E6FA]/60 hover:text-[#2D2D2D]"
              }`}
            >
              <Globe className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Portais</span>
              <span className="font-mono text-[11px]">
                ({snapshot.listings.length})
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("monitoramento")}
              aria-current={activeTab === "monitoramento" ? "page" : undefined}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition ${
                activeTab === "monitoramento"
                  ? "bg-[#CBE4F0] font-medium text-[#2D2D2D] shadow-2xs"
                  : "text-[#5C5559] hover:bg-[#E6E6FA]/60 hover:text-[#2D2D2D]"
              }`}
            >
              <Activity className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Coletas</span>
            </button>
          </nav>

          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-1.5 rounded-xl border border-[#00000020] bg-[#FFFDFD] px-3 py-1.5 text-xs text-[#2D2D2D] sm:inline-flex">
              {sessionUser.role === "superuser" ? (
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#D0F0C0]">
                  <ShieldCheck className="h-3 w-3 text-[#2D2D2D]" aria-hidden="true" />
                </span>
              ) : (
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#CBE4F0]">
                  <User className="h-3 w-3 text-[#2D2D2D]" aria-hidden="true" />
                </span>
              )}
              <span className="max-w-[160px] truncate font-medium">
                {sessionUser.email}
              </span>
            </div>

            <button
              type="button"
              disabled={loading}
              onClick={() => void loadData(pb)}
              aria-label="Atualizar dados"
              className="knoll-btn-secondary inline-flex items-center gap-1.5 !px-3 !py-1.5 text-xs disabled:opacity-50"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">
                {loading ? "Atualizando..." : "Atualizar"}
              </span>
            </button>

            <button
              type="button"
              onClick={handleLogout}
              className="knoll-btn-secondary inline-flex items-center gap-1.5 !px-3 !py-1.5 text-xs hover:!bg-[#FADCE0] hover:text-[#9F2D3B]"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              Sair
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1280px] space-y-6 px-6 py-8">
        {notice && (
          <div
            role="status"
            className="knoll-enter fixed right-6 bottom-6 z-[500] max-w-sm rounded-xl border border-[#00000020] bg-[#D0F0C0] px-4 py-3 text-xs font-medium text-[#2D2D2D] shadow-lg"
          >
            {notice}
          </div>
        )}

        {loadError && (
          <div
            role="alert"
            className="rounded-xl border border-[#9F2D3B]/30 bg-[#FADCE0] px-4 py-3 text-sm text-[#9F2D3B]"
          >
            {loadError}
          </div>
        )}

        {loading && snapshot.imoveis.length === 0 ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }, (_, idx) => (
              <div
                key={idx}
                className="knoll-card overflow-hidden p-3"
              >
                <div className="knoll-shimmer aspect-[16/10] w-full rounded-lg" />
                <div className="mt-4 space-y-2.5">
                  <div className="knoll-shimmer h-5 w-1/2 rounded" />
                  <div className="knoll-shimmer h-4 w-5/6 rounded" />
                  <div className="knoll-shimmer h-3 w-2/3 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : activeTab === "imoveis" ? (
          <CatalogSection
            items={snapshot.imoveis}
            onSelect={setSelectedImovel}
            onToggleFavorite={(item) => void handleToggleFlag(item, "favorite")}
            onToggleHidden={(item) => void handleToggleFlag(item, "hidden")}
            onDelete={handleDeleteImovel}
            onCleanInvalidOlx={handleCleanInvalidOlx}
          />
        ) : activeTab === "portais" ? (
          <PortalsSection
            listings={snapshot.listings}
            onUpdateListing={handleUpdateListing}
          />
        ) : (
          <MonitoringSection
            runs={snapshot.runs}
            logs={snapshot.logs}
            runsAvailable={snapshot.runsAvailable}
            logsAvailable={snapshot.logsAvailable}
          />
        )}
      </main>

      <ImovelDetailDialog
        item={selectedImovel}
        onClose={() => setSelectedImovel(null)}
        onToggleFavorite={(item) => void handleToggleFlag(item, "favorite")}
        onToggleHidden={(item) => void handleToggleFlag(item, "hidden")}
        onDelete={handleDeleteImovel}
      />
    </div>
  );
}
