import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";

export interface KnollMultiSelectOption {
  value: string;
  label: string;
  count?: number;
}

interface KnollMultiSelectProps {
  id?: string;
  label: string;
  values: string[];
  options: KnollMultiSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  onChange: (values: string[]) => void;
}

function normalizeText(str: string): string {
  return str
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

export function KnollMultiSelect({
  id,
  label,
  values,
  options,
  placeholder = "Todos",
  searchPlaceholder = "Filtrar...",
  onChange,
}: KnollMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const generatedId = useId();
  const triggerId = id ?? `${generatedId}-trigger`;
  const labelId = `${generatedId}-label`;
  const listboxId = `${generatedId}-listbox`;

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const selectedSet = useMemo(() => new Set(values), [values]);

  const filteredOptions = useMemo(() => {
    const q = normalizeText(query.trim());
    if (!q) return options;
    return options.filter((opt) => normalizeText(opt.label).includes(q));
  }, [options, query]);

  function toggleValue(val: string) {
    if (selectedSet.has(val)) {
      onChange(values.filter((v) => v !== val));
    } else {
      onChange([...values, val]);
    }
  }

  const labelByValue = useMemo(
    () => new Map(options.map((opt) => [opt.value, opt.label])),
    [options],
  );

  let triggerSummary = placeholder;
  if (values.length === 1) {
    const first = values[0] ?? "";
    triggerSummary = labelByValue.get(first) ?? first;
  } else if (values.length > 1) {
    const first = values[0] ?? "";
    const firstLabel = labelByValue.get(first) ?? first;
    triggerSummary = `${firstLabel} (+${values.length - 1})`;
  }

  return (
    <div ref={containerRef} className="relative">
      <label
        id={labelId}
        htmlFor={triggerId}
        className="mb-1.5 block text-sm font-bold tracking-[0.01em] text-[#2D2D2D]"
      >
        {label}
      </label>

      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-labelledby={`${labelId} ${triggerId}`}
        onClick={() => setOpen((prev) => !prev)}
        className="knoll-input flex w-full items-center justify-between gap-2 px-3.5 py-2 text-left text-sm text-[#2D2D2D]"
      >
        <span className="truncate">{triggerSummary}</span>
        <span className="flex shrink-0 items-center gap-1.5">
          {values.length > 0 && (
            <span className="rounded-md border border-[#00000020] bg-[#CBE4F0] px-1.5 py-0.5 font-mono text-[11px] font-bold text-[#2D2D2D]">
              {values.length}
            </span>
          )}
          <ChevronDown
            className={`h-4 w-4 text-[#5C5559] transition-transform duration-200 ease-out ${
              open ? "rotate-180" : ""
            }`}
            aria-hidden="true"
          />
        </span>
      </button>

      {open && (
        <div className="knoll-menu-enter absolute left-0 z-[200] mt-1.5 w-full min-w-[240px] rounded-xl border border-[#00000020] bg-[#FFFDFD] p-2 shadow-[0_12px_32px_rgba(45,45,45,0.14)]">
          {options.length > 6 && (
            <div className="relative mb-2">
              <Search
                className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-[#5C5559]"
                aria-hidden="true"
              />
              <input
                type="search"
                aria-label={searchPlaceholder}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="knoll-input w-full !min-h-0 py-1.5 pr-2.5 pl-8 text-xs placeholder:text-[#5C5559]/70"
              />
            </div>
          )}

          {values.length > 0 && (
            <div className="mb-1.5 flex items-center justify-between border-b border-[#00000020] px-1 pb-1.5 text-xs">
              <span className="font-mono text-[#5C5559]">
                {values.length} selecionado{values.length > 1 ? "s" : ""}
              </span>
              <button
                type="button"
                onClick={() => onChange([])}
                className="inline-flex items-center gap-1 font-bold text-[#2D2D2D] hover:underline"
              >
                <X className="h-3 w-3" aria-hidden="true" />
                Limpar
              </button>
            </div>
          )}

          <div
            id={listboxId}
            role="listbox"
            aria-multiselectable="true"
            aria-labelledby={labelId}
            className="max-h-60 overflow-y-auto pr-0.5"
          >
            {filteredOptions.length === 0 ? (
              <p className="px-2.5 py-3 text-center text-xs text-[#5C5559]">
                Nenhum bairro encontrado.
              </p>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = selectedSet.has(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => toggleValue(opt.value)}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors duration-150 ${
                      isSelected
                        ? "bg-[#CBE4F0]/75 font-bold text-[#2D2D2D]"
                        : "text-[#2D2D2D] hover:bg-[#E6E6FA]"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border border-[#00000020] ${
                        isSelected ? "bg-[#CBE4F0]" : "bg-[#FFFDFD]"
                      }`}
                    >
                      {isSelected && <Check className="h-3 w-3 text-[#2D2D2D]" />}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{opt.label}</span>
                    {typeof opt.count === "number" && (
                      <span className="shrink-0 font-mono text-xs font-normal text-[#5C5559]">
                        {opt.count}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
