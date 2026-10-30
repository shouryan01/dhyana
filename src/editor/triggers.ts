/**
 * The quick-command triggers as one Tiptap extension: `@` people and places, `!` emotions,
 * `#` tags, `$` dates. Each fires only at the start of a line or after whitespace.
 */
import { Extension, type Editor, type Range } from "@tiptap/core";
import { PluginKey, type EditorState } from "@tiptap/pm/state";
import { ReactRenderer } from "@tiptap/react";
import Suggestion, { type SuggestionProps } from "@tiptap/suggestion";
import { toast } from "sonner";
import { SuggestList, type SuggestListHandle } from "@/editor/SuggestList";
import {
  ALLOWS_SPACES,
  itemsFor,
  linkTo,
  type Insert,
  type SuggestItem,
  type TriggerChar,
  type TriggerData,
} from "@/editor/suggest";
import type { EntityKind, EntitySummary } from "@/lib/schema";

export interface TriggerOptions {
  /** Read at the moment of typing, so the lists are always current. */
  getData(): TriggerData;
  createEntity(kind: EntityKind, name: string): Promise<EntitySummary>;
}

const TRIGGERS: TriggerChar[] = ["@", "!", "#", "$"];

/** True at the start of a block, after whitespace, or after a hard break. */
export function atBoundary(state: EditorState, pos: number): boolean {
  const before = state.doc.resolve(pos).nodeBefore;
  if (!before) return true;
  if (before.isText) return /\s$/.test(before.text ?? "");
  return before.type.name === "hardBreak";
}

const contentOf = (insert: Insert) =>
  insert.type === "link"
    ? { type: "wikilink", attrs: { target: insert.target, label: insert.label } }
    : { type: "text", text: insert.text };

async function pick(editor: Editor, range: Range, item: SuggestItem, opts: TriggerOptions) {
  let insert = item.insert;
  if (item.create) {
    try {
      const made = await opts.createEntity(item.create.kind, item.create.name);
      if (item.create.kind !== "tag") insert = linkTo(made);
    } catch (e) {
      // A tag that already exists is fine to reuse; for a person or place, tell the user why not.
      if (item.create.kind !== "tag") {
        toast.error(String(e instanceof Error ? e.message : e));
        return;
      }
    }
  }
  editor.chain().focus().insertContentAt(range, contentOf(insert)).run();
}

function popupRenderer(opts: TriggerOptions) {
  return () => {
    let component: ReactRenderer<SuggestListHandle> | null = null;
    let unmount: (() => void) | null = null;
    let active = false; // one renderer serves every session of this trigger
    // ReactRenderer flushes synchronously, which React forbids while it is committing (the editor
    // can be updated from a render). A microtask is always safe.
    const sync = (props: SuggestionProps<SuggestItem, SuggestItem>) => {
      active = true;
      queueMicrotask(() => render(props));
    };

    const render = (props: SuggestionProps<SuggestItem, SuggestItem>) => {
      if (!active) return;
      const pickItem = (item: SuggestItem) => void pick(props.editor, props.range, item, opts);
      if (!component) {
        component = new ReactRenderer(SuggestList, {
          editor: props.editor,
          props: { items: props.items, command: pickItem },
        });
      } else {
        component.updateProps({ items: props.items, command: pickItem });
      }
      // Nothing to offer (not a name, not a date...): stay out of the way, and out of the keys.
      if (props.items.length && !unmount) {
        component.element.setAttribute("data-suggest-popup", "");
        unmount = props.mount(component.element);
      } else if (!props.items.length && unmount) {
        unmount();
        unmount = null;
      }
    };

    return {
      onStart: sync,
      onUpdate: sync,
      onKeyDown: ({ event }: { event: KeyboardEvent }) =>
        unmount ? (component?.ref?.onKeyDown(event) ?? false) : false,
      onExit: () => {
        active = false;
        queueMicrotask(() => {
          if (active) return; // a new session already started
          unmount?.();
          unmount = null;
          component?.destroy();
          component = null;
        });
      },
    };
  };
}

export const Triggers = Extension.create<TriggerOptions>({
  name: "entityTriggers",

  addProseMirrorPlugins() {
    const opts = this.options;
    return TRIGGERS.map((char) =>
      Suggestion<SuggestItem, SuggestItem>({
        editor: this.editor,
        char,
        pluginKey: new PluginKey(`trigger-${char}`),
        allowSpaces: ALLOWS_SPACES[char],
        allowedPrefixes: null, // the boundary rule is enforced in `allow`
        allow: ({ state, range }) => atBoundary(state, range.from),
        items: ({ query }) => itemsFor(char, query, opts.getData()),
        command: ({ editor, range, props }) => void pick(editor, range, props, opts),
        render: popupRenderer(opts),
      }),
    );
  },
});
