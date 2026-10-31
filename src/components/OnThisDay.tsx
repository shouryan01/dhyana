import { useNavigate } from "@tanstack/react-router";
import { History } from "lucide-react";
import { useEffect, useState } from "react";
import { useApp } from "@/app/context";
import { backend } from "@/lib";
import { parseISODate } from "@/lib/dates";
import type { OnThisDay as Entry } from "@/lib/schema";
import { plainContext } from "@/lib/snippet";

const MAX_SHOWN = 3;

/** Entries written on this month and day in earlier years. Hidden when there are none. */
export function OnThisDay({ date }: { date: string }) {
  const { entitiesVersion } = useApp();
  const navigate = useNavigate();
  const [entries, setEntries] = useState<Entry[]>([]);

  useEffect(() => {
    let live = true;
    backend
      .onThisDay(date)
      .then((list) => live && setEntries(list))
      .catch(() => live && setEntries([]));
    return () => {
      live = false;
    };
  }, [date, entitiesVersion]);

  if (!entries.length) return null;
  const year = parseISODate(date).getFullYear();

  return (
    <section
      aria-label="On this day"
      className="mb-8 rounded-lg border border-border bg-popover/60 px-4 py-3 select-none"
    >
      <h2 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        <History size={12} /> On this day
      </h2>
      <ul className="flex flex-col">
        {entries.slice(0, MAX_SHOWN).map((e) => {
          const ago = year - parseISODate(e.date).getFullYear();
          return (
            <li key={e.date}>
              <button
                type="button"
                onClick={() => navigate({ to: "/day/$date", params: { date: e.date } })}
                className="flex w-full items-baseline gap-3 rounded-md px-1 py-1 text-left text-[13px] hover:bg-chrome-hover"
              >
                <span className="w-[110px] shrink-0 text-muted-foreground">
                  {ago === 1 ? "A year ago" : `${ago} years ago`}
                </span>
                <span className="line-clamp-2 min-w-0 flex-1">
                  {plainContext(e.excerpt) || (
                    <span className="text-muted-foreground">(no text)</span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
