import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

const TAG = /(^|\s)(#[\p{L}\p{N}_/-]+)/gu;

/** Styles `#tag` text as a tag. Display only: the document keeps plain `#tag` text. */
export const TagHighlight = Extension.create({
  name: "tagHighlight",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("tag-highlight"),
        props: {
          decorations(state) {
            const decorations: Decoration[] = [];
            state.doc.descendants((node, pos, parent) => {
              if (!node.isText || !node.text) return;
              if (parent?.type.name === "codeBlock") return;
              if (node.marks.some((m) => m.type.name === "code")) return;
              for (const m of node.text.matchAll(TAG)) {
                const tag = m[2];
                if (!/\D/.test(tag.slice(1))) continue; // "#123" is not a tag
                const from = pos + m.index + m[1].length;
                decorations.push(Decoration.inline(from, from + tag.length, { class: "tag" }));
              }
            });
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});
