import type { Editor } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import Placeholder from "@tiptap/extension-placeholder";
import { useEffect, useRef, useState } from "react";
import { useApp } from "@/app/context";
import { registerFlush } from "@/app/flush";
import { Button } from "@/components/ui/button";
import { backend } from "@/lib";
import type { DayFile } from "@/lib/backend";
import { formatLong } from "@/lib/dates";
import { createCanon, defaultSchema } from "@/markdown/canon";
import { createExtensions } from "@/markdown/extensions";
import type { PMNode } from "@/markdown/pm";
import { loadBody, saveBody, type BodyContext } from "@/markdown/roundtrip";

const AUTOSAVE_MS = 700;
const canon = createCanon(defaultSchema());

/** Loads the day file, then mounts the editor with it (a fresh editor per day = fresh undo history). */
export function DayView({ date }: { date: string }) {
  const [file, setFile] = useState<DayFile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setFile(null);
    setError(null);
    backend
      .readDay(date)
      .then((f) => live && setFile(f))
      .catch((e) => live && setError(String(e)));
    return () => {
      live = false;
    };
  }, [date]);

  if (error) {
    return <div className="p-10 text-muted">Couldn't open this note: {error}</div>;
  }
  if (!file) return null; // local reads are near-instant; no spinner
  return <DayEditor key={date} date={date} initial={file} />;
}

interface Disk {
  file: DayFile;
}

function DayEditor({ date, initial }: { date: string; initial: DayFile }) {
  const app = useApp();
  const [meta, setMeta] = useState({ created: initial.created, modified: initial.modified });
  const [external, setExternal] = useState<Disk | null>(null);

  // Mutable bookkeeping that must not trigger renders.
  const ctx = useRef<BodyContext>(null!);
  const lastBody = useRef(initial.body); // what is on disk (as far as we know)
  const hash = useRef(initial.hash);
  const saving = useRef<Promise<void>>(Promise.resolve());
  const timer = useRef<number | undefined>(undefined);
  const initialDoc = useRef<PMNode>(null!);
  if (!initialDoc.current) {
    const loaded = loadBody(initial.body, canon);
    ctx.current = loaded.ctx;
    initialDoc.current = loaded.doc;
  }

  const appRef = useRef(app);
  appRef.current = app;
  const editorRef = useRef<Editor | null>(null);

  // Everything below reads refs only, so callbacks captured by the editor never go stale.
  const editor = useEditor({
    extensions: createExtensions([Placeholder.configure({ placeholder: "Start writing…" })]),
    content: initialDoc.current,
    editorProps: { attributes: { spellcheck: "true", "aria-label": `Journal entry for ${date}` } },
    onUpdate: () => schedule(),
    onBlur: () => void flush(),
  });
  editorRef.current = editor;

  const currentBody = (): string | null =>
    editorRef.current ? saveBody(ctx.current, editorRef.current.getJSON() as PMNode, canon) : null;

  const persist = (force: boolean): Promise<void> => {
    saving.current = saving.current.then(async () => {
      const body = currentBody();
      if (body === null) return;
      if (body === lastBody.current && !force) return;
      try {
        const res = await backend.saveDay(date, body, hash.current || null, force);
        if (res.status === "conflict") {
          setExternal({ file: await backend.readDay(date) });
          return;
        }
        if (res.status === "saved") {
          const created = !hash.current;
          lastBody.current = body;
          hash.current = res.hash;
          setMeta({ created: res.created, modified: res.modified });
          setExternal(null);
          if (created) appRef.current.bumpDays();
        }
      } catch (e) {
        console.error("save failed", e);
      }
    });
    return saving.current;
  };

  const flush = async () => {
    window.clearTimeout(timer.current);
    await persist(false);
  };

  const schedule = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void persist(false), AUTOSAVE_MS);
  };

  const applyDisk = (f: DayFile) => {
    const ed = editorRef.current;
    if (!ed) return;
    const loaded = loadBody(f.body, canon);
    ctx.current = loaded.ctx;
    ed.commands.setContent(loaded.doc, { emitUpdate: false });
    lastBody.current = f.body;
    hash.current = f.hash;
    setMeta({ created: f.created, modified: f.modified });
    setExternal(null);
  };

  const checkExternal = async () => {
    const f = await backend.readDay(date);
    if (f.hash === hash.current) return; // our own write, or nothing changed
    const dirty = currentBody() !== lastBody.current;
    if (!dirty) applyDisk(f);
    else setExternal({ file: f });
  };

  const latest = useRef({ flush, checkExternal });
  latest.current = { flush, checkExternal };

  // Flush on unmount (navigation) and on quit.
  useEffect(() => {
    const off = registerFlush(() => latest.current.flush());
    return () => {
      off();
      void latest.current.flush();
    };
  }, []);

  useEffect(() => {
    let off: (() => void) | undefined;
    backend
      .onVaultChanged((dates) => {
        if (!dates.includes(date)) return;
        // Wait for any in-flight save to settle, so we never mistake our own write for an external one.
        void saving.current.then(() => latest.current.checkExternal());
      })
      .then((u) => (off = u));
    return () => off?.();
  }, [date]);

  // Focus: editor registers itself for "Focus editor"; today's note takes focus on open.
  useEffect(() => {
    if (!editor) return;
    app.focusEditor.current = () => editor.commands.focus("end");
    if (date === app.today && !app.paletteOpen) editor.commands.focus("end");
    return () => {
      app.focusEditor.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, date]);

  return (
    <div className="writing h-full overflow-y-auto" onClick={(e) => e.target === e.currentTarget && editor?.commands.focus("end")}>
      <div className="anim-fade mx-auto w-full max-w-[720px] px-8 pb-24 pt-14">
        <header className="mb-8 select-none">
          <h1 className="font-[family-name:var(--font-body)] text-[26px] font-semibold leading-tight text-surface-fg">
            {formatLong(date)}
          </h1>
          <p className="mt-1 text-[12px] text-surface-muted">
            {date === app.today ? "Today · " : ""}
            {meta.created ? `Created ${formatTime(meta.created)}` : "Not saved yet — start typing"}
            {meta.modified && meta.modified !== meta.created ? ` · Edited ${formatTime(meta.modified)}` : ""}
          </p>
        </header>

        {external && (
          <div role="alert" className="mb-6 flex items-center gap-3 rounded-lg border border-border bg-popover px-4 py-3 text-fg select-none">
            <span className="flex-1 text-[13px]">This note changed on disk while you were editing.</span>
            <Button size="sm" onClick={() => applyDisk(external.file)}>
              Load disk version
            </Button>
            <Button size="sm" variant="primary" onClick={() => void persist(true)}>
              Keep mine
            </Button>
          </div>
        )}

        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const sameDay = d.toDateString() === new Date().toDateString();
  return d.toLocaleString(undefined, sameDay ? { hour: "numeric", minute: "2-digit" } : { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
