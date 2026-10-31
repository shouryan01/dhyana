import { Clock as ClockIcon } from "lucide-react";
import { type KeyboardEvent, useCallback } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatAt } from "@/lib/mood";
import { formatClock, from12, parseClock, to12, uses12Hour } from "@/lib/time";
import { cn } from "@/lib/utils";

const HOURS_12 = Array.from({ length: 12 }, (_, i) => i + 1);
const HOURS_24 = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);

const OPTION =
  "flex h-7 w-full shrink-0 items-center justify-center rounded-md text-[13px] tabular-nums outline-none transition-colors duration-100 hover:bg-chrome-hover focus-visible:ring-2 focus-visible:ring-ring/60 aria-selected:bg-primary aria-selected:font-medium aria-selected:text-primary-foreground aria-selected:hover:bg-primary";

/** Scrolls a column so its selected option is in the middle, once, when the popover opens. */
function useCenterSelected() {
  return useCallback((el: HTMLElement | null) => {
    const sel = el?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (el && sel) el.scrollTop = sel.offsetTop - el.clientHeight / 2 + sel.clientHeight / 2;
  }, []);
}

function Column<T extends number>({
  label,
  values,
  selected,
  show,
  onPick,
}: {
  label: string;
  values: readonly T[];
  selected: T;
  show(v: T): string;
  onPick(v: T): void;
}) {
  const center = useCenterSelected();
  const move = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const d = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const next = values[Math.min(values.length - 1, Math.max(0, i + d))];
    onPick(next);
    // The new option is selected on the next render; follow it with focus.
    const column = e.currentTarget.parentElement;
    requestAnimationFrame(() =>
      column?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus(),
    );
  };
  return (
    <div
      ref={center}
      role="listbox"
      aria-label={label}
      className="relative flex max-h-[196px] w-[52px] flex-col gap-0.5 overflow-y-auto pr-0.5"
    >
      {values.map((v, i) => (
        <button
          key={v}
          type="button"
          role="option"
          aria-selected={v === selected}
          tabIndex={v === selected ? 0 : -1}
          onClick={() => onPick(v)}
          onKeyDown={(e) => move(e, i)}
          className={OPTION}
        >
          {show(v)}
        </button>
      ))}
    </div>
  );
}

/**
 * A time of day, picked from hour and minute columns (and AM/PM on a 12-hour clock) in a small
 * popover that matches the rest of the app. The value is local `HH:MM`.
 */
export function TimePicker({
  value,
  onChange,
  className,
  twelveHour = uses12Hour(),
}: {
  value: string;
  onChange(value: string): void;
  className?: string;
  twelveHour?: boolean;
}) {
  const clock = parseClock(value);
  const { h: h12, pm } = to12(clock.h);
  const set = (next: Partial<{ h24: number; m: number }>) =>
    onChange(formatClock({ h: next.h24 ?? clock.h, m: next.m ?? clock.m }));

  return (
    <Popover>
      <PopoverTrigger
        aria-label={`Time, ${formatAt(value)}`}
        className={cn(
          "inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-popover/80 pr-3 pl-2 text-[12px] tabular-nums text-foreground transition-colors duration-100 outline-none hover:bg-chrome-hover focus-visible:ring-2 focus-visible:ring-ring/60 data-popup-open:bg-chrome-hover",
          className,
        )}
      >
        <ClockIcon size={13} aria-hidden="true" className="shrink-0 text-muted-foreground" />
        <span className="whitespace-nowrap">{formatAt(value)}</span>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-auto flex-row gap-1 p-1.5">
        {twelveHour ? (
          <>
            <Column
              label="Hour"
              values={HOURS_12}
              selected={h12}
              show={String}
              onPick={(h) => set({ h24: from12(h, pm) })}
            />
            <Column
              label="Minute"
              values={MINUTES}
              selected={clock.m}
              show={(m) => String(m).padStart(2, "0")}
              onPick={(m) => set({ m })}
            />
            <Column
              label="AM or PM"
              values={[0, 1] as const}
              selected={pm ? 1 : 0}
              show={(v) => (v ? "PM" : "AM")}
              onPick={(v) => set({ h24: from12(h12, v === 1) })}
            />
          </>
        ) : (
          <>
            <Column
              label="Hour"
              values={HOURS_24}
              selected={clock.h}
              show={(h) => String(h).padStart(2, "0")}
              onPick={(h24) => set({ h24 })}
            />
            <Column
              label="Minute"
              values={MINUTES}
              selected={clock.m}
              show={(m) => String(m).padStart(2, "0")}
              onPick={(m) => set({ m })}
            />
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
