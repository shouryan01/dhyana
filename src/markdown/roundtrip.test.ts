import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createCanon, defaultSchema } from "./canon";
import { loadBody, saveBody } from "./roundtrip";
import type { PMNode } from "./pm";

const dir = join(__dirname, "__fixtures__");
const fixtures = readdirSync(dir)
  .filter((f) => f.endsWith(".md"))
  .map((f) => ({ name: f, text: readFileSync(join(dir, f), "utf8").replace(/\r\n/g, "\n") }));

const canon = createCanon(defaultSchema());
const crlf = (s: string) => s.replace(/\n/g, "\r\n");

const textBlock = (text: string): PMNode => ({ type: "paragraph", content: [{ type: "text", text }] });

/** Simulates the editor: the doc goes through the schema before saving. */
const edited = (doc: PMNode, fn: (blocks: PMNode[]) => PMNode[]): PMNode => ({
  type: "doc",
  content: fn(structuredClone(doc.content!)),
});

describe("lossless load -> save", () => {
  for (const { name, text } of fixtures) {
    for (const [label, src] of [["LF", text], ["CRLF", crlf(text)]] as const) {
      it(`${name} (${label}) is byte-identical when untouched`, () => {
        const { doc, ctx } = loadBody(src, canon);
        // The editor hands back the doc via the schema; make sure that doesn't disturb matching.
        const viaEditor = canon(doc);
        expect(saveBody(ctx, viaEditor, canon)).toBe(src);
      });
    }
  }
});

describe("editing one block", () => {
  const src = "# Title\n\nFirst paragraph.\n\n- a\n- b\n\n| t |\n|---|\n| 1 |\n\nLast one.\n";

  it("re-serializes only the edited block", () => {
    const { doc, ctx } = loadBody(src, canon);
    const next = edited(doc, (b) => {
      b[1] = textBlock("First paragraph, edited.");
      return b;
    });
    expect(saveBody(ctx, next, canon)).toBe(src.replace("First paragraph.", "First paragraph, edited."));
  });

  it("keeps CRLF line endings for new text", () => {
    const { doc, ctx } = loadBody(crlf(src), canon);
    const next = edited(doc, (b) => {
      b.push({ type: "bulletList", content: [{ type: "listItem", content: [textBlock("x")] }] });
      return b;
    });
    const out = saveBody(ctx, next, canon);
    expect(out.startsWith(crlf(src.trimEnd()))).toBe(true);
    expect(out).not.toMatch(/[^\r]\n/);
  });

  it("preserves list style when one item changes", () => {
    const original = "* one\n* two\n* three\n";
    const { doc, ctx } = loadBody(original, canon);
    const next = edited(doc, (b) => {
      b[0].content![1].content = [textBlock("TWO")];
      return b;
    });
    expect(saveBody(ctx, next, canon)).toBe("* one\n* TWO\n* three\n");
  });

  it("deleting a block drops only that block", () => {
    const { doc, ctx } = loadBody(src, canon);
    const next = edited(doc, (b) => b.filter((_, i) => i !== 1));
    const out = saveBody(ctx, next, canon);
    expect(out).toContain("# Title");
    expect(out).not.toContain("First paragraph");
    expect(out).toContain("| t |\n|---|\n| 1 |");
  });
});

describe("new notes", () => {
  it("empty body loads as one empty paragraph and saves unchanged when untouched", () => {
    const { doc, ctx } = loadBody("", canon);
    expect(doc.content).toEqual([{ type: "paragraph" }]);
    expect(saveBody(ctx, doc, canon)).toBe("");
  });

  it("typing into an empty note produces a clean paragraph", () => {
    const { doc, ctx } = loadBody("", canon);
    const next = edited(doc, () => [textBlock("Hello *world*")]);
    expect(saveBody(ctx, next, canon)).toBe("Hello \\*world\\*\n");
  });
});

describe("serializer is semantically stable", () => {
  // Forcing every block through the serializer must reparse to the same document.
  for (const { name, text } of fixtures) {
    it(`${name}: serialize(all blocks) reparses to the same doc`, () => {
      const first = loadBody(text, canon);
      const out = saveBody(first.ctx, first.doc, canon, { forceSerialize: true });
      const second = loadBody(out, canon);
      expect(second.doc).toEqual(first.doc);
    });
  }

  it("marks, links and escapes survive", () => {
    const src =
      "**bold _and italic_** with ~~strike~~, `code`, [a link](https://x.test/a_b), a \\* star, 1\\. not a list\n";
    const first = loadBody(src, canon);
    const out = saveBody(first.ctx, first.doc, canon, { forceSerialize: true });
    expect(loadBody(out, canon).doc).toEqual(first.doc);
  });
});

describe("parsing is not trivially opaque", () => {
  const types = (name: string) =>
    loadBody(fixtures.find((f) => f.name === name)!.text, canon).doc.content!.map((n) => n.type);

  it("obsidian note maps to editable nodes", () => {
    expect(types("obsidian.md")).toEqual([
      "heading", "paragraph", "taskList", "blockquote", "heading", "bulletList",
      "orderedList", "paragraph", "horizontalRule", "codeBlock",
    ]);
  });

  it("unsupported constructs become opaque blocks, the rest stays editable", () => {
    const t = types("raw-blocks.md");
    expect(t.filter((x) => x === "rawBlock").length).toBeGreaterThanOrEqual(5);
    expect(t).toContain("codeBlock");
    expect(t).toContain("heading");
  });

  it("inline images/html/footnote refs are opaque inline atoms inside a paragraph", () => {
    const { doc } = loadBody(fixtures.find((f) => f.name === "raw-blocks.md")!.text, canon);
    const para = doc.content!.find((n) => n.type === "paragraph" && n.content?.some((c) => c.type === "rawInline"));
    expect(para!.content!.filter((c) => c.type === "rawInline").length).toBe(4);
  });
});

describe("mixed task / plain lists", () => {
  it("stays a bullet list with literal [x] text instead of turning every item into a checkbox", () => {
    const { doc } = loadBody("- plain\n- [x] done\n- [ ] todo\n", canon);
    expect(doc.content![0].type).toBe("bulletList");
    const texts = doc.content![0].content!.map((li) => li.content![0].content![0].text);
    expect(texts).toEqual(["plain", "[x] done", "[ ] todo"]);
  });

  it("pure task lists are still task lists", () => {
    const { doc } = loadBody("- [x] a\n- [ ] b\n", canon);
    expect(doc.content![0].type).toBe("taskList");
  });
});
