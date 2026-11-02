import { useNavigate } from "@tanstack/react-router";
import { Bookmark, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useApp } from "@/app/context";
import { Input } from "@/components/ui/input";
import { backend } from "@/lib";
import { formatShort } from "@/lib/dates";
import { moodColor, valenceLabel } from "@/lib/mood";
import type { SavedSearch, SearchHit } from "@/lib/schema";
import { parseBar, snippetParts } from "@/lib/searchBar";

const DEBOUNCE_MS = 120;
const HINTS = [
  ["@Alex", "a person or place"],
  ["#work", "a topic"],
  ["!calm", "an emotion"],
  ["in:last-month", "or in:2026-03, last:30d, from:/to:"],
  ["mood:>0.2", "or mood:negative, mood:-0.5..0.5"],
] as const;

/**
 * Search the journal: free text plus filters in one line (see `lib/searchBar.ts`). Results are
 * entries; click one to open it. Searches can be saved to the vault and re-run in one click.
 */
export function SearchPage({ initial }: { initial: string }) {
  const app = useApp();
  const navigate = useNavigate();
  const [bar, setBar] = useState(initial);
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [saved, setSaved] = useState<SavedSearch[]>([]);
  const [naming, setNaming] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const parsed = useMemo(
    () => parseBar(bar, app.entities, app.today),
    [bar, app.entities, app.today],
  );

  useEffect(() => input.current?.focus(), []);
  useEffect(() => {
    backend
      .savedSearches()
      .then(setSaved)
      .catch(() => setSaved([]));
  }, []);

  useEffect(() => {
    if (parsed.empty) {
      setHits(null);
      return;
    }
    if (parsed.invalid) {
      setHits([]); // a filter we can't read matches nothing, rather than being ignored
      return;
    }
    let live = true;
    const t = window.setTimeout(() => {
      backend
        .search(parsed.query)
        .then((h) => live && setHits(h))
        .catch(() => live && setHits([]));
    }, DEBOUNCE_MS);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
    // Re-run when notes change, so results never go stale under an edit.
  }, [parsed, app.daysVersion, app.entitiesVersion]);

  const change = (value: string) => {
    setBar(value);
    void navigate({ to: "/search", search: { q: value }, replace: true });
  };

  const persist = (next: SavedSearch[]) => {
    setSaved(next);
    backend.saveSavedSearches(next).catch((e) => toast.error(`Couldn't save the search: ${e}`));
  };
  const save = (name: string) => {
    const n = name.trim();
    setNaming(null);
    if (!n) return;
    persist([
      ...saved.filter((s) => s.bar !== bar.trim()),
      { id: crypto.randomUUID(), name: n, bar: bar.trim() },
    ]);
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="anim-fade mx-auto max-w-[680px] px-8 pb-24 pt-14">
        <h1 className="mb-4 text-[22px] font-semibold tracking-tight">Search</h1>

        <div className="flex items-center gap-2">
          <Input
            ref={input}
            value={bar}
            onChange={(e) => change(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") (e.target as HTMLInputElement).blur();
            }}
            placeholder="Words, @people, #topics, !emotions, in:last-month …"
            aria-label="Search entries"
            className="h-9 text-[14px]"
          />
          {!parsed.empty && (
            <button
              type="button"
              onClick={() => setNaming(bar.trim())}
              title="Save this search"
              aria-label="Save this search"
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-100 hover:bg-chrome-hover hover:text-foreground"
            >
              <Bookmark size={15} />
            </button>
          )}
        </div>

        {naming !== null && (
          <form
            className="mt-2 flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              save((new FormData(e.currentTarget).get("name") as string) ?? "");
            }}
          >
            <Input
              name="name"
              autoFocus
              placeholder="Name this search"
              defaultValue=""
              onKeyDown={(e) => e.key === "Escape" && setNaming(null)}
              aria-label="Name for the saved search"
            />
            <button type="submit" className="text-[12px] text-primary hover:underline">
              Save
            </button>
          </form>
        )}

        {parsed.problems.length > 0 && (
          <p className="mt-2 text-[12px] text-muted-foreground">
            {parsed.invalid ? "Can't read" : "Not found"}: {parsed.problems.join(", ")}
          </p>
        )}

        {saved.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Saved searches">
            {saved.map((s) => (
              <li
                key={s.id}
                className="group inline-flex items-center rounded-full border border-border bg-popover text-[12px]"
              >
                <button
                  type="button"
                  title={s.bar}
                  onClick={() => change(s.bar)}
                  className="rounded-l-full py-1 pl-2.5 pr-1.5 hover:text-foreground"
                >
                  {s.name}
                </button>
                <button
                  type="button"
                  aria-label={`Delete saved search ${s.name}`}
                  onClick={() => persist(saved.filter((x) => x.id !== s.id))}
                  className="rounded-r-full py-1 pr-2 pl-0.5 text-muted-foreground opacity-0 transition-opacity duration-100 group-hover:opacity-100 focus-visible:opacity-100"
                >
                  <X size={11} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {hits === null && (
          <dl className="mt-8 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[12px] text-muted-foreground">
            {HINTS.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="font-mono text-foreground">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        )}

        {hits !== null && (
          <p className="mt-6 mb-2 text-[12px] text-muted-foreground">
            {hits.length === 0
              ? "Nothing matches."
              : `${hits.length}${hits.length >= 200 ? "+" : ""} ${hits.length === 1 ? "entry" : "entries"}`}
          </p>
        )}
        <ul className="flex flex-col">
          {hits?.map((h) => (
            <li key={h.date}>
              <button
                type="button"
                onClick={() => navigate({ to: "/day/$date", params: { date: h.date } })}
                className="flex w-full items-baseline gap-4 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-chrome-hover"
              >
                <span className="w-[120px] shrink-0 text-muted-foreground">
                  {formatShort(h.date)}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {snippetParts(h.snippet).map((p, i) =>
                    p.hit ? (
                      <mark key={i} className="rounded-sm bg-primary/20 text-foreground">
                        {p.text}
                      </mark>
                    ) : (
                      <span key={i}>{p.text}</span>
                    ),
                  )}
                </span>
                {h.valence !== null && (
                  <span
                    role="img"
                    aria-label={valenceLabel(h.valence)}
                    title={valenceLabel(h.valence)}
                    className="size-2 shrink-0 self-center rounded-full"
                    style={{ background: moodColor(h.valence) }}
                  />
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
