import { beforeEach, describe, expect, it } from "vitest";
import type { Backend } from "./backend";
import { diffLines, foldUnchanged } from "./diff";
import { createMemoryBackend } from "./memoryBackend";
import {
  averageValence,
  bucketColor,
  factorLabel,
  moodColor,
  nowHHMM,
  sortEmotionsFor,
  timeline,
  valenceBucket,
  valenceLabel,
} from "./mood";
import type { CheckIn } from "./schema";
import { countWords } from "./words";

const ci = (at: string, valence: number, emotions: string[] = []): CheckIn => ({
  at,
  valence,
  emotions,
  factors: [],
});

describe("mood scale", () => {
  it("labels seven equal steps", () => {
    expect(valenceLabel(-1)).toBe("Very unpleasant");
    expect(valenceLabel(-0.5)).toBe("Unpleasant");
    expect(valenceLabel(0)).toBe("Neutral");
    expect(valenceLabel(0.1)).toBe("Neutral");
    expect(valenceLabel(0.3)).toBe("Slightly pleasant");
    expect(valenceLabel(1)).toBe("Very pleasant");
  });

  it("buckets and colours diverge around a neutral midpoint", () => {
    expect([-1, -0.4, 0, 0.4, 1].map(valenceBucket)).toEqual([-2, -1, 0, 1, 2]);
    expect(moodColor(0)).toBe("var(--mood-mid)");
    expect(moodColor(-1)).toBe("color-mix(in oklab, var(--mood-neg) 100%, var(--mood-mid))");
    expect(bucketColor(1)).toBe("color-mix(in oklab, var(--mood-pos) 50%, var(--mood-mid))");
  });

  it("offers emotions that fit the valence first", () => {
    const e = ["sad", "happy", "wistful", "calm"].map((name) => ({ name, display: name }));
    expect(sortEmotionsFor(e, 0.8).map((x) => x.name)).toEqual(["calm", "happy", "wistful", "sad"]);
    expect(sortEmotionsFor(e, -0.8).map((x) => x.name)).toEqual([
      "sad",
      "wistful",
      "calm",
      "happy",
    ]);
    expect(sortEmotionsFor(e, 0).map((x) => x.name)).toEqual(["calm", "happy", "sad", "wistful"]);
  });

  it("formats times, factors, averages and the day's timeline", () => {
    expect(nowHHMM(new Date(2026, 9, 30, 7, 5))).toBe("07:05");
    expect(factorLabel("current-events")).toBe("Current Events");
    expect(factorLabel("Gardening")).toBe("Gardening");
    expect(averageValence([ci("07:00", 0.5), ci("08:00", -0.2)])).toBe(0.15);
    expect(averageValence([])).toBeNull();
    const t = timeline([ci("20:00", 0), ci("07:00", 1)], [ci("12:00", -1)]);
    expect(t.map((x) => [x.checkin.at, x.index, x.pending])).toEqual([
      ["07:00", 1, false],
      ["12:00", 2, true],
      ["20:00", 0, false],
    ]);
  });
});

describe("words", () => {
  it("counts like the Rust index", () => {
    expect(countWords("- [ ] buy milk\n\n# Title — ok")).toBe(4);
    expect(countWords("Met [[Alice]] at [[Paris (place)|Paris]] #travel")).toBe(6);
    expect(countWords("")).toBe(0);
    expect(countWords("café naïve 42")).toBe(3);
  });
});

describe("line diff", () => {
  it("finds the added and removed lines", () => {
    const d = diffLines("a\nb\nc\nd\n", "a\nB\nc\nd\ne\n");
    expect(d).toEqual([
      { kind: "same", text: "a" },
      { kind: "del", text: "b" },
      { kind: "add", text: "B" },
      { kind: "same", text: "c" },
      { kind: "same", text: "d" },
      { kind: "add", text: "e" },
    ]);
    expect(diffLines("x\r\ny", "x\ny")).toEqual([
      { kind: "same", text: "x" },
      { kind: "same", text: "y" },
    ]);
    expect(diffLines("", "new")).toEqual([{ kind: "add", text: "new" }]);
  });

  it("folds long unchanged runs", () => {
    const a = Array.from({ length: 10 }, (_, i) => `l${i}`).join("\n");
    const b = a.replace("l5", "L5");
    const folded = foldUnchanged(diffLines(a, b), 1);
    expect(folded).toEqual([
      { kind: "skip", count: 4 },
      { kind: "same", text: "l4" },
      { kind: "del", text: "l5" },
      { kind: "add", text: "L5" },
      { kind: "same", text: "l6" },
      { kind: "skip", count: 3 },
    ]);
  });
});

