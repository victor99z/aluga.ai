import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown } from "lucide-react";

export interface KnollSelectOption {
  value: string | number;
  label: string;
  count?: number;
}

interface KnollSelectProps {
  id?: string;
  label?: string;
  ariaLabel?: string;
  value: string | number;
  options: KnollSelectOption[];
  onChange: (value: string) => void;
  mono?: boolean;
  className?: string;
}

export function KnollSelect({
  id,
  label,
  ariaLabel,
  value,
  options,
  onChange,
  mono = false,
  className = "",
}: KnollSelectProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const generatedId = useId();
  const triggerId = id ?? `${generatedId}-trigger`;
  const labelId = `${generatedId}-label`;
  const listboxId = `${generatedId}-listbox`;

  const selectedIndex = Math.max(
    0,
    options.findIndex((opt) => String(opt.value) === String(value)),
  );
  const selectedOption = options[selectedIndex];

  useEffect(() => {
    if (!open) return;

    setActiveIndex(selectedIndex);

    const handlePointerDown = (event: PointerEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
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
  }, [open, selectedIndex]);

  function selectOption(opt: KnollSelectOption) {
    onChange(String(opt.value));
    setOpen(false);
    triggerRef.current?.focus();
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (options.length === 0) return;

    if (!open) {
      if (
        event.key === "ArrowDown" ||
        event.key === "ArrowUp" ||
        event.key === "Enter" ||
        event.key === " "
      ) {
        event.preventDefault();
        setActiveIndex(selectedIndex);
        setOpen(true);
      }
      return;
    }

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActiveIndex((prev) =>
          prev >= options.length - 1 ? 0 : prev + 1,
        );
        break;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex((prev) =>
          prev <= 0 ? options.length - 1 : prev - 1,
        );
        break;
      case "Home":
        event.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        event.preventDefault();
        setActiveIndex(options.length - 1);
        break;
      case "Enter":
      case " ": {
        event.preventDefault();
        const highlighted = options[activeIndex];
        if (highlighted) selectOption(highlighted);
        break;
      }
      case "Tab":
        setOpen(false);
        break;
    }
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {label && (
        <label
          id={labelId}
          htmlFor={triggerId}
          className="mb-1.5 block text-sm font-bold tracking-[0.01em] text-[#2D2D2D]"
        >
          {label}
        </label>
      )}

      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-labelledby={label ? `${labelId} ${triggerId}` : undefined}
        aria-label={!label ? ariaLabel : undefined}
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={handleTriggerKeyDown}
        className={`knoll-input flex w-full items-center justify-between gap-2 px-3.5 py-2 text-left text-sm font-normal text-[#2D2D2D] ${
          mono ? "font-mono" : ""
        }`}
      >
        <span className="truncate">{selectedOption?.label ?? "Selecionar"}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-[#5C5559] transition-transform duration-200 ease-out ${
            open ? "rotate-180" : ""
          }`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          id={listboxId}
          role="listbox"
          aria-labelledby={label ? labelId : undefined}
          aria-label={!label ? ariaLabel : undefined}
          className="knoll-menu-enter absolute left-0 z-[200] mt-1.5 max-h-64 w-full min-w-[180px] overflow-y-auto rounded-xl border border-[#00000020] bg-[#FFFDFD] p-1.5 shadow-[0_12px_32px_rgba(45,45,45,0.14)]"
        >
          {options.map((opt, idx) => {
            const isSelected = String(opt.value) === String(value);
            const isHighlighted = idx === activeIndex;

            return (
              <button
                key={String(opt.value)}
                type="button"
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setActiveIndex(idx)}
                onClick={() => selectOption(opt)}
                className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors duration-150 ${
                  mono ? "font-mono" : ""
                } ${
                  isSelected
                    ? "bg-[#CBE4F0] font-bold text-[#2D2D2D]"
                    : isHighlighted
                      ? "bg-[#E6E6FA] text-[#2D2D2D]"
                      : "text-[#2D2D2D] hover:bg-[#E6E6FA]"
                }`}
              >
                <span className="min-w-0 flex-1 truncate">{opt.label}</span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {typeof opt.count === "number" && (
                    <span className="font-mono text-xs font-normal text-[#5C5559]">
                      {opt.count}
                    </span>
                  )}
                  {isSelected && (
                    <Check
                      className="h-4 w-4 text-[#2D2D2D]"
                      aria-hidden="true"
                    />
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
