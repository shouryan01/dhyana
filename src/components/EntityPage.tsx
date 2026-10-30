import { useNavigate } from "@tanstack/react-router";
import { FileText, Hash, MapPin, Smile, User } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useApp } from "@/app/context";
import { registerFlush } from "@/app/flush";
import { NoteEditor } from "@/components/NoteEditor";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { backend } from "@/lib";
import { formatShort } from "@/lib/dates";
import { plainContext } from "@/lib/snippet";
import type { EntityDetail, Mention } from "@/lib/schema";

const AUTOSAVE_MS = 700;

const KIND_ICON = {
  person: User,
  place: MapPin,
  emotion: Smile,
  tag: Hash,
  note: FileText,
} as const;
const KIND_LABEL = {
  person: "Person",
  place: "Place",
  emotion: "Emotion",
  tag: "Tag",
  note: "Note",
} as const;

interface Fields {
  name: string;
  relationship: string;
  birthday: string;
  notes: string;
}

const fieldsOf = (d: EntityDetail): Fields => ({
  name: d.display,
  relationship: d.relationship ?? "",
  birthday: d.birthday ?? "",
  notes: d.notes,
});

/** A person, place or emotion: its properties, free-text notes, and every note that mentions it. */
export function EntityPage({ path }: { path: string }) {
  const { entitiesVersion } = useApp();
  const [detail, setDetail] = useState<EntityDetail | null>(null);
  const [missing, setMissing] = useState(false);
  const [fields, setFields] = useState<Fields | null>(null);
  const edited = useRef(false); // the user has typed something not yet saved
  const navigate = useNavigate();

  // Load, and reload (backlinks!) whenever the vault's notes change. Typing is never overwritten.
  useEffect(() => {
    let live = true;
    backend
      .getEntity(path)
      .then((d) => {
        if (!live) return;
        setDetail(d);
        setMissing(false);
        if (!edited.current) setFields(fieldsOf(d));
      })
      .catch(() => live && setMissing(true));
    return () => {
      live = false;
    };
  }, [path, entitiesVersion]);

  useEffect(() => {
    edited.current = false;
    setFields(null);
    setDetail(null);
  }, [path]);

  // Latest state for callbacks that outlive a render (autosave timer, flush on leave).
  const latest = useRef({ detail, fields });
  latest.current = { detail, fields };
  const timer = useRef<number | undefined>(undefined);

  const save = async (patch: Parameters<typeof backend.updateEntity>[1]) => {
    try {
      const next = await backend.updateEntity(path, patch);
      setDetail(next);
      // Show what was stored (trimmed) unless the user has moved on.
      if (!edited.current) setFields(fieldsOf(next));
    } catch (e) {
      toast.error(String(e instanceof Error ? e.message : e));
    }
  };

  const flushNotes = async () => {
    window.clearTimeout(timer.current);
    const { detail: d, fields: f } = latest.current;
    if (!d || !f || f.notes === d.notes) return;
    await save({ notes: f.notes });
  };

  useEffect(() => {
    const off = registerFlush(flushNotes);
    return () => {
      off();
      void flushNotes();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  const set = (patch: Partial<Fields>) => {
    edited.current = true;
    setFields((f) => (f ? { ...f, ...patch } : f));
  };

  const commit = async (key: "relationship" | "birthday") => {
    const { detail: d, fields: f } = latest.current;
    if (!d || !f) return;
    const before = key === "relationship" ? (d.relationship ?? "") : (d.birthday ?? "");
    if (f[key] === before) return;
    await save({ [key]: f[key].trim() });
  };

  const rename = async () => {
    const { detail: d, fields: f } = latest.current;
    if (!d || !f) return;
    const name = f.name.trim();
    if (!name || name === d.display) {
      set({ name: d.display });
      return;
    }
    try {
      const r = await backend.renameEntity(path, name);
      edited.current = false;
      toast.success(
        r.updatedNotes
          ? `Renamed. Updated links in ${r.updatedNotes} ${r.updatedNotes === 1 ? "note" : "notes"}.`
          : "Renamed.",
      );
      void navigate({ to: "/entity", search: { path: r.entity.path }, replace: true });
    } catch (e) {
      toast.error(String(e instanceof Error ? e.message : e));
      set({ name: d.display });
    }
  };

  const open = (m: Mention) => {
    if (m.date) void navigate({ to: "/day/$date", params: { date: m.date } });
    else void navigate({ to: "/entity", search: { path: m.path } });
  };

  if (missing) {
    return <div className="p-10 text-muted-foreground">This note no longer exists.</div>;
  }
  if (!detail || !fields) return null;

  const kind = detail.kind as keyof typeof KIND_ICON;
  const Icon = KIND_ICON[kind] ?? User;
  const isPerson = kind === "person";

  return (
    <div className="writing h-full overflow-y-auto">
      <div className="anim-fade mx-auto w-full max-w-[720px] px-8 pb-24 pt-14">
        <p className="mb-2 flex items-center gap-1.5 text-[12px] text-muted-foreground select-none">
          {kind !== "emotion" && <Icon size={13} />} {KIND_LABEL[kind] ?? kind}
        </p>
        <input
          aria-label="Name"
          value={fields.name}
          onChange={(e) => set({ name: e.target.value })}
          onBlur={() => void rename()}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              set({ name: detail.display });
              e.currentTarget.blur();
            }
          }}
          className="mb-8 w-full rounded-md bg-transparent font-[family-name:var(--font-body)] text-[26px] leading-tight font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        />

        {isPerson && (
          <dl className="mb-8 grid grid-cols-[110px_1fr] items-center gap-x-4 gap-y-3 text-[13px]">
            <dt className="text-muted-foreground">Relationship</dt>
            <dd>
              <Input
                aria-label="Relationship"
                placeholder="friend, sister, coworker…"
                value={fields.relationship}
                onChange={(e) => set({ relationship: e.target.value })}
                onBlur={() => void commit("relationship")}
              />
            </dd>
            <dt className="text-muted-foreground">Birthday</dt>
            <dd>
              <Input
                aria-label="Birthday"
                type="date"
                className="w-[180px]"
                value={fields.birthday}
                onChange={(e) => set({ birthday: e.target.value })}
                onBlur={() => void commit("birthday")}
              />
            </dd>
          </dl>
        )}

        {kind === "note" ? (
          <div className="mb-10">
            <NoteEditor
              initial={detail.notes}
              label={`Note: ${detail.display}`}
              onSave={(body) => save({ notes: body })}
            />
          </div>
        ) : (
          <>
            <h2 className="mb-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase select-none">
              Notes
            </h2>
            <Textarea
              aria-label="Notes"
              placeholder="Anything worth remembering…"
              className="mb-10 min-h-[120px] font-[family-name:var(--font-body)] text-[15px] leading-relaxed"
              value={fields.notes}
              onChange={(e) => {
                set({ notes: e.target.value });
                window.clearTimeout(timer.current);
                timer.current = window.setTimeout(() => void flushNotes(), AUTOSAVE_MS);
              }}
              onBlur={() => void flushNotes()}
            />
          </>
        )}

        <h2 className="mb-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase select-none">
          Mentions · {detail.backlinks.length}
        </h2>
        {detail.backlinks.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">
            Nothing links here yet. Type <kbd className="font-mono">@{detail.display}</kbd> in a
            journal entry.
          </p>
        ) : (
          <ul className="flex flex-col">
            {detail.backlinks.map((m, i) => (
              <li key={`${m.path}-${i}`}>
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
        )}
      </div>
    </div>
  );
}
