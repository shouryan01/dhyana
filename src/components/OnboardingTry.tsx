import type { JSONContent } from "@tiptap/core";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import { Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useApp } from "@/app/context";
import { TagHighlight } from "@/editor/tagHighlight";
import { Triggers } from "@/editor/triggers";
import { confetti } from "@/lib/confetti";
import { isISODate } from "@/lib/dates";
import { baseTarget, setDirectory } from "@/lib/entityDirectory";
import { nameKey } from "@/lib/names";
import { SEEDED_EMOTIONS, type EntityKind, type EntitySummary } from "@/lib/schema";
import { cn } from "@/lib/utils";
import { createExtensions } from "@/markdown/extensions";

const DIRS: Record<EntityKind, string> = {
  person: "people",
  place: "places",
  emotion: "emotions",
  tag: "tags",
  note: "notes",
};

const summary = (kind: EntityKind, name: string): EntitySummary => ({
  path: `${DIRS[kind]}/${name}.md`,
  kind,
  name,
  title: null,
  display: name,
  aliases: [],
  mentions: 0,
  lastMention: null,
});

/** The sandbox's own little vault. Nothing here is written anywhere. */
const demoEntities = (): EntitySummary[] => [
  ...SEEDED_EMOTIONS.map((n) => summary("emotion", n)),
  ...["alex", "sam", "grandma"].map((n) => summary("person", n)),
  ...["home", "the park", "lisbon"].map((n) => summary("place", n)),
];
const DEMO_TAGS = [
  { tag: "work", count: 3 },
  { tag: "family", count: 2 },
  { tag: "gratitude", count: 1 },
];

interface Facts {
  kinds: Set<string>;
  tag: boolean;
}

/** What a link target is, judged against the sandbox's own entities (not the app-wide directory). */
export function kindOf(entities: EntitySummary[], target: string): string | undefined {
  const base = baseTarget(target);
  if (isISODate(base)) return "date";
  const key = nameKey(base);
  return entities.find((e) => nameKey(e.name) === key)?.kind;
}

/** What the practice note contains so far: which kinds of link, and whether there is a #tag. */
export function factsOf(doc: JSONContent, entities: EntitySummary[]): Facts {
  const facts: Facts = { kinds: new Set(), tag: false };
  const walk = (n: JSONContent) => {
    if (n.type === "wikilink") {
      const kind = kindOf(entities, String(n.attrs?.target ?? ""));
      if (kind) facts.kinds.add(kind);
    } else if (n.type === "text" && /(^|\s)#[\p{L}\d]/u.test(n.text ?? "")) {
      facts.tag = true;
    }
    n.content?.forEach(walk);
  };
  walk(doc);
  return facts;
}

const STEPS = [
  {
    id: "emotion",
    key: "!",
    short: "Feeling",
    prompt: "How are you feeling? Type ! and pick an emotion.",
    cheer: "That's an emotion chip.",
    done: (f: Facts) => f.kinds.has("emotion"),
  },
  {
    id: "who",
    key: "@",
    short: "Who or where",
    prompt: "Who or where made you feel that way? Type @ and pick someone, or type a new name.",
    cheer: "Names become links you can come back to.",
    done: (f: Facts) => f.kinds.has("person") || f.kinds.has("place"),
  },
  {
    id: "when",
    key: "$",
    short: "When",
    prompt: "When did it happen? Type $ then words like “yesterday” or “last friday”.",
    cheer: "Dates link to that day's note.",
    done: (f: Facts) => f.kinds.has("date"),
  },
  {
    id: "topic",
    key: "#",
    short: "Topic",
    prompt: "Last one: what is it about? Type # and pick a topic, or make one up.",
    cheer: "Tags gather every note on a topic.",
    done: (f: Facts) => f.tag,
  },
] as const;

const CHEERS = ["Nice!", "Great!", "Lovely!", "Perfect!"];

