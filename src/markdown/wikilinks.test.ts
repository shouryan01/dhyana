import { describe, expect, it } from "vitest";
import { createCanon, defaultSchema } from "./canon";
import type { PMNode } from "./pm";
import { loadBody, saveBody } from "./roundtrip";

const canon = createCanon(defaultSchema());
const inline = (src: string) => loadBody(src, canon).doc.content![0].content!;

const edited = (doc: PMNode, fn: (blocks: PMNode[]) => PMNode[]): PMNode => ({
  type: "doc",
  content: fn(structuredClone(doc.content!)),
});

describe("wikilinks", () => {
  it("become atoms with target and label", () => {
    const links = inline("Hi [[Alice]] and [[Paris (place)|Paris]]!\n").filter(
      (n) => n.type === "wikilink",
    );
    expect(links.map((n) => n.attrs)).toEqual([
      { target: "Alice", label: null },
      { target: "Paris (place)", label: "Paris" },
    ]);
  });

  it("leave embeds, code and empty brackets as text", () => {
    expect(inline("![[embed]] `[[code]]` [[ ]]\n").some((n) => n.type === "wikilink")).toBe(false);
  });

  it("keep surrounding marks", () => {
    const link = inline("**bold [[Bob]] link**\n").find((n) => n.type === "wikilink")!;
    expect(link.marks).toEqual([{ type: "bold" }]);
  });

  it("keep their text when their block is edited", () => {
    const { doc, ctx } = loadBody("Met [[Alice]] and [[Paris (place)|Paris]] #travel\n", canon);
    const next = edited(doc, (b) => {
      b[0].content!.push({ type: "text", text: " more" });
      return b;
    });
    expect(saveBody(ctx, next, canon)).toBe(
      "Met [[Alice]] and [[Paris (place)|Paris]] #travel more\n",
    );
  });

  it("serialize a freshly inserted link as wikilink syntax", () => {
    const { doc, ctx } = loadBody("", canon);
    const next = edited(doc, () => [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Saw " },
          { type: "wikilink", attrs: { target: "Alice", label: null } },
          { type: "text", text: " on " },
          { type: "wikilink", attrs: { target: "2026-11-06", label: "Fri, Nov 6" } },
        ],
      },
    ]);
    expect(saveBody(ctx, next, canon)).toBe("Saw [[Alice]] on [[2026-11-06|Fri, Nov 6]]\n");
  });
});
