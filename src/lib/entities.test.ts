import { beforeEach, describe, expect, it } from "vitest";
import { nameKey, fileStem } from "./names";
import { createMemoryBackend } from "./memoryBackend";
import type { Backend } from "./backend";

describe("names", () => {
  it("keys ignore case and Unicode form", () => {
    expect(nameKey("Alice")).toBe(nameKey("  alice "));
    expect(nameKey("René")).toBe(nameKey("René"));
  });

  it("stems replace illegal characters and refuse dates", () => {
    expect(fileStem("AC/DC: live?")).toEqual({ ok: true, stem: "AC-DC- live-" });
    expect(fileStem("  Cafe   Nero. ")).toEqual({ ok: true, stem: "Cafe Nero" });
    expect(fileStem("CON")).toEqual({ ok: true, stem: "CON_" });
    expect(fileStem("   ").ok).toBe(false);
    expect(fileStem("2026-12-25").ok).toBe(false);
    expect(fileStem("2026-12-25 party").ok).toBe(true);
  });
});

describe("entities in the in-memory backend", () => {
  let be: Backend;
  beforeEach(async () => {
    be = createMemoryBackend();
    // A fresh vault each time: clear anything a previous test left in storage.
    for (const e of await be.listEntities())
      if (e.kind !== "emotion") throw new Error("dirty store");
  });

  it("starts with the seeded emotions", async () => {
    const all = await be.listEntities();
    expect(all.length).toBeGreaterThan(20);
    expect(all.every((e) => e.kind === "emotion")).toBe(true);
    expect(all.some((e) => e.name === "sad")).toBe(true);
  });

  it("creates, lists, and rejects duplicates", async () => {
    const alice = await be.createEntity("person", " Alice ");
    expect(alice).toMatchObject({
      path: "people/Alice.md",
      kind: "person",
      display: "Alice",
      mentions: 0,
    });
    await expect(be.createEntity("person", "alice")).rejects.toThrow(/already exists/);
    await expect(be.createEntity("person", "2026-12-25")).rejects.toThrow(/date/);
    await expect(be.createEntity("person", "  ")).rejects.toThrow(/empty/);
  });

  it("lists the notes that use a topic, with the line", async () => {
    await be.saveDay("2026-10-27", "nothing here\n", null, false);
    await be.saveDay("2026-10-28", "Morning.\nA big day at the #Work site\n", null, false);
    const note = await be.createEntity("note", "Plan");
    await be.updateEntity(note.path, { notes: "To do #work later" });
    const got = await be.tagNotes("work");
    expect(got.map((m) => [m.name, m.context])).toEqual([
      ["2026-10-28", "A big day at the #Work site"],
      ["Plan", "To do #work later"],
    ]);
    expect(got[0].date).toBe("2026-10-28");
    expect(await be.tagNotes("play")).toEqual([]);
  });

  it("resets the library to the starter emotions", async () => {
    await be.createEntity("person", "Alice");
    await be.createEntity("note", "Plan");
    await be.createEntity("emotion", "Wistful");
    const before = (await be.listEntities()).filter((e) => e.kind === "emotion").length;
    expect(await be.resetLibrary()).toBe(3);
    const after = await be.listEntities();
    expect(after.every((e) => e.kind === "emotion")).toBe(true);
    expect(after.some((e) => e.name === "Wistful")).toBe(false);
    expect(after.length).toBe(before - 1);
  });

  it("deletes a note and frees its name, leaving links elsewhere as they were", async () => {
    const alice = await be.createEntity("person", "Alice");
    await be.deleteEntity(alice.path);
    expect((await be.listEntities()).some((e) => e.path === alice.path)).toBe(false);
    await expect(be.deleteEntity(alice.path)).rejects.toThrow();
    await be.createEntity("person", "Alice"); // the name is free again
  });

  it("disambiguates a name used by another kind (master §4a)", async () => {
    await be.createEntity("person", "Paris");
    const place = await be.createEntity("place", "Paris");
    expect(place).toMatchObject({
      path: "places/Paris (place).md",
      display: "Paris",
      aliases: [],
    });
    await expect(be.createEntity("place", "Paris")).rejects.toThrow(/already exists/);
  });

  it("counts mentions, lists backlinks and resolves aliases", async () => {
    const alice = await be.createEntity("person", "Alice");
    await be.updateEntity(alice.path, { aliases: ["Ali"] });
    await be.saveDay("2026-10-27", "Met [[Alice]] today #travel\n", null, false);
    await be.saveDay(
      "2026-10-28",
      "Ali called. See [[2026-12-25|Mom's birthday]] #travel #work\n",
      null,
      false,
    );
    await be.saveDay("2026-10-29", "Wrote [[Ali]] a letter\n", null, false);

    const d = await be.getEntity(alice.path);
    expect(d.mentions).toBe(2);
    expect(d.lastMention).toBe("2026-10-29");
    expect(d.backlinks.map((b) => b.date)).toEqual(["2026-10-29", "2026-10-27"]);
    expect(d.backlinks[1].context).toContain("Met [[Alice]]");

    const tags = await be.listTags();
    expect(tags.slice(0, 2)).toEqual([
      { tag: "travel", count: 2 },
      { tag: "work", count: 1 },
    ]);
  });

  it("derives upcoming events from date links", async () => {
    await be.saveDay(
      "2026-10-28",
      "See [[2026-12-25|Mom's birthday]] and [[2026-01-02|past]]\n",
      null,
      false,
    );
    const ev = await be.upcoming("2026-10-29");
    expect(ev).toEqual([
      {
        date: "2026-12-25",
        label: "Mom's birthday",
        source: "2026-10-28",
        sourceDate: "2026-10-28",
      },
    ]);
  });

  it("validates alias and birthday edits", async () => {
    const a = await be.createEntity("person", "Alice");
    const b = await be.createEntity("person", "Bob");
    await be.updateEntity(a.path, { aliases: ["Ali"] });
    await expect(be.updateEntity(b.path, { aliases: ["ALI"] })).rejects.toThrow(
      '"ALI" is already an alias of Alice',
    );
    await expect(be.updateEntity(b.path, { birthday: "nope" })).rejects.toThrow();
    const ok = await be.updateEntity(b.path, {
      birthday: "1990-05-02",
      relationship: "friend",
      notes: "Hi",
    });
    expect(ok).toMatchObject({ birthday: "1990-05-02", relationship: "friend", notes: "Hi" });
  });

  it("rename rewrites links in days and entity notes, keeping labels", async () => {
    const alice = await be.createEntity("person", "Alice");
    await be.updateEntity(alice.path, { aliases: ["Ali"], notes: "See [[Alice]]." });
    await be.saveDay(
      "2026-10-27",
      "Met [[Alice]], [[alice|my friend]] and [[Ali]] `[[Alice]]`\n",
      null,
      false,
    );
    await be.saveDay("2026-10-28", "Nothing here [[Bob]]\n", null, false);

    const r = await be.renameEntity(alice.path, "Alicia");
    expect(r.entity.path).toBe("people/Alicia.md");
    expect(r.updatedNotes).toBe(1);
    expect((await be.readDay("2026-10-27")).body).toBe(
      "Met [[Alicia]], [[Alicia|my friend]] and [[Ali]] `[[Alice]]`\n",
    );
    expect((await be.readDay("2026-10-28")).body).toBe("Nothing here [[Bob]]\n");
    const d = await be.getEntity("people/Alicia.md");
    expect(d.notes).toBe("See [[Alicia]].");
    expect(d.backlinks).toHaveLength(3); // three links in the day; her own page is excluded
    await expect(be.getEntity(alice.path)).rejects.toThrow();
  });

  it("rename refuses taken names but allows a case change", async () => {
    await be.createEntity("person", "Alice");
    const bob = await be.createEntity("person", "Bob");
    await expect(be.renameEntity(bob.path, "alice")).rejects.toThrow(/already exists/);
    const r = await be.renameEntity("people/Alice.md", "ALICE");
    expect(r.entity.name).toBe("ALICE");
  });

  it("notifies listeners when entities change", async () => {
    let n = 0;
    const off = await be.onEntitiesChanged(() => n++);
    await be.createEntity("tag", "work");
    await be.saveDay("2026-10-28", "Hello\n", null, false);
    off();
    await be.createEntity("tag", "play");
    expect(n).toBe(2);
  });
});
