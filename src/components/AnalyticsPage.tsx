import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/app/context";
import { ChartTip } from "@/components/ChartTip";
import { backend } from "@/lib";
import {
  analyze,
  dailyWords,
  mentionsOverTime,
  SMALL_SAMPLE,
  TIME_BUCKETS,
  WEEKDAYS,
  type Analysis,
} from "@/lib/analytics";
import { addDays, formatLong, formatMonth, formatShort } from "@/lib/dates";
import { moodColor, valenceLabel } from "@/lib/mood";
import type { AnalyticsDay } from "@/lib/schema";
import { cn } from "@/lib/utils";

/** Fewer entries than this and the charts that need a pattern say so. */
const MIN_ENTRIES = 7;

const searchLink = (q: string) => ({ to: "/search" as const, search: { q } });
const monthLabel = (m: string) => formatMonth(Number(m.slice(0, 4)), Number(m.slice(5, 7)));

/**
 * Insights: consistency, mood, people and topics, and writing style, all computed on this
 * machine from your entries. Sections say whether a number is counted from what you entered or
 * derived from it, and every chart opens the entries behind it.
 */
export function AnalyticsPage() {
  const app = useApp();
  const [days, setDays] = useState<AnalyticsDay[] | null>(null);

  useEffect(() => {
    let live = true;
    backend
      .analyticsDays()
      .then((d) => live && setDays(d))
      .catch(() => live && setDays([]));
    return () => {
      live = false;
    };
  }, [app.daysVersion, app.entitiesVersion]);

  const a = useMemo(() => (days ? analyze(days, app.today) : null), [days, app.today]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="anim-fade mx-auto max-w-[760px] px-8 pb-24 pt-14">
        <h1 className="mb-1 text-[22px] font-semibold tracking-tight">Insights</h1>
        <p className="mb-8 text-[12px] text-muted-foreground">
          Worked out on this device from your entries. Nothing here uses AI.
        </p>
        {a === null && null}
        {a && a.entries === 0 && (
          <p className="text-[13px] text-muted-foreground">
            Write a few entries and your patterns will show up here.
          </p>
        )}
        {a && days && a.entries > 0 && <Dashboard a={a} days={days} today={app.today} />}
      </div>
    </div>
  );
}

