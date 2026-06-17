"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

export type DashboardSelectOption<T extends string = string> = {
  value: T;
  label: string;
  description?: string;
  disabled?: boolean;
};

type MenuPosition = {
  left: number;
  top?: number;
  bottom?: number;
  width: number;
  maxHeight: number;
  origin: string;
};

type DashboardSelectProps<T extends string = string> = {
  value: T;
  options: Array<DashboardSelectOption<T>>;
  onChange: (value: T) => void;
  id?: string;
  ariaLabel?: string;
  placeholder?: string;
  icon?: ReactNode;
  disabled?: boolean;
  className?: string;
  buttonClassName?: string;
  menuClassName?: string;
  align?: "left" | "right";
  maxMenuHeight?: number;
};

const MENU_GAP = 8;
const MIN_MENU_WIDTH = 168;

function firstEnabledIndex<T extends string>(options: Array<DashboardSelectOption<T>>) {
  return options.findIndex((option) => !option.disabled);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function DashboardSelect<T extends string = string>({
  value,
  options,
  onChange,
  id,
  ariaLabel,
  placeholder = "Select",
  icon,
  disabled = false,
  className,
  buttonClassName,
  menuClassName,
  align = "left",
  maxMenuHeight = 280,
}: DashboardSelectProps<T>) {
  const generatedId = useId().replace(/:/g, "");
  const buttonId = id ?? `dashboard-select-${generatedId}`;
  const listboxId = `${buttonId}-listbox`;
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<MenuPosition | null>(null);

  const selectedIndex = useMemo(
    () => options.findIndex((option) => option.value === value),
    [options, value],
  );
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;
  const [highlightedIndex, setHighlightedIndex] = useState(() =>
    selectedIndex >= 0 ? selectedIndex : firstEnabledIndex(options),
  );

  const updatePosition = useCallback(() => {
    const button = buttonRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const width = Math.min(Math.max(rect.width, MIN_MENU_WIDTH), Math.max(MIN_MENU_WIDTH, viewportWidth - 24));
    const maxLeft = Math.max(12, viewportWidth - width - 12);
    const left =
      align === "right"
        ? clamp(rect.right - width, 12, maxLeft)
        : clamp(rect.left, 12, maxLeft);
    const below = viewportHeight - rect.bottom - 12;
    const above = rect.top - 12;
    const opensUp = below < 180 && above > below;
    const available = Math.max(132, Math.min(maxMenuHeight, opensUp ? above - MENU_GAP : below - MENU_GAP));

    setPosition({
      left,
      width,
      maxHeight: available,
      origin: opensUp ? "bottom" : "top",
      ...(opensUp
        ? { bottom: viewportHeight - rect.top + MENU_GAP }
        : { top: rect.bottom + MENU_GAP }),
    });
  }, [align, maxMenuHeight]);

  useEffect(() => setMounted(true), []);

  useLayoutEffect(() => {
    if (open) updatePosition();
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const nextIndex = selectedIndex >= 0 ? selectedIndex : firstEnabledIndex(options);
    setHighlightedIndex(nextIndex);
  }, [open, options, selectedIndex]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, updatePosition]);

  function moveHighlight(direction: 1 | -1) {
    if (options.length === 0) return;
    let next = highlightedIndex;
    for (let i = 0; i < options.length; i += 1) {
      next = (next + direction + options.length) % options.length;
      if (!options[next]?.disabled) {
        setHighlightedIndex(next);
        return;
      }
    }
  }

  function choose(index: number) {
    const option = options[index];
    if (!option || option.disabled) return;
    onChange(option.value);
    setOpen(false);
    window.requestAnimationFrame(() => buttonRef.current?.focus());
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      moveHighlight(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      moveHighlight(-1);
    } else if (event.key === "Home" && open) {
      event.preventDefault();
      setHighlightedIndex(firstEnabledIndex(options));
    } else if (event.key === "End" && open) {
      event.preventDefault();
      for (let i = options.length - 1; i >= 0; i -= 1) {
        if (!options[i]?.disabled) {
          setHighlightedIndex(i);
          break;
        }
      }
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      choose(highlightedIndex);
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
    }
  }

  const activeOptionId =
    open && highlightedIndex >= 0 ? `${listboxId}-option-${highlightedIndex}` : undefined;

  return (
    <div className={cn("relative min-w-0", className)}>
      <button
        ref={buttonRef}
        id={buttonId}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={activeOptionId}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={onKeyDown}
        className={cn(
          "flex h-11 w-full min-w-0 items-center justify-between gap-2 rounded-xl bg-white px-3 text-left text-sm font-bold text-ink shadow-[0_12px_26px_-22px_rgba(15,23,42,0.48),0_3px_10px_-9px_rgba(15,23,42,0.18)] outline-none transition-[background-color,color,box-shadow] hover:bg-brand-50 focus:shadow-[0_0_0_3px_rgba(31,100,224,0.18),0_12px_26px_-22px_rgba(15,23,42,0.48),0_3px_10px_-9px_rgba(15,23,42,0.18)] disabled:cursor-not-allowed disabled:opacity-55",
          open && "bg-brand-50 text-brand-700",
          buttonClassName,
        )}
      >
        {icon && <span className="shrink-0 text-brand-600">{icon}</span>}
        <span className="min-w-0 flex-1 truncate">{selected?.label ?? placeholder}</span>
        <ChevronDown className={cn("size-4 shrink-0 text-muted transition-transform", open && "rotate-180 text-brand-600")} />
      </button>

      {mounted && open && position
        ? createPortal(
            <div
              ref={menuRef}
              id={listboxId}
              role="listbox"
              data-lenis-prevent
              aria-labelledby={buttonId}
              className={cn(
                "fixed z-[80] overflow-auto rounded-xl bg-white p-1.5 shadow-[0_24px_60px_rgba(7,26,51,0.18)] outline-none",
                menuClassName,
              )}
              style={{
                left: position.left,
                width: position.width,
                maxHeight: position.maxHeight,
                transformOrigin: position.origin,
                top: position.top,
                bottom: position.bottom,
              }}
            >
              {options.map((option, index) => {
                const selectedOption = option.value === value;
                const highlighted = index === highlightedIndex;
                return (
                  <button
                    key={option.value}
                    id={`${listboxId}-option-${index}`}
                    type="button"
                    role="option"
                    aria-selected={selectedOption}
                    disabled={option.disabled}
                    onMouseEnter={() => !option.disabled && setHighlightedIndex(index)}
                    onClick={() => choose(index)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-bold text-ink transition-colors disabled:cursor-not-allowed disabled:opacity-45",
                      highlighted && "bg-brand-50 text-brand-700",
                      selectedOption && "text-brand-700",
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{option.label}</span>
                      {option.description && (
                        <span className="mt-0.5 block truncate text-[11px] font-semibold text-muted">
                          {option.description}
                        </span>
                      )}
                    </span>
                    {selectedOption && <Check className="size-4 shrink-0" />}
                  </button>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
