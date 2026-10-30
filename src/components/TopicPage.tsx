import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { useApp } from "@/app/context";
import { backend } from "@/lib";
import { formatShort } from "@/lib/dates";
import type { Mention } from "@/lib/schema";
import { plainContext } from "@/lib/snippet";

/** A topic (#tag): every note that uses it, newest journal days first. */
export function TopicPage({ tag }: { tag: string }) {
  const navigate = useNavigate();
  const { entitiesVersion, daysVersion } = useApp();
  const [notes, setNotes] = useState<Mention[] | null>(null);

  useEffect(() => {
    let live = true;
    backend
      .tagNotes(tag)
      .then((n) => live && setNotes(n))
      .catch(() => live && setNotes([]));
    return () => {
      live = false;
    };
  }, [tag, entitiesVersion, daysVersion]);

  const open = (m: Mention) => {
    if (m.date) void navigate({ to: "/day/$date", params: { date: m.date } });
    else void navigate({ to: "/entity", search: { path: m.path } });
  };

  return (
    <div className="h-full overflow-y-auto bg-chrome">
      <div className="anim-fade mx-auto max-w-[680px] px-8 pb-24 pt-14">
        <Link
          to="/library"
          className="mb-4 inline-flex items-center gap-1.5 text-[12px] text-muted-foreground transition-colors duration-100 hover:text-foreground"
        >
          <ArrowLeft size={13} />
          Library
        </Link>
        <h1 className="mb-1 text-[22px] font-semibold tracking-tight">#{tag}</h1>
        <p className="mb-8 text-[12px] text-muted-foreground">
          {notes === null ? "" : `${notes.length} ${notes.length === 1 ? "note" : "notes"}`}
        </p>

        {notes?.length === 0 && (
          <p className="text-[13px] text-muted-foreground">No notes use this topic yet.</p>
        )}
        <ul className="flex flex-col">
          {notes?.map((m) => (
            <li key={m.path}>
              <button
                type="button"
                onClick={() => open(m)}
                className="flex w-full items-baseline gap-4 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-chrome-hover"
              >
                <span className="w-[120px] shrink-0 text-muted-foreground">
                  {m.date ? formatShort(m.date) : m.name}
                </span>
                <span className="min-w-0 flex-1 truncate">{plainContext(m.context)}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