function Dashboard({ a, days, today }: { a: Analysis; days: AnalyticsDay[]; today: string }) {
  const few = a.entries < MIN_ENTRIES;
  return (
    <div className="flex flex-col gap-12">
      <ul className="grid grid-cols-4 gap-3">
        <Tile label="Entries" value={a.entries.toLocaleString()} />
        <Tile label="Words" value={a.words.toLocaleString()} />
        <Tile label="Current streak" value={`${a.streak.current}d`} />
        <Tile label="Longest streak" value={`${a.streak.longest}d`} />
      </ul>
      {few && (
        <p className="-mt-6 text-[12px] text-muted-foreground">
          Only {a.entries} {a.entries === 1 ? "entry" : "entries"} so far, so patterns below are
          thin.
        </p>
      )}

      <Consistency a={a} days={days} today={today} />
      <Mood a={a} />
      <People a={a} days={days} />
      <Style a={a} />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Building blocks

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <li className="rounded-lg border border-border bg-popover px-3 py-2.5">
      <div className="text-[20px] font-semibold tracking-tight tabular-nums">{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </li>
  );
}

type Source = "counted" | "derived";

/** Counted numbers come straight from entries; derived ones are computed from them. */
function Section({
  title,
  source,
  note,
  children,
}: {
  title: string;
  source: Source;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-6">
      <header className="flex items-baseline gap-3 border-b border-border pb-2">
        <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
        <span className="text-[11px] text-muted-foreground">
          {source === "counted" ? "counted from your entries" : "derived from your entries"}
          {note ? ` · ${note}` : ""}
        </span>
      </header>
      {children}
    </section>
  );
}

function Panel({
  title,
  hint,
  derived,
  children,
}: {
  title: string;
  hint?: string;
  derived?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="flex items-baseline gap-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {title}
        {derived && <span className="font-normal tracking-normal normal-case">derived</span>}
      </h3>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

interface Bar {
  label: string;
  value: number;
  /** The tooltip's first line (and the accessible name with `detail`). */
  heading: string;
  detail: string;
  onClick?: () => void;
}

/** Vertical bars on a zero baseline; each opens what it counts. Hover or focus shows a tooltip. */
function Bars({
  bars,
  height = 88,
  tick,
}: {
  bars: Bar[];
  height?: number;
  tick?: (b: Bar, i: number) => string | null;
}) {
  const max = Math.max(1, ...bars.map((b) => b.value));
  const [active, setActive] = useState<number | null>(null);
  const tip = active !== null ? bars[active] : null;
  return (
    <div>
      <div className="relative">
        {tip && active !== null && (
          <ChartTip
            left={`${((active + 0.5) / bars.length) * 100}%`}
            heading={tip.heading}
            detail={tip.detail}
            className="bottom-full mb-1.5"
          />
        )}
        <div
          className="flex items-end gap-px"
          style={{ height }}
          role="list"
          onMouseLeave={() => setActive(null)}
        >
          {bars.map((b, i) => (
            <button
              key={i}
              type="button"
              role="listitem"
              aria-label={`${b.heading}: ${b.detail}`}
              onClick={b.onClick}
              disabled={!b.onClick}
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              className="group flex h-full min-w-0 flex-1 items-end focus-visible:outline-none"
            >
              <span
                className={cn(
                  "w-full rounded-t-[2px] bg-primary/60 transition-colors duration-100 group-hover:bg-primary group-focus-visible:bg-primary",
                  b.value === 0 && "bg-muted",
                )}
                style={{ height: b.value === 0 ? 1 : `${Math.max(3, (b.value / max) * 100)}%` }}
              />
            </button>
          ))}
        </div>
      </div>
      {tick && (
        <div className="mt-1 flex gap-px text-[10px] text-muted-foreground">
          {bars.map((b, i) => (
            <span key={i} className="min-w-0 flex-1 overflow-visible whitespace-nowrap">
              {tick(b, i)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** A horizontal bar per row, label left, count right. */
function Ranked({
  rows,
  empty,
}: {
  rows: {
    key: string;
    label: string;
    value: number;
    extra?: React.ReactNode;
    onClick?: () => void;
    segments?: [number, string][];
  }[];
  empty: string;
}) {
  if (!rows.length) return <p className="text-[12px] text-muted-foreground">{empty}</p>;
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="flex flex-col">
      {rows.map((r) => (
        <li key={r.key}>
          <button
            type="button"
            onClick={r.onClick}
            disabled={!r.onClick}
            className="group grid w-full grid-cols-[120px_1fr_auto] items-center gap-3 rounded-md px-1.5 py-1 text-left text-[13px] enabled:hover:bg-chrome-hover"
          >
            <span className="truncate">{r.label}</span>
            <span className="flex h-2 overflow-hidden rounded-full bg-muted">
              {(r.segments ?? [[r.value, "bg-primary/70"]]).map(([v, cls], i) => (
                <span key={i} className={cls} style={{ width: `${(v / max) * 100}%` }} />
              ))}
            </span>
            <span className="flex min-w-[56px] items-center justify-end gap-1.5 text-[12px] text-muted-foreground tabular-nums">
              {r.extra}
              {r.value}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function Thin({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <TriangleAlert size={12} className="shrink-0" />
      {children}
    </p>
  );
}

// ---------------------------------------------------------------------------------------------
// Consistency

function Consistency({ a, days, today }: { a: Analysis; days: AnalyticsDay[]; today: string }) {
  const navigate = useNavigate();
  const openDay = (date: string) => navigate({ to: "/day/$date", params: { date } });
  const recent = useMemo(() => dailyWords(days, addDays(today, -89), today), [days, today]);
  const year = Number(today.slice(0, 4));
  const months = a.months.slice(-24);

  return (
    <Section title="Consistency" source="counted">
      <Panel title="Entries per month" hint="Click a month to read its entries.">
        <Bars
          bars={months.map((m) => ({
            label: m.month,
            value: m.entries,
            heading: monthLabel(m.month),
            detail: `${m.entries} ${m.entries === 1 ? "entry" : "entries"} · ${m.words.toLocaleString()} words`,
            onClick: m.entries ? () => navigate(searchLink(`in:${m.month}`)) : undefined,
          }))}
          tick={(b, i) => (i % 3 === 0 ? monthLabel(b.label).split(" ")[0].slice(0, 3) : null)}
        />
      </Panel>

      <Panel title="Words per day, last 90 days" hint="Click a bar to open the day.">
        <Bars
          bars={recent.map((d) => ({
            label: d.date,
            value: d.words,
            heading: formatShort(d.date),
            detail: d.words ? `${d.words.toLocaleString()} words` : "No entry",
            onClick: d.words ? () => openDay(d.date) : undefined,
          }))}
        />
      </Panel>

      <div className="grid grid-cols-2 gap-8">
        <Panel
          title="Time of day"
          hint={
            a.timeOfDay.missing
              ? `${a.timeOfDay.missing} older ${a.timeOfDay.missing === 1 ? "entry has" : "entries have"} no creation time.`
              : "When each entry was started."
          }
        >
          {a.timeOfDay.counted ? (
            <Bars
              height={72}
              bars={a.timeOfDay.bins.map((n, h) => ({
                label: String(h),
                value: n,
                heading: `${String(h).padStart(2, "0")}:00`,
                detail: `${n} ${n === 1 ? "entry" : "entries"} started`,
              }))}
              tick={(b, i) => (i % 6 === 0 ? b.label : null)}
            />
          ) : (
            <p className="text-[12px] text-muted-foreground">No creation times recorded yet.</p>
          )}
        </Panel>

        <Panel title="Weekday pattern" hint="Average words on days you wrote.">
          <Bars
            height={72}
            bars={a.weekdays.map((w, i) => ({
              label: WEEKDAYS[i],
              value: w.avgWords ?? 0,
              heading: WEEKDAYS[i],
              detail: `${w.entries} ${w.entries === 1 ? "entry" : "entries"} · ${w.avgWords ?? 0} words on average`,
            }))}
            tick={(b) => b.label.slice(0, 1)}
          />
        </Panel>
      </div>

      <p className="text-[12px] text-muted-foreground">
        The{" "}
        <Link to="/year" search={{ year, view: "words" }} className="text-primary hover:underline">
          year view
        </Link>{" "}
        has the full heatmap.
      </p>
    </Section>
  );
}

// ---------------------------------------------------------------------------------------------
// Mood

const W = 640;
const H = 150;
const PAD = 10;

function ValenceLine({ a }: { a: Analysis }) {
  const navigate = useNavigate();
  const pts = a.valence;
  const first = pts[0].date;
  const last = pts[pts.length - 1].date;
  const span = Math.max(1, (Date.parse(last) - Date.parse(first)) / 86_400_000);
  const x = (d: string) =>
    PAD + ((Date.parse(d) - Date.parse(first)) / 86_400_000 / span) * (W - 2 * PAD);
  const y = (v: number) => PAD + ((1 - v) / 2) * (H - 2 * PAD);
  const line = pts
    .map((p, i) => `${i ? "L" : "M"}${x(p.date).toFixed(1)},${y(p.smooth).toFixed(1)}`)
    .join("");
  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Mood over time">
        <line
          x1={PAD}
          x2={W - PAD}
          y1={y(0)}
          y2={y(0)}
          stroke="var(--border)"
          strokeDasharray="3 3"
        />
        {pts.map((p) => (
          <circle
            key={p.date}
            cx={x(p.date)}
            cy={y(p.valence)}
            r={3}
            fill={moodColor(p.valence)}
            opacity={0.55}
            className="cursor-pointer"
            onClick={() => navigate({ to: "/day/$date", params: { date: p.date } })}
          >
            <title>{`${formatShort(p.date)}: ${valenceLabel(p.valence)} (${p.valence})`}</title>
          </circle>
        ))}
        {pts.length > 1 && (
          <path
            d={line}
            fill="none"
            stroke="var(--primary)"
            strokeWidth={2}
            strokeLinejoin="round"
          />
        )}
      </svg>
      <figcaption className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>{formatShort(first)}</span>
        <span>line: 7-day average · dots: each day</span>
        <span>{formatShort(last)}</span>
      </figcaption>
    </figure>
  );
}

function Mood({ a }: { a: Analysis }) {
  const navigate = useNavigate();
  const c = a.correlations;
  const entered = a.valence.length;
  if (entered === 0) {
    return (
      <Section title="Mood" source="derived">
        <p className="text-[12px] text-muted-foreground">
          No mood check-ins yet. Press <kbd className="font-mono">M</kbd> in a note to add one.
        </p>
      </Section>
    );
  }
  return (
    <Section title="Mood" source="derived" note="check-ins and inline ! emotions stay separate">
      <Panel title="Mood over time" derived>
        <ValenceLine a={a} />
        {entered < MIN_ENTRIES && (
          <Thin>Only {entered} days with a check-in; the line is not a trend yet.</Thin>
        )}
      </Panel>

      <Panel
        title="Emotions"
        hint="Check-ins are counted when you pick them in a check-in; inline are !emotions written in the text."
      >
        <div className="mb-1 flex gap-4 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <i className="size-2 rounded-full bg-primary/70" />
            check-ins
          </span>
          <span className="flex items-center gap-1.5">
            <i className="size-2 rounded-full bg-foreground/40" />
            inline
          </span>
        </div>
        <Ranked
          empty="No emotions yet."
          rows={a.emotions.slice(0, 10).map((e) => ({
            key: e.emotion,
            label: e.emotion,
            value: e.checkins + e.inline,
            segments: [
              [e.checkins, "bg-primary/70"],
              [e.inline, "bg-foreground/40"],
            ],
            extra: (
              <span className="text-[11px]">
                {e.checkins}·{e.inline}
              </span>
            ),
            onClick: () => navigate(searchLink(`!${e.emotion}`)),
          }))}
        />
      </Panel>

      <div className="grid grid-cols-2 gap-8">
        <Panel
          title="Mood by time of day"
          derived
          hint="Average of check-ins, by when they were made."
        >
          <ul className="flex flex-col gap-1 text-[13px]">
            {a.moodByTime.map((m, i) => (
              <li key={TIME_BUCKETS[i]} className="flex items-center gap-2">
                <span className="w-[84px] text-muted-foreground">{TIME_BUCKETS[i]}</span>
                {m.avgValence === null ? (
                  <span className="text-[12px] text-muted-foreground">—</span>
                ) : (
                  <>
                    <i
                      className="size-2.5 rounded-full"
                      style={{ background: moodColor(m.avgValence) }}
                    />
                    <span>{valenceLabel(m.avgValence)}</span>
                    <span className="text-[11px] text-muted-foreground">{m.checkins}</span>
                  </>
                )}
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Mood by weekday" derived hint="Average of the day's check-ins.">
          <ul className="flex flex-col gap-1 text-[13px]">
            {a.weekdays.map((w, i) => (
              <li key={WEEKDAYS[i]} className="flex items-center gap-2">
                <span className="w-[84px] text-muted-foreground">{WEEKDAYS[i]}</span>
                {w.avgValence === null ? (
                  <span className="text-[12px] text-muted-foreground">—</span>
                ) : (
                  <>
                    <i
                      className="size-2.5 rounded-full"
                      style={{ background: moodColor(w.avgValence) }}
                    />
                    <span>{valenceLabel(w.avgValence)}</span>
                  </>
                )}
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel
        title="What goes with a better or worse mood"
        derived
        hint={`Compared with your average (${valenceLabel(c.baseline ?? 0).toLowerCase()}, over ${c.moodDays} days with a check-in). This shows what shows up together, not what causes what.`}
      >
        {c.rows.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">
            Nothing is linked on days with a check-in yet.
          </p>
        ) : (
          <ul className="flex flex-col">
            {c.rows.slice(0, 12).map((r) => (
              <li key={`${r.kind}:${r.name}`}>
                <button
                  type="button"
                  onClick={() =>
                    navigate(searchLink(r.kind === "tag" ? `#${r.name}` : `@"${r.name}"`))
                  }
                  className="grid w-full grid-cols-[1fr_auto_auto] items-center gap-3 rounded-md px-1.5 py-1 text-left text-[13px] hover:bg-chrome-hover"
                >
                  <span className="truncate">
                    {r.kind === "tag" ? "#" : ""}
                    {r.name}
                  </span>
                  <span
                    className={cn(
                      "flex items-center gap-1 text-[12px] tabular-nums",
                      r.small && "opacity-60",
                    )}
                  >
                    {r.delta > 0 ? (
                      <ArrowUp size={12} />
                    ) : r.delta < 0 ? (
                      <ArrowDown size={12} />
                    ) : null}
                    {r.delta > 0 ? "+" : ""}
                    {r.delta.toFixed(2)}
                  </span>
                  <span className="min-w-[92px] text-right text-[11px] text-muted-foreground">
                    {r.days} {r.days === 1 ? "day" : "days"}
                    {r.small ? ` · few (<${SMALL_SAMPLE})` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </Section>
  );
}

// ---------------------------------------------------------------------------------------------
// People & topics

function People({ a, days }: { a: Analysis; days: AnalyticsDay[] }) {
  const app = useApp();
  const navigate = useNavigate();
  const [picked, setPicked] = useState<string | null>(null);
  const who = picked ?? a.people[0]?.name ?? null;
  const over = useMemo(() => (who ? mentionsOverTime(days, who) : []), [days, who]);
  const pathOf = (name: string) => app.entities.find((e) => e.name === name)?.path;
  const trend = (n: number) =>
    n === 0 ? null : (
      <span
        className={cn(
          "inline-flex items-center text-[11px]",
          n > 0 ? "text-primary" : "text-muted-foreground",
        )}
      >
        {n > 0 ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
        {Math.abs(n)}
      </span>
    );

  return (
    <Section title="People & topics" source="counted" note="keywords are derived">
      <Panel
        title="Most mentioned people"
        hint="Arrow: mentions in the last 90 days compared with the 90 before."
      >
        <Ranked
          empty="No people mentioned yet. Type @ in a note."
          rows={a.people.slice(0, 10).map((p) => ({
            key: p.name,
            label: p.name,
            value: p.mentions,
            extra: trend(p.trend),
            onClick: () => setPicked(p.name),
          }))}
        />
      </Panel>

      {who && (
        <Panel title={`${who} over time`} hint="Days per month they appear.">
          <Bars
            height={64}
            bars={over.slice(-24).map((m) => ({
              label: m.month,
              value: m.days,
              heading: monthLabel(m.month),
              detail: `${m.days} ${m.days === 1 ? "day" : "days"}`,
              onClick: m.days ? () => navigate(searchLink(`@"${who}" in:${m.month}`)) : undefined,
            }))}
            tick={(b, i) => (i % 3 === 0 ? monthLabel(b.label).split(" ")[0].slice(0, 3) : null)}
          />
          <PersonLine a={a} name={who} pathOf={pathOf} />
        </Panel>
      )}

      {a.places.length > 0 && (
        <Panel title="Most mentioned places">
          <Ranked
            empty=""
            rows={a.places.slice(0, 6).map((p) => ({
              key: p.name,
              label: p.name,
              value: p.mentions,
              extra: trend(p.trend),
              onClick: () => navigate(searchLink(`@"${p.name}"`)),
            }))}
          />
        </Panel>
      )}

      {a.pairs.length > 0 && (
        <Panel title="Who appears together" hint="Days two people are in the same entry.">
          <Ranked
            empty=""
            rows={a.pairs.slice(0, 8).map((p) => ({
              key: `${p.a}|${p.b}`,
              label: `${p.a} & ${p.b}`,
              value: p.days,
              onClick: () => navigate(searchLink(`@"${p.a}" @"${p.b}"`)),
            }))}
          />
        </Panel>
      )}

      <Panel title="Topics" hint="Tags (#) by the number of entries that use them.">
        <Ranked
          empty="No #topics yet."
          rows={a.tags.slice(0, 10).map((t) => ({
            key: t.tag,
            label: `#${t.tag}`,
            value: t.entries,
            onClick: () => navigate(searchLink(`#${t.tag}`)),
          }))}
        />
      </Panel>

      <Panel
        title="Words that stood out each month"
        derived
        hint="Keywords picked by frequency (TF-IDF), not topics understood by a model."
      >
        <ul className="flex flex-col gap-1.5">
          {a.terms
            .slice(-12)
            .reverse()
            .map((m) => (
              <li key={m.month} className="grid grid-cols-[92px_1fr] gap-3 text-[13px]">
                <span className="text-muted-foreground">{monthLabel(m.month)}</span>
                <span className="flex flex-wrap gap-x-2 gap-y-0.5">
                  {m.terms.map((t) => (
                    <button
                      key={t.term}
                      type="button"
                      onClick={() => navigate(searchLink(`${t.term} in:${m.month}`))}
                      className="hover:text-primary"
                    >
                      {t.term}
                    </button>
                  ))}
                </span>
              </li>
            ))}
        </ul>
      </Panel>
    </Section>
  );
}

function PersonLine({
  a,
  name,
  pathOf,
}: {
  a: Analysis;
  name: string;
  pathOf: (n: string) => string | undefined;
}) {
  const row = a.people.find((p) => p.name === name);
  const mood = a.correlations.rows.find((r) => r.kind === "person" && r.name === name);
  const path = pathOf(name);
  if (!row) return null;
  return (
    <p className="text-[12px] text-muted-foreground">
      {row.mentions} {row.mentions === 1 ? "mention" : "mentions"} on {row.days}{" "}
      {row.days === 1 ? "day" : "days"}, from {formatShort(row.first)} to {formatShort(row.last)}.
      {mood && (
        <>
          {" "}
          Mood on those days is {mood.delta > 0 ? "+" : ""}
          {mood.delta.toFixed(2)} against your average
          {mood.small ? " (few days, so uncertain)" : ""}.
        </>
      )}
      {path && (
        <>
          {" "}
          <Link to="/entity" search={{ path }} className="text-primary hover:underline">
            Open page
          </Link>
        </>
      )}
    </p>
  );
}

// ---------------------------------------------------------------------------------------------
// Writing style

const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)}%`);

function Style({ a }: { a: Analysis }) {
  const navigate = useNavigate();
  const s = a.style;
  const open = (date: string) => navigate({ to: "/day/$date", params: { date } });
  const rows: [string, string, string][] = [
    [
      "Vocabulary",
      s.richness === null ? "—" : s.richness.toFixed(1),
      `${s.uniqueWords.toLocaleString()} different words in ${s.words.toLocaleString()} (root type-token ratio)`,
    ],
    [
      "Sentence length",
      s.avgSentenceLength === null ? "—" : `${s.avgSentenceLength} words`,
      "average",
    ],
    [
      "Reading level",
      s.gradeLevel === null ? "—" : `grade ${s.gradeLevel}`,
      "Flesch–Kincaid, approximate",
    ],
    [
      "“I” versus “we”",
      pct(s.singularShare),
      `${s.singular.toLocaleString()} singular, ${s.plural.toLocaleString()} plural first-person words`,
    ],
    [
      "Tense",
      s.tense
        ? `${pct(s.tense.past)} past · ${pct(s.tense.present)} present · ${pct(s.tense.future)} future`
        : "—",
      "from common verb forms, approximate",
    ],
    [
      "Questions / exclamations",
      `${pct(s.questionRate)} / ${pct(s.exclamationRate)}`,
      "of sentences",
    ],
    [
      "Sentiment",
      s.sentiment === null ? "—" : `${s.sentiment > 0 ? "+" : ""}${s.sentiment.toFixed(2)}`,
      "from a small word list, approximate: −1 negative, +1 positive",
    ],
  ];
  return (
    <Section title="Writing style" source="derived" note="approximate, English only">
      <dl className="flex flex-col">
        {rows.map(([k, v, note]) => (
          <div
            key={k}
            className="grid grid-cols-[170px_1fr] gap-3 border-b border-border/60 py-1.5 text-[13px]"
          >
            <dt className="text-muted-foreground">{k}</dt>
            <dd>
              {v}
              <span className="ml-2 text-[11px] text-muted-foreground">{note}</span>
            </dd>
          </div>
        ))}
      </dl>
      <div className="flex gap-6 text-[13px]">
        {s.longest && (
          <button
            type="button"
            onClick={() => open(s.longest!.date)}
            className="text-left hover:text-primary"
          >
            <span className="text-muted-foreground">Longest: </span>
            {formatLong(s.longest.date)} · {s.longest.words.toLocaleString()} words
          </button>
        )}
        {s.shortest && s.shortest.date !== s.longest?.date && (
          <button
            type="button"
            onClick={() => open(s.shortest!.date)}
            className="text-left hover:text-primary"
          >
            <span className="text-muted-foreground">Shortest: </span>
            {formatLong(s.shortest.date)} · {s.shortest.words} words
          </button>
        )}
      </div>
    </Section>
  );
}