/** Onboarding's hands-on step: write one sentence using all four quick commands. */
export function OnboardingTry() {
  const { refreshEntities, today } = useApp();
  const ents = useRef<EntitySummary[]>(demoEntities());
  const done = useRef(new Set<string>());
  const [completed, setCompleted] = useState<string[]>([]);
  const [cheer, setCheer] = useState<{ text: string; n: number } | null>(null);

  // Chips resolve against the sandbox's entities; put the real ones back on the way out. The
  // restore is deferred and cancelled by a remount (React StrictMode mounts effects twice in dev),
  // or it would land after the second mount and wipe the sandbox's entities.
  const restore = useRef<number | undefined>(undefined);
  useEffect(() => {
    window.clearTimeout(restore.current);
    setDirectory(ents.current);
    return () => {
      restore.current = window.setTimeout(() => void refreshEntities(), 0);
    };
  }, [refreshEntities]);

  useEffect(() => {
    if (!cheer) return;
    const t = window.setTimeout(() => setCheer(null), 2400);
    return () => window.clearTimeout(t);
  }, [cheer]);

  const editor = useEditor({
    extensions: createExtensions([
      Placeholder.configure({ placeholder: "Try it here. Nothing is saved." }),
      TagHighlight,
      Triggers.configure({
        getData: () => ({ entities: ents.current, tags: DEMO_TAGS, today }),
        createEntity: async (kind, name) => {
          const made = summary(kind, name.trim());
          ents.current = [...ents.current, made];
          setDirectory(ents.current);
          return made;
        },
      }),
    ]),
    content: { type: "doc", content: [{ type: "paragraph" }] },
    autofocus: "end",
    editorProps: {
      attributes: { spellcheck: "false", "aria-label": "Practice note" },
    },
    onUpdate: ({ editor: ed }) => {
      const facts = factsOf(ed.getJSON(), ents.current);
      const fresh = STEPS.filter((s) => !done.current.has(s.id) && s.done(facts));
      if (!fresh.length) return;
      fresh.forEach((s) => done.current.add(s.id));
      setCompleted([...done.current]);
      const all = done.current.size === STEPS.length;
      const last = fresh[fresh.length - 1];
      setCheer({
        text: all ? "You've got it." : `${CHEERS[done.current.size % CHEERS.length]} ${last.cheer}`,
        n: done.current.size,
      });
      const at = ed.view.coordsAtPos(ed.state.selection.from);
      confetti({ x: at.left, y: at.top, count: all ? 170 : 55 });
    },
  });

  const current = STEPS.find((s) => !completed.includes(s.id));

  return (
    <div>
      <ol className="mb-4 flex gap-1.5" aria-label="Progress">
        {STEPS.map((s) => {
          const isDone = completed.includes(s.id);
          return (
            <li
              key={s.id}
              className={cn(
                "flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md border text-[12px] transition-colors duration-150",
                isDone
                  ? "border-primary bg-primary/10 text-foreground"
                  : s === current
                    ? "border-primary/60 text-foreground"
                    : "border-border text-muted-foreground",
              )}
            >
              {isDone ? (
                <Check size={12} className="anim-pop text-primary" />
              ) : (
                <kbd className="font-mono text-[12px]">{s.key}</kbd>
              )}
              <span className="hidden sm:inline">{s.short}</span>
            </li>
          );
        })}
      </ol>

      <div className="mb-3 min-h-[44px]">
        {cheer && (
          <p key={cheer.n} className="anim-pop mb-1 text-[14px] font-medium text-primary">
            {cheer.text}
          </p>
        )}
        <p key={current?.id ?? "finished"} className="anim-pop text-[13px] text-muted-foreground">
          {current
            ? current.prompt
            : "That's all four. They work in every note, at the start of a line or after a space."}
        </p>
      </div>

      <div
        className="writing min-h-[200px] cursor-text rounded-lg border border-border bg-popover px-3.5 py-3 text-[15px]"
        onClick={() => editor?.commands.focus("end")}
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
