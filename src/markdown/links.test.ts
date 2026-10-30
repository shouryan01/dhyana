import { describe, expect, it } from "vitest";
import { nameKey } from "@/lib/names";
import { rewriteLinks, scanLinks } from "./links";

describe("scanLinks", () => {
  it("finds links with labels and anchors", () => {
    const t =
      "Met [[Alice]] and [[Paris (place)|Paris]], see [[Bob#plans]] and [[2026-12-25|Mom's birthday]].";
    expect(scanLinks(t).links.map((l) => [l.target, l.label])).toEqual([
      ["Alice", null],
      ["Paris (place)", "Paris"],
      ["Bob", null],
      ["2026-12-25", "Mom's birthday"],
    ]);
  });

  it("ignores embeds, code and fences", () => {
    const t = "![[embed]] `[[inline]]` and [[real]]\n```\n[[fenced]] #nope\n```\nafter [[also]]";
    const s = scanLinks(t);
    expect(s.links.map((l) => l.target)).toEqual(["real", "also"]);
    expect(s.tags).toEqual([]);
  });

  it("tags need whitespace before and a non-digit", () => {
    expect(scanLinks("#work and #deep/focus, a#b, #123, # heading\n#gratitude").tags).toEqual([
      "work",
      "deep/focus",
      "gratitude",
    ]);
    expect(scanLinks("## Heading").tags).toEqual([]);
    expect(scanLinks("[[Note #x]] and `#y`").tags).toEqual([]);
  });

  it("context is the trimmed line", () => {
    expect(scanLinks("first\n  met [[Alice]] today  \n").links[0].context).toBe(
      "met [[Alice]] today",
    );
  });
});

describe("rewriteLinks", () => {
  it("keeps labels, anchors and everything else", () => {
    const t = "A [[alice]] B [[Alice|Al]] C [[Alice#sec]] D [[Bob]] E `[[Alice]]` F ![[Alice]]\r\n";
    const [out, n] = rewriteLinks(t, nameKey("Alice"), "Alicia");
    expect(n).toBe(3);
    expect(out).toBe(
      "A [[Alicia]] B [[Alicia|Al]] C [[Alicia#sec]] D [[Bob]] E `[[Alice]]` F ![[Alice]]\r\n",
    );
  });

  it("is the identity with no hits", () => {
    expect(rewriteLinks("nothing [[here]]", "zzz", "x")).toEqual(["nothing [[here]]", 0]);
  });
});
