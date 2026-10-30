/**
 * Finds `[[wikilinks]]` and `#tags` in a note body and rewrites link targets. A TypeScript twin of
 * `src-tauri/src/links.rs` (code and `![[embeds]]` are ignored); the in-memory backend uses it.
 */
import { nameKey } from "@/lib/names";

export interface WikiLink {
  /** Target as written, without a `#heading` / `^block` suffix. */
  target: string;
  label: string | null;
  /** [start, end) of `target` in the scanned text. */
  span: [number, number];
  /** The line the link is on, trimmed and shortened. */
  context: string;
}

export interface Scan {
  links: WikiLink[];
  tags: string[];
}

const CONTEXT_CHARS = 160;
const isTagChar = (c: string) => /[\p{L}\p{N}_/-]/u.test(c);

function contextOf(line: string): string {
  const t = line.trim();
  const chars = Array.from(t);
  return chars.length <= CONTEXT_CHARS ? t : `${chars.slice(0, CONTEXT_CHARS).join("").trimEnd()}…`;
}

function codeSpans(line: string): [number, number][] {
  const spans: [number, number][] = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] !== "`") {
      i++;
      continue;
    }
    const start = i;
    while (line[i] === "`") i++;
    const run = i - start;
    let j = i;
    let closed = -1;
    while (j < line.length) {
      if (line[j] === "`") {
        const s = j;
        while (line[j] === "`") j++;
        if (j - s === run) {
          closed = j;
          break;
        }
      } else j++;
    }
    if (closed >= 0) {
      spans.push([start, closed]);
      i = closed;
    }
  }
  return spans;
}

function fenceMarker(line: string): [string, number] | null {
  const t = line.trimStart();
  if (line.length - t.length > 3) return null;
  const c = t[0];
  if (c !== "`" && c !== "~") return null;
  let n = 0;
  while (t[n] === c) n++;
  return n >= 3 ? [c, n] : null;
}

export function scanLinks(text: string): Scan {
  const out: Scan = { links: [], tags: [] };
  let fence: [string, number] | null = null;
  let offset = 0;
  for (const raw of text.split(/(?<=\n)/)) {
    const lineStart = offset;
    offset += raw.length;
    const line = raw.replace(/[\r\n]+$/, "");

    if (fence) {
      const m = fenceMarker(line);
      if (
        m &&
        m[0] === fence[0] &&
        m[1] >= fence[1] &&
        [...line.trim()].every((x) => x === fence![0])
      )
        fence = null;
      continue;
    }
    const f = fenceMarker(line);
    if (f) {
      fence = f;
      continue;
    }

    const code = codeSpans(line);
    const inCode = (i: number) => code.some(([s, e]) => i >= s && i < e);
    const ctx = contextOf(line);
    let i = 0;
    while (i < line.length) {
      if (inCode(i)) {
        i++;
        continue;
      }
      if (line[i] === "[" && line[i + 1] === "[" && line[i - 1] !== "!") {
        const rel = line.indexOf("]]", i + 2);
        if (rel >= 0) {
          const inner = line.slice(i + 2, rel);
          if (!inner.includes("[[") && !inCode(rel)) {
            const bar = inner.indexOf("|");
            const targetRaw = bar >= 0 ? inner.slice(0, bar) : inner;
            const label = bar >= 0 ? inner.slice(bar + 1) : "";
            const cutAt = targetRaw.search(/[#^]/);
            const cut = cutAt >= 0 ? targetRaw.slice(0, cutAt) : targetRaw;
            const target = cut.trim();
            if (target) {
              const lead = cut.length - cut.trimStart().length;
              const s = lineStart + i + 2 + lead;
              out.links.push({
                target,
                label: label || null,
                span: [s, s + target.length],
                context: ctx,
              });
            }
            i = rel + 2;
            continue;
          }
        }
      }
      if (line[i] === "#" && (i === 0 || /\s/.test(line[i - 1]))) {
        let n = 0;
        while (i + 1 + n < line.length && isTagChar(line[i + 1 + n])) n++;
        const tag = line.slice(i + 1, i + 1 + n);
        if (tag && /[^0-9]/.test(tag)) out.tags.push(tag);
        i += 1 + n;
        continue;
      }
      i++;
    }
  }
  return out;
}

/** Replace the target of every link pointing at `oldKey` (a `nameKey`); returns the text and count. */
export function rewriteLinks(text: string, oldKey: string, newTarget: string): [string, number] {
  const hits = scanLinks(text)
    .links.filter((l) => nameKey(l.target) === oldKey)
    .map((l) => l.span)
    .sort((a, b) => a[0] - b[0]);
  let out = "";
  let last = 0;
  for (const [s, e] of hits) {
    out += text.slice(last, s) + newTarget;
    last = e;
  }
  return [out + text.slice(last), hits.length];
}
