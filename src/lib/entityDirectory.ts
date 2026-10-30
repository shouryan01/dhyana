/**
 * What the editor knows about the vault's entities, so `[[links]]` can render as the right kind of
 * chip. Filled by the app from `listEntities()`; the editor only reads it. Names resolve like the
 * core does: exact filename first, then alias (master plan §4a).
 */
import { isISODate } from "./dates";
import { nameKey } from "./names";
import type { EntitySummary } from "./schema";

export interface Resolved {
  kind: string;
  display: string;
  path: string | null;
}

let byName = new Map<string, Resolved>();
let byAlias = new Map<string, Resolved>();

export function setDirectory(entities: EntitySummary[]): void {
  const names = new Map<string, Resolved>();
  const aliases = new Map<string, Resolved>();
  for (const e of entities) {
    const r = { kind: e.kind, display: e.display, path: e.path };
    names.set(nameKey(e.name), r);
    for (const a of e.aliases) if (!aliases.has(nameKey(a))) aliases.set(nameKey(a), r);
  }
  byName = names;
  byAlias = aliases;
}

/** Strips a `#heading` / `^block` suffix from a link target. */
export const baseTarget = (target: string): string => target.replace(/[#^].*$/, "").trim();

export function resolveTarget(target: string): Resolved | null {
  const base = baseTarget(target);
  if (isISODate(base)) return { kind: "date", display: base, path: null };
  const k = nameKey(base);
  return byName.get(k) ?? byAlias.get(k) ?? null;
}
