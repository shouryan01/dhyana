import { describe, expect, it } from "vitest";
import type { EntitySummary } from "@/lib/schema";
import {
  dateItems,
  emotionItems,
  itemsFor,
  matchRank,
  mentionItems,
  tagItems,
  type TriggerData,
} from "./suggest";

const ent = (kind: string, name: string, extra: Partial<EntitySummary> = {}): EntitySummary => ({
  path: `${kind}/${name}.md`,
  kind,
  name,
  title: null,
  display: name,
  aliases: [],
  mentions: 0,
  lastMention: null,
  ...extra,
});

const data: TriggerData = {
  today: "2026-10-28", // a Wednesday
  entities: [
    ent("person", "Alice", { aliases: ["Ali"], mentions: 5, lastMention: "2026-10-20" }),
    ent("person", "Alicia", { mentions: 9, lastMention: "2026-10-27" }),
    ent("person", "Bob", { mentions: 1 }),
    ent("person", "Anna Smith"),
    ent("place", "Paris (place)", { title: "Paris", display: "Paris", aliases: ["Paris"] }),
    ent("person", "Paris"),
    ent("emotion", "sad"),
    ent("emotion", "salty"),
    ent("emotion", "calm"),
  ],
  tags: [
    { tag: "work", count: 4 },
    { tag: "workout", count: 1 },
    { tag: "gratitude", count: 2 },
  ],
};

const labels = (items: { label: string }[]) => items.map((i) => i.label);

describe("matchRank", () => {
  it("ranks exact, prefix, word-prefix, contains", () => {
    expect(matchRank(["Alice"], "alice")).toBe(0);
    expect(matchRank(["Alice"], "ali")).toBe(1);
    expect(matchRank(["Anna Smith"], "smi")).toBe(2);
    expect(matchRank(["Alice"], "lic")).toBe(3);
    expect(matchRank(["Alice"], "zzz")).toBeNull();
    expect(matchRank(["Alice"], "")).toBe(0);
  });

  it("matches any of several names", () => {
    expect(matchRank(["Alice", "Ali"], "ali")).toBe(0); // the alias matches exactly
    expect(matchRank(["Robert", "Bob"], "bob")).toBe(0);
  });
});

describe("@ people and places", () => {
  it("empty query lists the most recently and most often mentioned first", () => {
    const items = mentionItems("", data);
    expect(labels(items).slice(0, 3)).toEqual(["Alicia", "Alice", "Bob"]);
    expect(items.some((i) => i.icon === "create")).toBe(false);
  });

  it("searches names and aliases: exact beats prefix, then recency", () => {
    // "ali" is Alice's exact alias, so she leads; Alicia is only a prefix match.
    expect(labels(mentionItems("ali", data)).slice(0, 2)).toEqual(["Alice", "Alicia"]);
    // Both are prefix matches for "alic": the more recently mentioned one comes first.
    expect(labels(mentionItems("alic", data)).slice(0, 2)).toEqual(["Alicia", "Alice"]);
    expect(mentionItems("smi", data)[0].label).toBe("Anna Smith");
  });

  it("links by filename, with a label only when the display differs", () => {
    const alice = mentionItems("alice", data).find((i) => i.label === "Alice")!;
    expect(alice.insert).toEqual({ type: "link", target: "Alice", label: null });
    const paris = mentionItems("paris", data).find((i) => i.icon === "place")!;
    expect(paris.insert).toEqual({ type: "link", target: "Paris (place)", label: "Paris" });
  });

  it("offers to create a person or place when nothing matches exactly, in lowercase", () => {
    const items = mentionItems("Zed", data);
    expect(items.filter((i) => i.icon === "create").map((i) => i.create)).toEqual([
      { kind: "person", name: "zed" },
      { kind: "place", name: "zed" },
    ]);
    expect(items.at(-1)?.label).toBe("Create place “zed”");
  });

  it("only offers the kind that doesn't exist yet", () => {
    const create = mentionItems("Paris", data).filter((i) => i.icon === "create");
    expect(create).toEqual([]); // both a person and a place called Paris exist
    const bob = mentionItems("Bob", data).filter((i) => i.icon === "create");
    expect(bob.map((i) => i.create?.kind)).toEqual(["place"]);
  });

  it("does not offer to create a person out of a sentence", () => {
    expect(mentionItems("Alice went to the shop", data)).toEqual([]);
    expect(mentionItems("alice went", data).some((i) => i.icon === "create")).toBe(false);
    expect(mentionItems("Zed Quinn", data).some((i) => i.icon === "create")).toBe(true);
  });

  it("shows nothing for a query that starts with a space (a stray @)", () => {
    expect(mentionItems(" noon", data)).toEqual([]);
  });
});

describe("! emotions", () => {
  it("lists only emotions and never offers to create", () => {
    expect(labels(emotionItems("sa", data))).toEqual(["sad", "salty"]);
    expect(emotionItems("xyz", data)).toEqual([]);
    expect(emotionItems("sad", data)[0].insert).toEqual({
      type: "link",
      target: "sad",
      label: null,
    });
  });
});

describe("# tags", () => {
  it("lists matching tags, best match then most used", () => {
    expect(labels(tagItems("wor", data)).slice(0, 2)).toEqual(["#work", "#workout"]);
    expect(tagItems("work", data)[0].insert).toEqual({ type: "text", text: "#work" });
  });

  it("offers to create a new tag, but not for an existing one or a number", () => {
    expect(tagItems("dreams", data).at(-1)).toMatchObject({
      icon: "create",
      create: { kind: "tag", name: "dreams" },
      insert: { type: "text", text: "#dreams" },
    });
    expect(tagItems("work", data).some((i) => i.icon === "create")).toBe(false);
    expect(tagItems("123", data).some((i) => i.icon === "create")).toBe(false);
  });
});

describe("$ dates", () => {
  it("parses natural language into an event link", () => {
    const [item] = dateItems("next friday", data);
    expect(item.insert).toMatchObject({ type: "link", target: "2026-10-30" });
  });

  it("suggests a few shortcuts for an empty query", () => {
    const targets = dateItems("", data).map((i) =>
      i.insert.type === "link" ? i.insert.target : "",
    );
    expect(targets).toEqual(["2026-10-29", "2026-10-30", "2026-11-04"]);
  });

  it("stays silent for things that aren't dates, like prices", () => {
    expect(dateItems("5 for lunch", data)).toEqual([]);
    expect(dateItems("20", data)).toEqual([]);
    expect(dateItems("a very long sentence that is not a date", data)).toEqual([]);
  });

  it("labels the link without the year when it is this year", () => {
    const [thisYear] = dateItems("dec 25", data);
    const [later] = dateItems("dec 25 2027", data);
    expect((thisYear.insert as { label: string }).label).not.toMatch(/2026/);
    expect((later.insert as { label: string }).label).toMatch(/2027/);
  });
});

describe("itemsFor", () => {
  it("routes each trigger to its list", () => {
    expect(itemsFor("@", "bob", data)[0].label).toBe("Bob");
    expect(itemsFor("!", "calm", data)[0].label).toBe("calm");
    expect(itemsFor("#", "grat", data)[0].label).toBe("#gratitude");
    expect(itemsFor("$", "tomorrow", data)[0].insert).toMatchObject({ target: "2026-10-29" });
  });
});
