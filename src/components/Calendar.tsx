import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { useApp } from "@/app/context";
import { backend } from "@/lib";
import { firstDayOfWeek, formatMonth, monthGrid, parseISODate } from "@/lib/dates";
import { cn } from "@/lib/utils";

interface Props {
  selected: string;
  onSelect(date: string): void;
}

const weekStart = firstDayOfWeek();
const WEEKDAY_LABELS = Array.from({ length: 7 }, (_, i) => {
  // 2023-01-01 was a Sunday
  const d = new Date(2023, 0, 1 + ((i + weekStart) % 7));
  return d.toLocaleDateString(undefined, { weekday: "narrow" });
});

export function Calendar({ selected, onSelect }: Props) {
  const { today, daysVersion } = useApp();
  const sel = parseISODate(selected);
  const [view, setView] = useState({ year: sel.getFullYear(), month: sel.getMonth() + 1 });
  const [withEntries, setWithEntries] = useState<Set<string>>(new Set());

  // Follow the selected day when it moves to another month (prev/next day, go to date).
  useEffect(() => {
    setView({ year: sel.getFullYear(), month: sel.getMonth() + 1 });
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  useEffect(() => {
    let live = true;
    backend
      .listDays(view.year, view.month)
      .then((days) => live && setWithEntries(new Set(days)))
      .catch(() => live && setWithEntries(new Set()));
    return () => {
      live = false;
    };
  }, [view, daysVersion]);

  const shift = (delta: number) =>
    setView(({ year, month }) => {
      const d = new Date(year, month - 1 + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() + 1 };
    });

  const weeks = monthGrid(view.year, view.month, weekStart);

  return (
    <div className="select-none px-1">
      <div className="mb-1.5 flex items-center justify-between px-1">
        <span className="text-[13px] font-medium">{formatMonth(view.year, view.month)}</span>
        <span className="flex">
          <NavButton label="Previous month" onClick={() => shift(-1)}>
            <ChevronLeft size={14} />
          </NavButton>
          <NavButton label="Next month" onClick={() => shift(1)}>
            <ChevronRight size={14} />
          </NavButton>
        </span>
      </div>
      <div className="grid grid-cols-7 text-center text-[11px] text-muted">
        {WEEKDAY_LABELS.map((l, i) => (
          <div key={i} className="py-1">
            {l}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {weeks.flat().map((date, i) =>
          date ? (
            <button
              key={date}
              onClick={() => onSelect(date)}
              aria-label={date}
              aria-current={date === selected ? "date" : undefined}
              className={cn(
                "relative mx-auto flex h-7 w-7 items-center justify-center rounded-md text-[12px] tabular-nums transition-colors duration-100",
                date === selected ? "bg-accent text-accent-fg" : "hover:bg-chrome-hover",
                date === today && date !== selected && "font-semibold text-accent",
              )}
            >
              {Number(date.slice(8))}
              {withEntries.has(date) && (
                <span
                  className={cn(
                    "absolute bottom-[3px] h-[3px] w-[3px] rounded-full",
                    date === selected ? "bg-accent-fg" : "bg-muted",
                  )}
                />
              )}
            </button>
          ) : (
            <span key={`pad-${i}`} />
          ),
        )}
      </div>
    </div>
  );
}

function NavButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick(): void;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex h-6 w-6 items-center justify-center rounded text-muted transition-colors duration-100 hover:bg-chrome-hover hover:text-fg"
    >
      {children}
    </button>
  );
}
