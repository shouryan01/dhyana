import { describe, expect, it } from "vitest";
import { addDays, isISODate, monthGrid, parseDateInput } from "./dates";
import { createDispatcher, formatShortcut, matchChord, type Action } from "./shortcuts";

const ev = (key: string, o: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean }> = {}) => ({
  key,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...o,
});

const act = (id: string, shortcut: string): Action => ({ id, label: id, group: "App", shortcut, run: () => {} });

describe("shortcuts", () => {
  it("mod maps to ctrl on Windows and cmd on macOS", () => {
    expect(matchChord(ev("k", { ctrlKey: true }), "mod+k", false)).toBe(true);
    expect(matchChord(ev("k", { metaKey: true }), "mod+k", false)).toBe(false);
    expect(matchChord(ev("k", { metaKey: true }), "mod+k", true)).toBe(true);
    expect(matchChord(ev("k", { ctrlKey: true, shiftKey: true }), "mod+k", false)).toBe(false);
  });

  it("handles punctuation chords", () => {
    expect(matchChord(ev("[", { ctrlKey: true }), "mod+[", false)).toBe(true);
    expect(matchChord(ev(",", { ctrlKey: true }), "mod+,", false)).toBe(true);
  });

  it("formats for display", () => {
    expect(formatShortcut("mod+shift+t", false)).toEqual(["Ctrl", "Shift", "T"]);
    expect(formatShortcut("mod+k", true)).toEqual(["⌘", "K"]);
    expect(formatShortcut("g t")).toEqual(["G", "T"]);
  });

  it("chords fire anywhere; single keys and sequences only outside text fields", () => {
    const actions = [act("palette", "mod+k"), act("today", "g t"), act("help", "?")];
    const d = createDispatcher(() => actions);
    expect(d(ev("k", { ctrlKey: true }), true)?.id).toBe("palette");
    expect(d(ev("g"), true)).toBeNull();
    expect(d(ev("t"), true)).toBeNull();
    expect(d(ev("g"), false)).toBeNull();
    expect(d(ev("t"), false)?.id).toBe("today");
    expect(d(ev("?", { shiftKey: true }), false)?.id).toBe("help");
  });

  it("a sequence expires", () => {
    let t = 0;
    const d = createDispatcher(() => [act("today", "g t")], () => t);
    d(ev("g"), false);
    t = 2000;
    expect(d(ev("t"), false)).toBeNull();
  });
});

describe("dates", () => {
  it("validates real calendar dates only", () => {
    expect(isISODate("2026-02-28")).toBe(true);
    expect(isISODate("2026-02-30")).toBe(false);
    expect(isISODate("2026-2-3")).toBe(false);
  });

  it("adds days across month and year boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("parses go-to-date input", () => {
    const base = "2026-10-29"; // Thursday
    expect(parseDateInput("yesterday", base)).toBe("2026-10-28");
    expect(parseDateInput("-3", base)).toBe("2026-10-26");
    expect(parseDateInput("+1d", base)).toBe("2026-10-30");
    expect(parseDateInput("friday", base)).toBe("2026-10-30");
    expect(parseDateInput("next thursday", base)).toBe("2026-11-05");
    expect(parseDateInput("last monday", base)).toBe("2026-10-26");
    expect(parseDateInput("2025-01-02", base)).toBe("2025-01-02");
    expect(parseDateInput("nonsense", base)).toBeNull();
  });

  it("builds a padded month grid", () => {
    const weeks = monthGrid(2026, 10, 1); // Monday start; Oct 1 2026 is a Thursday
    expect(weeks[0].slice(0, 3)).toEqual([null, null, null]);
    expect(weeks[0][3]).toBe("2026-10-01");
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks.flat().filter(Boolean)).toHaveLength(31);
  });
});
