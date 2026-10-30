import { useNavigate } from "@tanstack/react-router";
import { X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/app/context";
import { ValenceChart, type ValencePoint } from "@/components/ValenceChart";
import { backend } from "@/lib";
import { addDays, formatShort, parseISODate } from "@/lib/dates";
import { averageValence, formatAt, timeline, valenceLabel } from "@/lib/mood";
import type { CheckIn, DayStat } from "@/lib/schema";

const DAYS = 30;

const shortDay = (iso: string) =>
  parseISODate(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

/** Beside a day: its check-ins through the day, and the daily average over the last 30 days. */
export function MoodPanel({
  date,
  mood,
  pending,
}: {
  date: string;
  mood: CheckIn[];
  pending: CheckIn[];
}) {
  const app = useApp();
  const navigate = useNavigate();
  const [stats, setStats] = useState<DayStat[]>([]);
  const from = addDays(date, -(DAYS - 1));

  useEffect(() => {
    let live = true;
    backend
      .dayStats(from, date)
      .then((s) => live && setStats(s))
      .catch(() => live && setStats([]));
    return () => {
      live = false;
    };
  }, [from, date, app.entitiesVersion]);

  const dayPoints = useMemo<ValencePoint[]>(
    () =>
      timeline(mood, pending).map(({ checkin: c }) => {
        const [h, m] = c.at.split(":").map(Number);
        return { x: (h * 60 + m) / 1440, valence: c.valence, label: formatAt(c.at), joined: true };
      }),
    [mood, pending],
  );

  const monthPoints = useMemo<ValencePoint[]>(() => {
    const out: ValencePoint[] = [];
    let prev = -2;
    const today = averageValence([...mood, ...pending]);
    for (let i = 0; i < DAYS; i++) {
      const d = addDays(from, i);
      // The open day's own value comes from what's on screen, so it updates as you check in.
      const v = d === date ? today : (stats.find((s) => s.date === d)?.valence ?? null);
      if (v === null) continue;
      out.push({ x: i / (DAYS - 1), valence: v, label: formatShort(d), joined: i === prev + 1 });
      prev = i;
    }
    return out;
  }, [stats, from, date, mood, pending]);

  const avg = averageValence(
    monthPoints.map((p) => ({ at: "00:00", valence: p.valence, emotions: [], factors: [] })),
  );

  return (
    <aside
      aria-label="Mood"
      className="anim-fade flex w-[300px] shrink-0 flex-col gap-6 overflow-y-auto border-l border-border bg-chrome px-4 pt-4 pb-8 select-none"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-[13px] font-semibold">Mood</h2>
        <button
          type="button"
          aria-label="Close mood panel"
          onClick={app.toggleMoodPanel}
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-chrome-hover hover:text-foreground"
        >
          <X size={14} />
        </button>
      </div>
      <ValenceChart
        title="Through the day"
        points={dayPoints}
        ticks={[
          { x: 0, label: "12a" },
          { x: 0.5, label: "12p" },
          { x: 1, label: "12a" },
        ]}
      />
      <div>
        <ValenceChart
          title={`Last ${DAYS} days`}
          points={monthPoints}
          ticks={[
            { x: 0, label: shortDay(from) },
            { x: 1, label: shortDay(date) },
          ]}
        />
        {avg !== null && (
          <p className="mt-2 text-[12px] text-muted-foreground">
            On average: <span className="text-foreground">{valenceLabel(avg)}</span>, over{" "}
            {monthPoints.length} {monthPoints.length === 1 ? "day" : "days"} with a check-in.
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={() =>
          navigate({
            to: "/year",
            search: { year: parseISODate(date).getFullYear(), view: "mood" },
          })
        }
        className="self-start text-[12px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
      >
        See the whole year
      </button>
    </aside>
  );
}
