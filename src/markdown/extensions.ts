import { Node, mergeAttributes, type AnyExtension } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { BulletList, OrderedList, TaskItem, TaskList } from "@tiptap/extension-list";
import CodeBlock from "@tiptap/extension-code-block";
import Link from "@tiptap/extension-link";

/**
 * Extra node attributes remember how a list/fence was written in the source so that
 * re-serializing an edited block keeps its style. They are never rendered to the DOM.
 */
const hidden = (def: unknown) => ({ default: def, rendered: false });

const listAttrs = (parent: (() => Record<string, unknown>) | undefined, extra: Record<string, unknown> = {}) => ({
  ...(parent?.() ?? {}),
  marker: hidden("-"),
  spread: hidden(false),
  ...extra,
});

const DhyanaBulletList = BulletList.extend({
  addAttributes() {
    return listAttrs(this.parent);
  },
});

const DhyanaOrderedList = OrderedList.extend({
  addAttributes() {
    return listAttrs(this.parent, { delim: hidden(".") });
  },
});

const DhyanaTaskList = TaskList.extend({
  addAttributes() {
    return listAttrs(this.parent);
  },
});

const DhyanaCodeBlock = CodeBlock.extend({
  addAttributes() {
    return { ...(this.parent?.() ?? {}), fence: hidden("```") };
  },
});

const DhyanaLink = Link.extend({
  addAttributes() {
    return { ...(this.parent?.() ?? {}), title: { default: null } };
  },
});

/** A whole top-level block we have no editable node for (table, footnote, raw HTML, AI block...). */
export const RawBlock = Node.create({
  name: "rawBlock",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,
  addAttributes() {
    return { source: { default: "" } };
  },
  parseHTML() {
    return [
      {
        tag: "div[data-raw-block]",
        getAttrs: (el) => ({ source: (el as HTMLElement).getAttribute("data-source") ?? "" }),
      },
    ];
  },
  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-raw-block": "",
        "data-source": node.attrs.source,
        class: "raw-block",
      }),
      ["pre", node.attrs.source],
    ];
  },
});

/** An inline construct we cannot represent (image, inline HTML, footnote ref...). Kept verbatim. */
export const RawInline = Node.create({
  name: "rawInline",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return { source: { default: "" } };
  },
  parseHTML() {
    return [
      {
        tag: "span[data-raw-inline]",
        getAttrs: (el) => ({ source: (el as HTMLElement).getAttribute("data-source") ?? "" }),
      },
    ];
  },
  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-raw-inline": "",
        "data-source": node.attrs.source,
        class: "raw-inline",
      }),
      node.attrs.source,
    ];
  },
});

/** Shared by the editor and the headless tests, so both see exactly the same schema. */
export function createExtensions(extra: AnyExtension[] = []): AnyExtension[] {
  return [
    StarterKit.configure({
      underline: false,
      trailingNode: false,
      link: false,
      bulletList: false,
      orderedList: false,
      codeBlock: false,
    }),
    DhyanaBulletList,
    DhyanaOrderedList,
    DhyanaTaskList,
    TaskItem.configure({ nested: true }),
    DhyanaCodeBlock,
    DhyanaLink.configure({ openOnClick: false, autolink: false, linkOnPaste: true }),
    RawBlock,
    RawInline,
    ...extra,
  ];
}