describe("mood in the in-memory backend", () => {
  let be: Backend;
  beforeEach(() => {
    be = createMemoryBackend();
  });

  it("holds a check-in without creating the day, then writes it with the first text", async () => {
    const day = await be.addMood("2026-10-30", ci("07:12", 0.4, ["calm"]));
    expect(day.exists).toBe(false);
    expect(day.pendingMood).toHaveLength(1);
    expect(await be.listDays(2026, 10)).toEqual([]);

    await be.saveDay("2026-10-30", "Hello\n", null, false);
    const saved = await be.readDay("2026-10-30");
    expect(saved.mood).toEqual([ci("07:12", 0.4, ["calm"])]);
    expect(saved.pendingMood).toEqual([]);
  });

  it("edits and deletes check-ins in the file, changing its hash", async () => {
    await be.saveDay("2026-10-30", "Hi\n", null, false);
    const before = (await be.readDay("2026-10-30")).hash;
    let d = await be.addMood("2026-10-30", ci("7:05".padStart(5, "0"), 0.333, [" sad ", "Sad"]));
    expect(d.mood).toEqual([ci("07:05", 0.33, ["sad"])]);
    expect(d.hash).not.toBe(before);
    d = await be.updateMood("2026-10-30", 0, ci("09:00", -0.5));
    expect(d.mood[0].at).toBe("09:00");
    d = await be.deleteMood("2026-10-30", 0);
    expect(d.mood).toEqual([]);
    await expect(be.deleteMood("2026-10-30", 3)).rejects.toThrow("no check-in #4");
    await expect(be.addMood("2026-10-30", ci("25:00", 0))).rejects.toThrow();
  });

  it("offers the check-in once per day, and not when one exists or it's switched off", async () => {
    expect(await be.moodOffer("2026-10-30")).toBe(true);
    await be.markMoodOffered("2026-10-30", "shown");
    expect(await be.moodOffer("2026-10-30")).toBe(false);
    await be.markMoodOffered("2026-10-30", "skipped");
    expect(await be.moodOffer("2026-10-30")).toBe(false);

    await be.addMood("2026-10-31", ci("08:00", 0));
    expect(await be.moodOffer("2026-10-31")).toBe(false);
    await be.updateSettings({ askMood: false });
    expect(await be.moodOffer("2026-11-01")).toBe(false);
  });

  it("renaming an emotion rewrites check-ins", async () => {
    await be.saveDay("2026-10-30", "Plain\n", null, false);
    await be.addMood("2026-10-30", ci("08:00", -0.5, ["sad"]));
    await be.addMood("2026-10-31", ci("08:00", -0.5, ["Sad"]));
    const sad = (await be.listEntities()).find((e) => e.name === "sad")!;
    const r = await be.renameEntity(sad.path, "blue");
    expect(r.updatedNotes).toBe(1);
    expect((await be.readDay("2026-10-30")).mood[0].emotions).toEqual(["blue"]);
    expect((await be.readDay("2026-10-31")).pendingMood[0].emotions).toEqual(["blue"]);
  });

  it("reports day stats and earlier years on this day", async () => {
    await be.saveDay("2025-10-30", "A year ago today\n", null, false);
    await be.saveDay("2026-10-30", "one two three\n", null, false);
    await be.addMood("2026-10-30", ci("08:00", 0.5));
    await be.addMood("2026-10-30", ci("20:00", -0.2));
    expect(await be.dayStats("2026-01-01", "2026-12-31")).toEqual([
      { date: "2026-10-30", words: 3, checkins: 2, valence: 0.15 },
    ]);
    const earlier = await be.onThisDay("2026-10-30");
    expect(earlier).toEqual([{ date: "2025-10-30", words: 4, excerpt: "A year ago today" }]);
  });

  it("keeps versions of a day and restores one without losing the current text", async () => {
    await be.saveDay("2026-10-30", "first\n", null, false);
    await be.saveDay("2026-10-30", "second\n", (await be.readDay("2026-10-30")).hash, false);
    const path = "journal/2026/10/2026-10-30.md";
    let versions = await be.noteHistory(path);
    expect(versions).toHaveLength(1); // one autosaved version per session and day
    await be.checkpoint("Saved by hand");
    await be.saveDay("2026-10-30", "third\n", (await be.readDay("2026-10-30")).hash, false);
    versions = await be.noteHistory(path);
    expect(versions.map((v) => v.message)).toEqual(["Edit 2026-10-30", "Add 2026-10-30"]);
    const old = await be.noteVersion(path, versions[1].id);
    expect(old.text).toContain("second");
    expect(old.current).toContain("third");

    const changed: string[][] = [];
    await be.onVaultChanged((d) => changed.push(d));
    await be.restoreVersion(path, versions[1].id);
    expect((await be.readDay("2026-10-30")).body).toBe("second\n");
    expect(changed).toEqual([["2026-10-30"]]);
    const after = await be.noteHistory(path);
    expect(after[0].message).toMatch(/^Restore 2026-10-30/);
    // The text that was replaced is still a version.
    const texts = await Promise.all(after.map((v) => be.noteVersion(path, v.id)));
    expect(texts.some((c) => c.text?.endsWith("third\n"))).toBe(true);
  });
});
