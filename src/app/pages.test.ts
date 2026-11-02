import { describe, expect, it } from "vitest";
import { isChromePage } from "./pages";

describe("isChromePage", () => {
  it("puts list-style pages on the chrome colour", () => {
    for (const p of ["/settings", "/shortcuts", "/library", "/insights", "/search", "/topic"])
      expect(isChromePage(p), p).toBe(true);
  });

  it("keeps the writing surface for days, entities and the year", () => {
    for (const p of ["/", "/day/2026-03-02", "/entity", "/year"])
      expect(isChromePage(p), p).toBe(false);
  });

  it("matches whole path segments only", () => {
    expect(isChromePage("/searching")).toBe(false);
    expect(isChromePage("/library/x")).toBe(true);
  });
});
