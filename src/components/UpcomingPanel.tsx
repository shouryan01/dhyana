import { useNavigate } from "@tanstack/react-router";
import { CalendarClock } from "lucide-react";
import { useEffect, useState } from "react";
import { useApp } from "@/app/context";
import { backend } from "@/lib";
import { addDays, formatShort, parseISODate } from "@/lib/dates";
import type { UpcomingEvent } from "@/lib/schema";

const WINDOW_DAYS = 60;
const MAX_SHOWN = 5;

const daysUntil = (from: string, to: string) =>
  Math.round((parseISODate(to).getTime() - parseISODate(from).getTime()) / 86_400_000);

const when = (n: number) => (n === 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`);

/** The next dates you've written down with `$`, shown on today's note. Hidden when there are none. */
export function UpcomingPanel({ today }: { today: string }) {
  const { entitiesVersion } = useApp();
  const navigate = useNavigate();
  const [events, setEvents] = useState<UpcomingEvent[]>([]);

  useEffect(() => {
    let live = true;
    backend
      .upcoming(today, 50)
      .then((list) => live && setEvents(list))
      .catch(() => live && setEvents([]));
    return () => {
      live = false;
    };
  }, [today, entitiesVersion]);

  const horizon = addDays(today, WINDOW_DAYS);
  const shown = events.filter((e) => e.date <= horizon).slice(0, MAX_SHOWN);
  if (!shown.length) return null;

  return (
    <section
      aria-label="Coming up"
      className="mb-8 rounded-lg border border-border bg-popover/60 px-4 py-3 select-none"
    >
      <h2 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        <CalendarClock size={12} /> Coming up
      </h2>
      <ul className="flex flex-col">
        {shown.map((e, i) => (
          <li key={`${e.date}-${e.source}-${i}`}>
            <button
              type="button"
              onClick={() => navigate({ to: "/day/$date", params: { date: e.date } })}
              className="group flex w-full items-baseline gap-3 rounded-md px-1 py-1 text-left text-[13px] hover:bg-chrome-hover"
            >
              <span className="w-[110px] shrink-0 text-muted-foreground">
                {formatShort(e.date)}
              </span>
              <span className="min-w-0 flex-1 truncate">{e.label ?? "Event"}</span>
              <span className="shrink-0 text-[12px] text-muted-foreground">
                {when(daysUntil(today, e.date))}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
