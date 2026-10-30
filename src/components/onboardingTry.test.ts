import { describe, expect, it } from "vitest";
import { factsOf, kindOf } from "@/components/OnboardingTry";
import type { EntitySummary } from "@/lib/schema";

const ent = (kind: string, name: string): EntitySummary => ({
  path: `${kind}/${name}.md`,
  kind,
  name,
  title: null,
  display: name,
  aliases: [],
  mentions: 0,
  lastMention: null,
});
const entities = [ent("emotion", "Calm"), ent("person", "Alex"), ent("place", "Home")];
const link = (target: string) => ({ type: "wikilink", attrs: { target, label: null } });
const doc = (...content: object[]) => ({ type: "doc", content: [{ type: "paragraph", content }] });

describe("practice note progress", () => {
  it("knows what a link is from the sandbox's entities, case-insensitively", () => {
    expect(kindOf(entities, "calm")).toBe("emotion");
    expect(kindOf(entities, "Alex#plans")).toBe("person");
    expect(kindOf(entities, "2026-12-25")).toBe("date");
    expect(kindOf(entities, "Nobody")).toBeUndefined();
  });

  it("collects the kinds of link and spots a #tag", () => {
    const f = factsOf(
      doc(
        { type: "text", text: "Felt " },
        link("Calm"),
        { type: "text", text: " at " },
        link("Home"),
        link("2026-12-25"),
        { type: "text", text: " #work" },
      ),
      entities,
    );
    expect([...f.kinds].sort()).toEqual(["date", "emotion", "place"]);
    expect(f.tag).toBe(true);
  });

  it("does not count a lone # or a # inside a word", () => {
    expect(factsOf(doc({ type: "text", text: "item# 3 and #" }), entities).tag).toBe(false);
  });
});
