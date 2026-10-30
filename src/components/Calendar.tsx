import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/app/context";
import { CalendarYears, MonthYearCaption } from "@/components/CalendarCaption";
import { Calendar as DayPicker } from "@/components/ui/calendar";
import { backend } from "@/lib";
import { firstDayOfWeek, parseISODate, toISODate } from "@/lib/dates";
import { valenceBucket } from "@/lib/mood";
import type { DayStat } from "@/lib/schema";

interface Props {
  selected: string;
  onSelect(date: string): void;
}

const weekStartsOn = firstDayOfWeek() as 0 | 1 | 2 | 3 | 4 | 5 | 6;
const firstOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);

const pad = (n: number) => String(n).padStart(2, "0");

/** The day-cell class for each mood bucket; the colours are `--dot` values in `index.css`. */
const MOOD_CLASSES = {
  moodN2: "mood-dot-n2",
  moodN1: "mood-dot-n1",
  mood0: "mood-dot-0",
  moodP1: "mood-dot-p1",
  moodP2: "mood-dot-p2",
} as const;
const MOOD_KEYS = ["moodN2", "moodN1", "mood0", "moodP1", "moodP2"] as const;

/**
 * The sidebar month: shadcn's Calendar, with a dot under every day that has a note. Days with
 * mood check-ins get their dot in the day's average mood colour.
 */
export function Calendar({ selected, onSelect }: Props) {
  const { today, daysVersion, entitiesVersion } = useApp();
  const sel = useMemo(() => parseISODate(selected), [selected]);
  const [month, setMonth] = useState(() => firstOfMonth(sel));
  const [stats, setStats] = useState<DayStat[]>([]);
  const [journalYears, setJournalYears] = useState<number[]>([]);

  // Follow the selected day when it moves to another month (prev/next day, go to date).
  useEffect(() => {
    setMonth(firstOfMonth(sel));
  }, [sel]);

  useEffect(() => {
    let live = true;
    const y = month.getFullYear();
    const m = pad(month.getMonth() + 1);
    backend
      .dayStats(`${y}-${m}-01`, `${y}-${m}-31`)
      .then((s) => live && setStats(s))
      .catch(() => live && setStats([]));
    return () => {
      live = false;
    };
  }, [month, daysVersion, entitiesVersion]);

  const modifiers = useMemo(() => {
    const out: Record<string, Date[]> = { hasEntry: stats.map((s) => parseISODate(s.date)) };
    for (const k of MOOD_KEYS) out[k] = [];
    for (const s of stats) {
      if (s.valence !== null)
        out[MOOD_KEYS[valenceBucket(s.valence) + 2]].push(parseISODate(s.date));
    }
    return out;
  }, [stats]);

  useEffect(() => {
    let live = true;
    backend
      .listYears()
      .then((ys) => live && setJournalYears(ys))
      .catch(() => live && setJournalYears([]));
    return () => {
      live = false;
    };
  }, [daysVersion]);

  // Years with a journal folder, plus the ones you are looking at or standing in.
  const years = useMemo(
    () =>
      [
        ...new Set([
          ...journalYears,
          parseISODate(today).getFullYear(),
          sel.getFullYear(),
          month.getFullYear(),
        ]),
      ].sort((a, b) => a - b),
    [journalYears, today, sel, month],
  );

  return (
    <CalendarYears.Provider value={years}>
      <DayPicker
        mode="single"
        required
        selected={sel}
        onSelect={(d) => onSelect(toISODate(d))}
        month={month}
        onMonthChange={setMonth}
        today={parseISODate(today)}
        weekStartsOn={weekStartsOn}
        showOutsideDays={false}
        formatters={{
          formatWeekdayName: (d) => d.toLocaleDateString(undefined, { weekday: "narrow" }),
        }}
        components={{ MonthCaption: MonthYearCaption }}
        modifiers={modifiers}
        modifiersClassNames={{
          hasEntry:
            "after:pointer-events-none after:absolute after:z-20 after:bottom-[3px] after:left-1/2 after:size-[var(--dot-size,3px)] after:-translate-x-1/2 after:rounded-full after:bg-[var(--dot,var(--muted-foreground))] after:content-[''] data-[selected=true]:after:bg-primary-foreground",
          ...MOOD_CLASSES,
        }}
        className="w-full select-none bg-transparent p-0 px-1 tabular-nums [--cell-size:--spacing(7)] [&_nav_button]:pointer-events-auto [&_nav_button]:size-6 [&_nav_button]:text-muted-foreground [&_nav_button]:hover:text-foreground [&_td_button]:border-0! [&_td_button]:ring-0! [&_td_button]:shadow-none! [&_td_button]:focus-visible:outline-2 [&_td_button]:focus-visible:outline-offset-1 [&_td_button]:focus-visible:outline-primary/70 [&_td_button]:mx-auto [&_td_button]:w-7 [&_td_button]:min-w-7 [&_td_button]:text-[12px]"
        // These replace (not merge with) the component's defaults, so structural classes are repeated.
        classNames={{
          root: "w-full",
          month: "flex w-full flex-col gap-1.5",
          month_caption: "flex h-6 w-full items-center justify-start gap-0.5",
          caption_label: "text-[13px] font-medium select-none",
          // The bar spans the header row; only its arrows take clicks, so the month and year stay reachable.
          nav: "pointer-events-none absolute inset-x-0 top-0 flex h-6 w-full items-center justify-end pr-1",
          weekday:
            "flex-1 rounded-md pt-1 pb-0.5 text-[11px] font-normal text-muted-foreground select-none",
          week: "mt-0.5 flex w-full",
          day: "group/day relative h-7 w-full p-0 text-center select-none",
          today: "font-semibold text-primary",
        }}
      />
    </CalendarYears.Provider>
  );
}
