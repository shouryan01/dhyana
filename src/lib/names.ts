/**
 * Entity name rules (master plan §4a), mirrored in Rust (`src-tauri/src/names.rs`).
 * Used by the in-memory backend and anywhere the UI needs to compare or build names.
 */
import { isISODate } from "./dates";

/** Case-insensitive, Unicode-normalized comparison key. */
export const nameKey = (s: string): string => s.trim().normalize("NFC").toLowerCase();

// oxlint-disable-next-line no-control-regex -- control characters are exactly what we strip
const ILLEGAL = /[<>:"/\\|?*[\]#^\u0000-\u001f]/g;
const RESERVED = new Set([
  "con",
  "prn",
  "aux",
  "nul",
  ...Array.from({ length: 9 }, (_, i) => `com${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `lpt${i + 1}`),
]);

export type StemResult = { ok: true; stem: string } | { ok: false; error: string };

/** A filename stem for a name: illegal characters replaced, no trailing dots, date names refused. */
export function fileStem(name: string): StemResult {
  let stem = name
    .normalize("NFC")
    .replace(ILLEGAL, "-")
    .split(/\s+/)
    .filter(Boolean)
    .join(" ")
    .replace(/^[. ]+|[. ]+$/g, "")
    .slice(0, 100)
    .replace(/[. ]+$/, "");
  if (!stem) return { ok: false, error: "name is empty" };
  if (isISODate(stem)) {
    return {
      ok: false,
      error: `"${stem}" looks like a date; those names are reserved for journal days`,
    };
  }
  if (RESERVED.has(stem.toLowerCase())) stem += "_";
  return { ok: true, stem };
}

/** The filename for a name that clashes with another kind: `Paris (place)`. */
export const disambiguated = (stem: string, kind: string): string => `${stem} (${kind})`;

/**
 * The name as it is written when a person or place is created: lowercase, spaces collapsed.
 * Other kinds keep what was typed. Mirrors `names::tidy` in Rust.
 */
export function tidyName(kind: string, name: string): string {
  const clean = name.trim().split(/\s+/).join(" ");
  return kind === "person" || kind === "place" ? clean.toLowerCase() : clean;
}
