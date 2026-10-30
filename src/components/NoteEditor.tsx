import type { Editor } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect, useRef } from "react";
import { useApp } from "@/app/context";
import { registerFlush } from "@/app/flush";
import { editorExtensions, useOpenWikilink } from "@/editor/wiring";
import { createCanon, defaultSchema } from "@/markdown/canon";
import type { PMNode } from "@/markdown/pm";
import { loadBody, saveBody, type BodyContext } from "@/markdown/roundtrip";

const AUTOSAVE_MS = 700;
const canon = createCanon(defaultSchema());

/**
 * The body of a plain note, in the same editor as the journal: lossless markdown, `@ ! # $`, and
 * `[[links]]`. It loads `initial` once and saves the whole body through `onSave` as you type.
 */
export function NoteEditor({
  initial,
  label,
  onSave,
}: {
  initial: string;
  label: string;
  onSave(body: string): Promise<void>;
}) {
  const app = useApp();
  const appRef = useRef(app);
  appRef.current = app;
  const openLink = useOpenWikilink();

  const ctx = useRef<BodyContext>(null!);
  const initialDoc = useRef<PMNode>(null!);
  if (!initialDoc.current) {
    const loaded = loadBody(initial, canon);
    ctx.current = loaded.ctx;
    initialDoc.current = loaded.doc;
  }
  const lastBody = useRef(initial); // what is saved, as far as we know
  const saving = useRef<Promise<void>>(Promise.resolve());
  const timer = useRef<number | undefined>(undefined);
  const editorRef = useRef<Editor | null>(null);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  const editor = useEditor({
    extensions: editorExtensions(appRef, "Start writing…"),
    content: initialDoc.current,
    editorProps: {
      attributes: { spellcheck: "true", "aria-label": label },
      handleDOMEvents: {
        click: (_view, event) => {
          const chip = (event.target as HTMLElement).closest<HTMLElement>("[data-wikilink]");
          if (!chip) return false;
          openLink(chip);
          return true;
        },
      },
    },
    onUpdate: () => schedule(),
    onBlur: () => void flush(),
  });
  editorRef.current = editor;

  const persist = (): Promise<void> => {
    saving.current = saving.current.then(async () => {
      const ed = editorRef.current;
      if (!ed || ed.isDestroyed) return;
      const body = saveBody(ctx.current, ed.getJSON() as PMNode, canon);
      if (body === lastBody.current) return;
      try {
        await onSaveRef.current(body);
        lastBody.current = body;
      } catch (e) {
        console.error("save failed", e);
      }
    });
    return saving.current;
  };
  const flush = () => {
    window.clearTimeout(timer.current);
    return persist();
  };
  const schedule = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void persist(), AUTOSAVE_MS);
  };

  const latest = useRef(flush);
  latest.current = flush;
  useEffect(() => {
    const off = registerFlush(() => latest.current());
    return () => {
      off();
      void latest.current();
    };
  }, []);

  return <EditorContent editor={editor} />;
}
