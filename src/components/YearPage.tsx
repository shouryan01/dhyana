import { useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/app/context";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { backend } from "@/lib";
import { addDays, firstDayOfWeek, formatShort, parseISODate } from "@/lib/dates";
import { averageValence, bucketColor, valenceBucket, valenceLabel } from "@/lib/mood";
import type { DayStat } from "@/lib/schema";
import { cn } from "@/lib/utils";

export type YearView = "words" | "entries" | "mood";
const VIEWS: [YearView, string][] = [
  ["words", "Words"],
  ["entries", "Entries"],
  ["mood", "Mood"],
];

const CELL = 11;
const GAP = 2;
const weekStart = firstDayOfWeek();

/** Sequential steps of the accent over the surface: one hue, light to dark (dark to light in dark mode). */
const HEAT = [30, 55, 80, 100].map(
  (p) => `color-mix(in oklab, var(--primary) ${p}%, var(--surface))`,
);
const EMPTY = "var(--muted)";
/**
 * A day written on but without a check-in, in the mood view: an empty cell with an outline, so
 * it can't be mistaken for the neutral grey of the mood scale.
 */
const NO_MOOD_RING =
  "inset 0 0 0 1px color-mix(in oklab, var(--muted-foreground) 55%, transparent)";

/** Upper bounds of the first three word levels: the quartiles of the year's non-empty days. */
function quartiles(stats: DayStat[]): [number, number, number] {
  const w = stats
    .map((s) => s.words)
    .filter((n) => n > 0)
    .sort((a, b) => a - b);
  if (!w.length) return [0, 0, 0];
  const q = (f: number) => w[Math.min(w.length - 1, Math.floor(f * w.length))];
  return [q(0.25), q(0.5), q(0.75)];
}

function streaks(dates: Set<string>, year: number, today: string) {
  let longest = 0;
  let run = 0;
  for (let d = `${year}-01-01`; d <= `${year}-12-31`; d = addDays(d, 1)) {
    run = dates.has(d) ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  let current = 0;
  for (let d = dates.has(today) ? today : addDays(today, -1); dates.has(d); d = addDays(d, -1))
    current++;
  return { longest, current };
}

/**
 * The year at a glance: a GitHub-style grid of days, coloured by words written, by whether
 * there's an entry, or by the day's average mood. Click a day to open it; arrow keys move.
 */
export function YearPage({ year, view }: { year: number; view: YearView }) {
  const app = useApp();
  const navigate = useNavigate();
  const [stats, setStats] = useState<DayStat[] | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const grid = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    backend
      .dayStats(`${year}-01-01`, `${year}-12-31`)
      .then((s) => live && setStats(s))
      .catch(() => live && setStats([]));
    return () => {
      live = false;
    };
  }, [year, app.entitiesVersion, app.daysVersion]);

  const byDate = useMemo(() => new Map((stats ?? []).map((s) => [s.date, s])), [stats]);
  const levels = useMemo(() => quartiles(stats ?? []), [stats]);

  // Columns are weeks; the first starts on the locale's first weekday on or before Jan 1.
  const weeks = useMemo(() => {
    const jan1 = parseISODate(`${year}-01-01`);
    let d = addDays(`${year}-01-01`, -((jan1.getDay() - weekStart + 7) % 7));
    const out: (string | null)[][] = [];
    while (d <= `${year}-12-31`) {
      const week: (string | null)[] = [];
      for (let i = 0; i < 7; i++) {
        week.push(d.startsWith(`${year}-`) ? d : null);
        d = addDays(d, 1);
      }
      out.push(week);
    }
    return out;
  }, [year]);

  const colorOf = (date: string): string => {
    const s = byDate.get(date);
    if (!s) return EMPTY;
    if (view === "entries") return HEAT[2];
    if (view === "mood") return s.valence === null ? EMPTY : bucketColor(valenceBucket(s.valence));
    const [a, b, c] = levels;
    return HEAT[s.words <= a ? 0 : s.words <= b ? 1 : s.words <= c ? 2 : 3];
  };

  const describe = (date: string): string => {
    const s = byDate.get(date);
    if (!s) return `${formatShort(date)}: no entry`;
    const parts = [`${s.words.toLocaleString()} ${s.words === 1 ? "word" : "words"}`];
    if (s.valence !== null)
      parts.push(
        `${valenceLabel(s.valence)} (${s.checkins} ${s.checkins === 1 ? "check-in" : "check-ins"})`,
      );
    return `${formatShort(date)}: ${parts.join(", ")}`;
  };

  const days = useMemo(() => new Set((stats ?? []).map((s) => s.date)), [stats]);
  const totalWords = (stats ?? []).reduce((n, s) => n + s.words, 0);
  const { longest, current } = streaks(days, year, app.today);
  const moods = (stats ?? []).filter((s) => s.valence !== null);
  const avgMood = averageValence(
    moods.map((s) => ({ at: "00:00", valence: s.valence!, emotions: [], factors: [] })),
  );

  const months = useMemo(() => {
    const out: { col: number; label: string }[] = [];
    weeks.forEach((w, col) => {
      const first = w.find((d) => d?.endsWith("-01"));
      if (first)
        out.push({
          col,
          label: parseISODate(first).toLocaleDateString(undefined, { month: "short" }),
        });
    });
    return out;
  }, [weeks]);

  const go = (date: string) => navigate({ to: "/day/$date", params: { date } });
  const setYear = (y: number) =>
    navigate({ to: "/year", search: { year: y, view }, replace: true });
  const setView = (v: YearView) =>
    navigate({ to: "/year", search: { year, view: v }, replace: true });

  const tabStop = focus ?? (app.today.startsWith(`${year}-`) ? app.today : `${year}-01-01`);

  const moveFocus = (delta: number) => {
    const next = addDays(tabStop, delta);
    if (!next.startsWith(`${year}-`)) return;
    setFocus(next);
    grid.current?.querySelector<HTMLElement>(`[data-date="${next}"]`)?.focus();
  };

  const shown = hover ?? focus;
  const shownPos = shown ? weeks.findIndex((w) => w.includes(shown)) : -1;

  const weekdayLabel = (row: number) =>
    parseISODate(addDays("2024-01-07", (weekStart + row) % 7)).toLocaleDateString(undefined, {
      weekday: "short",
    });

  return (
    <div className="h-full overflow-y-auto">
      <div className="anim-fade mx-auto w-full max-w-[780px] px-8 pb-24 pt-14 select-none">
        <header className="mb-6 flex items-center gap-3">
          <h1 className="text-[22px] font-semibold tracking-tight">{year}</h1>
          <div className="flex items-center">
            <button
              type="button"
              aria-label="Previous year"
              onClick={() => setYear(year - 1)}
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-chrome-hover hover:text-foreground"
            >
              <ChevronLeft size={15} />
            </button>
            <button
              type="button"
              aria-label="Next year"
              onClick={() => setYear(year + 1)}
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-chrome-hover hover:text-foreground"
            >
              <ChevronRight size={15} />
            </button>
          </div>
          <div className="flex-1" />
          <ToggleGroup
            spacing={0}
            size="sm"
            aria-label="Colour days by"
            className="rounded-md border border-border bg-popover p-0.5"
            value={[view]}
            onValueChange={(v) => v[0] && setView(v[0] as YearView)}
          >
            {VIEWS.map(([id, label]) => (
              <ToggleGroupItem
                key={id}
                value={id}
                className="h-6 min-w-0 rounded-[4px]! px-2.5 text-[12px] font-normal text-muted-foreground hover:bg-transparent hover:text-foreground aria-pressed:bg-chrome-active aria-pressed:text-foreground"
              >
                {label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </header>

        <dl className="mb-8 grid grid-cols-4 gap-3">
          <Stat label="Days written" value={days.size.toLocaleString()} />
          <Stat label="Words" value={totalWords.toLocaleString()} />
          <Stat
            label="Longest streak"
            value={`${longest} ${longest === 1 ? "day" : "days"}`}
            note={app.today.startsWith(`${year}-`) && current ? `${current} now` : undefined}
          />
          <Stat
            label="Average mood"
            value={avgMood === null ? "—" : valenceLabel(avgMood)}
            note={
              moods.length
                ? `${moods.length} ${moods.length === 1 ? "day" : "days"} with check-ins`
                : undefined
            }
          />
        </dl>

        <div className="relative">
          <div className="flex" style={{ paddingLeft: 30, height: 16 }} aria-hidden="true">
            <div className="relative flex-1">
              {months.map((m) => (
                <span
                  key={m.col}
                  className="absolute text-[11px] text-muted-foreground"
                  style={{ left: m.col * (CELL + GAP) }}
                >
                  {m.label}
                </span>
              ))}
            </div>
          </div>
          <div className="flex gap-0">
            <div
              className="flex w-[30px] shrink-0 flex-col"
              style={{ gap: GAP }}
              aria-hidden="true"
            >
              {Array.from({ length: 7 }, (_, row) => (
                <span
                  key={row}
                  className="text-[10px] leading-none text-muted-foreground"
                  style={{ height: CELL, lineHeight: `${CELL}px` }}
                >
                  {row % 2 === 1 ? weekdayLabel(row) : ""}
                </span>
              ))}
            </div>
            <div
              ref={grid}
              role="group"
              aria-label={`Journal days in ${year}. Arrow keys move between days, Enter opens one.`}
              className="relative flex"
              style={{ gap: GAP }}
              onPointerLeave={() => setHover(null)}
            >
              {weeks.map((w, col) => (
                <div key={col} className="flex flex-col" style={{ gap: GAP }}>
                  {w.map((d, row) =>
                    d ? (
                      <button
                        key={d}
                        type="button"
                        data-date={d}
                        tabIndex={d === tabStop ? 0 : -1}
                        aria-label={describe(d)}
                        onClick={() => go(d)}
                        onFocus={() => setFocus(d)}
                        onBlur={() => setFocus(null)}
                        onPointerEnter={() => setHover(d)}
                        onKeyDown={(e) => {
                          const step = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -7, ArrowRight: 7 }[
                            e.key
                          ];
                          if (step) {
                            e.preventDefault();
                            moveFocus(step);
                          }
                        }}
                        className={cn(
                          "rounded-[3px] outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-surface",
                          d === app.today && "ring-1 ring-foreground/50",
                        )}
                        style={{
                          width: CELL,
                          height: CELL,
                          background: colorOf(d),
                          boxShadow:
                            view === "mood" && byDate.get(d)?.valence === null
                              ? NO_MOOD_RING
                              : undefined,
                        }}
                      />
                    ) : (
                      <span key={`pad-${row}`} style={{ width: CELL, height: CELL }} />
                    ),
                  )}
                </div>
              ))}
              {shown && shownPos >= 0 && (
                <div
                  role="status"
                  className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-md border border-border bg-popover px-2 py-1 text-[11px] whitespace-nowrap shadow-md"
                  style={{
                    left: Math.min(
                      Math.max(shownPos * (CELL + GAP) + CELL / 2, 90),
                      weeks.length * (CELL + GAP) - 90,
                    ),
                    top: -30,
                  }}
                >
                  {describe(shown)}
                </div>
              )}
            </div>
          </div>
          <Legend view={view} />
        </div>
        <p className="mt-6 text-[12px] text-muted-foreground">
          {view === "words"
            ? "Each step is a quarter of the days you wrote this year, by length."
            : view === "mood"
              ? "Each day's colour is the average of its check-ins. Outlined squares have an entry but no check-in."
              : "Every day with an entry."}{" "}
          Counted from the files in your vault.
        </p>
        {stats !== null && stats.length === 0 && (
          <p className="mt-2 text-[13px] text-muted-foreground">Nothing written in {year} yet.</p>
        )}
        <SrTable stats={stats ?? []} describe={describe} year={year} />
      </div>
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-lg border border-border bg-popover/60 px-3 py-2.5">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-[17px] font-semibold">{value}</dd>
      {note && <dd className="text-[11px] text-muted-foreground">{note}</dd>}
    </div>
  );
}

function Legend({ view }: { view: YearView }) {
  const swatch = (bg: string, key: string, ring?: string) => (
    <span
      key={key}
      className="inline-block rounded-[3px]"
      style={{ width: CELL, height: CELL, background: bg, boxShadow: ring }}
    />
  );
  return (
    <div
      className="mt-3 flex items-center justify-end gap-1.5 text-[11px] text-muted-foreground"
      aria-hidden="true"
    >
      {view === "mood" ? (
        <>
          <span>Unpleasant</span>
          {[-2, -1, 0, 1, 2].map((b) => swatch(bucketColor(b), String(b)))}
          <span>Pleasant</span>
          <span className="ml-3">Entry, no check-in</span>
          {swatch(EMPTY, "none", NO_MOOD_RING)}
        </>
      ) : view === "words" ? (
        <>
          <span>Fewer words</span>
          {[EMPTY, ...HEAT].map((c, i) => swatch(c, String(i)))}
          <span>More</span>
        </>
      ) : (
        <>
          <span>No entry</span>
          {swatch(EMPTY, "none")}
          <span className="ml-2">Entry</span>
          {swatch(HEAT[2], "entry")}
        </>
      )}
    </div>
  );
}

/** The grid as a table for screen readers: the days with entries. */
function SrTable({
  stats,
  describe,
  year,
}: {
  stats: DayStat[];
  describe(date: string): string;
  year: number;
}) {
  return (
    <table className="sr-only">
      <caption>Entries in {year}</caption>
      <tbody>
        {stats.map((s) => (
          <tr key={s.date}>
            <td>{describe(s.date)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export const isYearView = (v: unknown): v is YearView =>
  v === "words" || v === "entries" || v === "mood";
