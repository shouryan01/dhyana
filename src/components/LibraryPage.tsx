import { useNavigate } from "@tanstack/react-router";
import { FileText, Hash, MapPin, Pencil, Smile, Trash2, User } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useApp } from "@/app/context";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { backend } from "@/lib";
import { nameKey } from "@/lib/names";
import { cn, trashName } from "@/lib/utils";

const KINDS = [
  { id: "person", label: "People", icon: User },
  { id: "place", label: "Places", icon: MapPin },
  { id: "emotion", label: "Emotions", icon: Smile },
  { id: "note", label: "Notes", icon: FileText },
  { id: "tag", label: "Topics", icon: Hash },
] as const;

interface Row {
  key: string;
  kind: (typeof KINDS)[number]["id"];
  name: string;
  count: number;
  /** Topics live as `#text` in your notes: no page of their own to rename or delete. */
  path: string | null;
  /** For a topic, its name without the `#`; clicking it lists the notes that use it. */
  topic?: string;
}

const errorText = (e: unknown) => String(e instanceof Error ? e.message : e);

/** Everything created so far, one type at a time. Click one to open it; rename or delete in place. */
export function LibraryPage() {
  const app = useApp();
  const navigate = useNavigate();
  const [kind, setKind] = useState<Row["kind"]>("person");
  const [query, setQuery] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null); // row key
  const [draft, setDraft] = useState("");
  const [deleting, setDeleting] = useState<Row | null>(null);

  const rows = useMemo<Row[]>(() => {
    const notes = app.entities.map((e) => ({
      key: e.path,
      kind: e.kind as Row["kind"],
      name: e.display,
      count: e.mentions,
      path: e.path,
    }));
    const tags = app.tags.map((t) => ({
      key: `tag:${t.tag}`,
      kind: "tag" as const,
      name: `#${t.tag}`,
      topic: t.tag,
      count: t.count,
      path: null,
    }));
    return [...notes, ...tags];
  }, [app.entities, app.tags]);

  const q = nameKey(query.trim());
  const countOf = (k: Row["kind"]) => rows.filter((r) => r.kind === k).length;
  const shown = rows.filter((r) => r.kind === kind && (!q || nameKey(r.name).includes(q)));

  const startRename = (r: Row) => {
    setDraft(r.name);
    setRenaming(r.key);
  };

  const commitRename = async (r: Row) => {
    setRenaming(null);
    const name = draft.trim();
    if (!r.path || !name || name === r.name) return;
    try {
      const res = await backend.renameEntity(r.path, name);
      await app.refreshEntities();
      toast.success(
        res.updatedNotes
          ? `Renamed. Updated links in ${res.updatedNotes} ${res.updatedNotes === 1 ? "note" : "notes"}.`
          : "Renamed.",
      );
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  const doDelete = async () => {
    const r = deleting;
    setDeleting(null);
    if (!r?.path) return;
    try {
      await backend.deleteEntity(r.path);
      await app.refreshEntities();
      toast.success(`Deleted ${r.name}`, {
        description: `It's in your ${trashName()} if you need it back.`,
      });
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-chrome">
      <div className="anim-fade mx-auto max-w-[680px] px-8 pb-24 pt-14">
        <h1 className="mb-6 text-[22px] font-semibold tracking-tight">Library</h1>

        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name"
          aria-label="Search the library"
          className="mb-3"
        />
        <div className="mb-6 flex flex-wrap gap-1">
          {KINDS.map((k) => (
            <button
              key={k.id}
              onClick={() => setKind(k.id)}
              aria-pressed={kind === k.id}
              className={cn(
                "flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12px] transition-colors duration-100",
                kind === k.id
                  ? "bg-chrome-active text-foreground"
                  : "text-muted-foreground hover:bg-chrome-hover hover:text-foreground",
              )}
            >
              {k.label}
              <span className="text-[11px] opacity-70">{countOf(k.id)}</span>
            </button>
          ))}
        </div>

        {kind === "tag" && (
          <p className="mb-3 px-2 text-[12px] text-muted-foreground">
            Topics are the #words in your notes, so they can't be renamed or deleted from here yet.
            Click one to see every note that uses it.
          </p>
        )}
        {shown.length === 0 && (
          <p className="text-[13px] text-muted-foreground">
            {countOf(kind) ? "Nothing matches" : "Nothing here yet."}
          </p>
        )}
        {shown.map((r) => (
          <div
            key={r.key}
            className="group flex min-h-9 items-center gap-1 rounded-md pr-1 transition-colors duration-100 hover:bg-chrome-hover"
          >
            {renaming === r.key ? (
              <Input
                autoFocus
                aria-label={`Rename ${r.name}`}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => void commitRename(r)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                  if (e.key === "Escape") {
                    setDraft(r.name);
                    setRenaming(null);
                  }
                }}
                className="mx-1 h-7 flex-1"
              />
            ) : (
              <button
                onClick={() =>
                  r.topic
                    ? navigate({ to: "/topic", search: { tag: r.topic } })
                    : r.path && navigate({ to: "/entity", search: { path: r.path } })
                }
                className="flex min-h-9 min-w-0 flex-1 items-center gap-2.5 rounded-md px-2 text-left text-[13px] disabled:cursor-default"
              >
                <span className="truncate">{r.name}</span>
                <span className="flex-1" />
                {r.count > 0 && (
                  <span className="shrink-0 text-[11px] text-muted-foreground">{r.count}×</span>
                )}
              </button>
            )}
            {r.path && renaming !== r.key && (
              <span className="flex shrink-0 opacity-0 transition-opacity duration-100 focus-within:opacity-100 group-hover:opacity-100">
                <RowButton label={`Rename ${r.name}`} onClick={() => startRename(r)}>
                  <Pencil size={13} />
                </RowButton>
                <RowButton
                  label={`Delete ${r.name}`}
                  onClick={() => setDeleting(r)}
                  className="hover:text-red-500"
                >
                  <Trash2 size={13} />
                </RowButton>
              </span>
            )}
          </div>
        ))}
      </div>

      <AlertDialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent className="sm:max-w-[400px]">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The note moves to your {trashName()}, so you can still restore it from there. Links to
              it in other notes stay as they are and show as unresolved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void doDelete()}>
              Move to {trashName()}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function RowButton({
  label,
  onClick,
  className,
  children,
}: {
  label: string;
  onClick(): void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors duration-100 hover:bg-chrome-active hover:text-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
}
