import type { PMNode } from "./pm";
import { parseBody, type ParsedBody } from "./parse";
import { serializeBlock } from "./serialize";

/**
 * Lossless markdown round-trip.
 *
 * `loadBody` parses a note body into a ProseMirror document and remembers the exact source text of
 * every top-level block. `saveBody` takes the (possibly edited) document back: a top-level block
 * whose canonical JSON is identical to one of the originals is spliced back from the original source
 * byte-for-byte; only blocks that differ are re-serialized.
 *
 * `canon` normalizes a node through the editor schema (default attrs, mark order), so the comparison
 * works on what the editor itself would report.
 */
export type Canon = (node: PMNode) => PMNode;

export interface LoadedBody {
  doc: PMNode;
  ctx: BodyContext;
}

export interface BodyContext {
  parsed: ParsedBody;
  /** canonical JSON string -> original block indexes (ascending) */
  byKey: Map<string, number[]>;
}

const keyOf = (node: PMNode) => JSON.stringify(node);

export function loadBody(body: string, canon: Canon): LoadedBody {
  const parsed = parseBody(body);
  const byKey = new Map<string, number[]>();
  const content: PMNode[] = parsed.blocks.map((block, i) => {
    let node: PMNode;
    try {
      node = canon(block.node);
    } catch {
      // The schema rejected it: keep the source verbatim as an opaque block.
      node = canon({ type: "rawBlock", attrs: { source: block.source } });
    }
    block.node = node;
    const key = keyOf(node);
    byKey.set(key, [...(byKey.get(key) ?? []), i]);
    return node;
  });
  return {
    doc: { type: "doc", content: content.length ? content : [{ type: "paragraph" }] },
    ctx: { parsed, byKey },
  };
}

export interface SaveOptions {
  /** Test hook: ignore the original sources and re-serialize every block. */
  forceSerialize?: boolean;
}

export function saveBody(
  ctx: BodyContext,
  doc: PMNode,
  canon: Canon,
  opts: SaveOptions = {},
): string {
  const { parsed, byKey } = ctx;
  const { eol, blocks } = parsed;
  const used = new Set<number>();
  let lastMatched = -1;

  // Empty paragraphs are just editor whitespace; blank lines are carried by the gaps.
  const nodes = (doc.content ?? []).filter((n) => !(n.type === "paragraph" && !n.content?.length));

  const pieces = nodes.map((node) => {
    if (!opts.forceSerialize) {
      const candidates = byKey.get(keyOf(canon(node))) ?? [];
      const free = candidates.filter((i) => !used.has(i));
      // Prefer the next original block after the previous match, so duplicates stay in order.
      const pick = free.find((i) => i > lastMatched) ?? free[0];
      if (pick !== undefined) {
        used.add(pick);
        lastMatched = pick;
        return { text: blocks[pick].source, orig: pick };
      }
    }
    return { text: toEol(serializeBlock(node), eol), orig: -1 };
  });

  if (pieces.length === 0) return blocks.length === 0 ? parsed.lead : "";

  let out = blocks.length ? parsed.lead : "";
  pieces.forEach((piece, i) => {
    if (i > 0) {
      const prev = pieces[i - 1];
      const consecutive = prev.orig >= 0 && piece.orig === prev.orig + 1;
      out += consecutive ? blocks[prev.orig].gapAfter : eol + eol;
    }
    out += piece.text;
  });
  out += blocks.length ? parsed.trail : eol;
  return out;
}

const toEol = (text: string, eol: string) => text.replace(/\r\n?/g, "\n").replace(/\n/g, eol);
