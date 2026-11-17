import { useState, type FormEvent } from "react";
import {
  Building2,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  MapPin,
  Ruler,
  Server,
} from "lucide-react";

interface LoginViewProps {
  initialUrl: string;
  onLogin: (params: {
    url: string;
    email: string;
    password: string;
  }) => Promise<void>;
}

export function LoginView({ initialUrl, onLogin }: LoginViewProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pbUrl, setPbUrl] = useState(initialUrl);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isLocalSampleServer =
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(pbUrl.trim());

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await onLogin({ url: pbUrl, email, password });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível entrar. Confira seu e-mail, senha e o endereço do servidor.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="knoll-canvas min-h-[100dvh]">
      <div className="mx-auto grid min-h-[100dvh] max-w-[1280px] items-center gap-10 px-6 py-10 md:grid-cols-2 lg:gap-16">
        <section className="knoll-enter space-y-6">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2.5 text-sm font-bold text-[#2D2D2D]">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#00000020] bg-[#CBE4F0]">
                <Building2 className="h-4 w-4" aria-hidden="true" />
              </span>
              <span>Joinville, Santa Catarina</span>
            </div>

            <h1 className="text-[clamp(2.5rem,5vw,4rem)] font-black leading-[1.06] tracking-tight text-[#2D2D2D]">
              Aluga.ai
            </h1>

            <p className="max-w-[60ch] text-base text-[#5C5559]">
              Organize anúncios de aluguel por custo mensal completo, metragem,
              bairro e galeria de fotos em um único painel.
            </p>
          </div>

          <div className="knoll-card max-w-md p-6 sm:p-7">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="email"
                  className="mb-1.5 block text-sm font-bold text-[#2D2D2D]"
                >
                  E-mail
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  autoComplete="username"
                  spellCheck={false}
                  enterKeyHint="next"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  className="knoll-input w-full px-3.5 py-2.5 text-sm placeholder:text-[#5C5559]/60"
                />
              </div>

              <div>
                <label
                  htmlFor="current-password"
                  className="mb-1.5 block text-sm font-bold text-[#2D2D2D]"
                >
                  Senha
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    id="current-password"
                    name="password"
                    autoComplete="current-password"
                    enterKeyHint="done"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Sua senha do PocketBase"
                    className="knoll-input w-full py-2.5 pr-11 pl-3.5 text-sm placeholder:text-[#5C5559]/60"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-pressed={showPassword}
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-[#5C5559] transition hover:text-[#2D2D2D]"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Eye className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>

              {error && (
                <div
                  role="alert"
                  className="rounded-xl border border-[#9F2D3B]/30 bg-[#FADCE0] px-3.5 py-2.5 text-sm text-[#9F2D3B]"
                >
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="knoll-btn-primary flex w-full items-center justify-center gap-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Lock className="h-4 w-4" aria-hidden="true" />
                {submitting ? "Entrando..." : "Entrar no painel"}
              </button>

              {isLocalSampleServer && (
                <p className="rounded-xl border border-[#00000020] bg-[#D0F0C0] px-3.5 py-2.5 text-xs text-[#2D2D2D]">
                  Modo local ativo com 40 amostras salvas neste computador.
                  Informe qualquer e-mail e senha para abrir.
                </p>
              )}

              <details className="pt-1 text-xs text-[#5C5559]">
                <summary className="flex cursor-pointer items-center gap-1.5 font-bold select-none hover:text-[#2D2D2D]">
                  <Server className="h-3.5 w-3.5" aria-hidden="true" />
                  Configurar servidor PocketBase
                </summary>
                <div className="mt-3">
                  <label
                    htmlFor="pb-url"
                    className="mb-1.5 block text-xs font-bold text-[#2D2D2D]"
                  >
                    Endereço do servidor
                  </label>
                  <input
                    type="url"
                    id="pb-url"
                    name="pbUrl"
                    spellCheck={false}
                    value={pbUrl}
                    onChange={(e) => setPbUrl(e.target.value)}
                    placeholder="https://pb.victorbernardes.me"
                    className="knoll-input w-full px-3 py-2 font-mono text-xs"
                  />
                  <p className="mt-1.5 text-xs text-[#5C5559]">
                    Compatível com contas de usuário e administrador do
                    PocketBase.
                  </p>
                </div>
              </details>
            </form>
          </div>
        </section>

        <aside
          aria-label="Exemplo visual de ficha de imóvel em Joinville"
          className="hidden md:block"
        >
          <div className="grid grid-cols-12 gap-5">
            <div className="knoll-card col-span-8 p-5">
              <div className="flex items-center justify-between gap-2 border-b border-[#00000020] pb-3">
                <div>
                  <p className="text-xs text-[#5C5559]">Ficha de vistoria</p>
                  <p className="text-base font-bold text-[#2D2D2D]">
                    Apartamento no Bairro América
                  </p>
                </div>
                <span className="rounded-lg border border-[#00000020] bg-[#D0F0C0] px-2.5 py-1 font-mono text-xs font-medium text-[#2D2D2D]">
                  R$ 34,46/m²
                </span>
              </div>

              <div className="my-4 grid grid-cols-2 divide-x divide-[#00000020] rounded-xl border border-[#00000020] bg-[#FFFDFD]">
                <div className="p-3">
                  <span className="block text-xs text-[#5C5559]">
                    Total mensal
                  </span>
                  <span className="font-mono text-xl font-bold text-[#2D2D2D]">
                    R$ 2.550
                  </span>
                </div>
                <div className="grid grid-cols-2 divide-x divide-[#00000020]">
                  <div className="p-3">
                    <span className="block text-xs text-[#5C5559]">Aluguel</span>
                    <span className="font-mono text-sm font-bold text-[#2D2D2D]">
                      R$ 2.100
                    </span>
                  </div>
                  <div className="p-3">
                    <span className="block text-xs text-[#5C5559]">Cond.+IPTU</span>
                    <span className="font-mono text-sm font-bold text-[#2D2D2D]">
                      R$ 450
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-4 divide-x divide-[#00000020] rounded-lg border border-[#00000020] text-center font-mono text-xs">
                <div className="py-2">74 m²</div>
                <div className="py-2">2 qto</div>
                <div className="py-2">1 bnh</div>
                <div className="py-2">1 vg</div>
              </div>
            </div>

            <div className="knoll-card col-span-4 flex flex-col justify-between bg-[#CBE4F0] p-5">
              <div className="flex items-center justify-between">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#00000020] bg-[#FFFDFD]">
                  <KeyRound
                    className="h-4 w-4 text-[#2D2D2D]"
                    aria-hidden="true"
                  />
                </span>
                <span className="font-mono text-xs text-[#2D2D2D]">#204</span>
              </div>
              <div className="my-3">
                <p className="text-sm font-bold text-[#2D2D2D]">
                  Chave disponível
                </p>
                <p className="text-xs text-[#5C5559]">
                  Comparação rápida de custos sem taxas ocultas.
                </p>
              </div>
            </div>

            <div className="knoll-card col-span-12 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-bold text-[#2D2D2D]">
                  <MapPin className="h-4 w-4 text-[#5C5559]" aria-hidden="true" />
                  <span>Bairros acompanhados</span>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="rounded-lg border border-[#00000020] bg-[#E6E6FA] px-2.5 py-1">
                    América
                  </span>
                  <span className="rounded-lg border border-[#00000020] bg-[#F6D0D6] px-2.5 py-1">
                    Atiradores
                  </span>
                  <span className="rounded-lg border border-[#00000020] bg-[#D0F0C0] px-2.5 py-1">
                    Saguaçu
                  </span>
                  <span className="rounded-lg border border-[#00000020] bg-[#CBE4F0] px-2.5 py-1">
                    Costa e Silva
                  </span>
                </div>
              </div>

              <div className="mt-4 border-t border-[#00000020] pt-3">
                <div className="flex items-center justify-between font-mono text-[11px] text-[#5C5559]">
                  <span className="inline-flex items-center gap-1.5">
                    <Ruler className="h-3.5 w-3.5" aria-hidden="true" />
                    Escala 1:100
                  </span>
                  <span>0</span>
                  <span>2</span>
                  <span>4</span>
                  <span>6</span>
                  <span>8</span>
                  <span>10</span>
                  <span>12 cm</span>
                </div>
                <div
                  aria-hidden="true"
                  className="mt-1.5 h-2 w-full rounded-sm border border-[#00000020]"
                  style={{
                    backgroundImage:
                      "repeating-linear-gradient(90deg, rgba(45,45,45,0.45) 0 1px, transparent 1px 12px)",
                  }}
                />
              </div>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
