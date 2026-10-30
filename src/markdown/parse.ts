import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import type { Root, RootContent, PhrasingContent, ListItem, List } from "mdast";
import type { PMMark, PMNode } from "./pm";

const processor = unified().use(remarkParse).use(remarkGfm);

/** One top-level block of the original file, with the exact source text and the gap after it. */
export interface SourceBlock {
  source: string;
  node: PMNode;
  gapAfter: string;
}

export interface ParsedBody {
  lead: string;
  trail: string;
  eol: string;
  blocks: SourceBlock[];
}

/** Thrown when a nested construct can't be edited; the whole top-level block becomes opaque. */
class Unrepresentable extends Error {}

export const detectEol = (text: string): string => (text.includes("\r\n") ? "\r\n" : "\n");

const normalizeNewlines = (text: string) => text.replace(/\r\n?/g, "\n");

export function parseBody(body: string): ParsedBody {
  const root = processor.parse(body) as Root;
  const eol = detectEol(body);
  const raw = (n: { position?: RootContent["position"] }) => {
    const start = n.position!.start.offset!;
    const end = n.position!.end.offset!;
    return body.slice(start, end);
  };

  const blocks: SourceBlock[] = [];
  const children = root.children;
  children.forEach((child, i) => {
    const start = child.position!.start.offset!;
    const end = child.position!.end.offset!;
    const nextStart = children[i + 1]?.position!.start.offset;
    let node: PMNode;
    try {
      node = convertBlock(child, body, 0);
    } catch (e) {
      if (!(e instanceof Unrepresentable)) throw e;
      node = rawBlock(raw(child));
    }
    blocks.push({
      source: body.slice(start, end),
      node,
      gapAfter: nextStart === undefined ? "" : body.slice(end, nextStart),
    });
  });

  if (children.length === 0) return { lead: body, trail: "", eol, blocks };
  const first = children[0].position!.start.offset!;
  const last = children[children.length - 1].position!.end.offset!;
  return { lead: body.slice(0, first), trail: body.slice(last), eol, blocks };
}

const rawBlock = (source: string): PMNode => ({ type: "rawBlock", attrs: { source } });
const rawInline = (source: string): PMNode => ({ type: "rawInline", attrs: { source } });
const paragraph = (content: PMNode[] = []): PMNode =>
  content.length ? { type: "paragraph", content } : { type: "paragraph" };

function convertBlock(node: RootContent, body: string, depth: number): PMNode {
  switch (node.type) {
    case "paragraph":
      return paragraph(convertInline(node.children, body, [], depth));
    case "heading":
      return {
        type: "heading",
        attrs: { level: node.depth },
        content: nonEmpty(convertInline(node.children, body, [], depth)),
      };
    case "blockquote":
      return {
        type: "blockquote",
        content: node.children.length
          ? node.children.map((c) => convertBlock(c, body, depth + 1))
          : [paragraph()],
      };
    case "thematicBreak":
      return { type: "horizontalRule" };
    case "code": {
      const src = body.slice(node.position!.start.offset!, node.position!.end.offset!);
      const fence = /^\s*(`{3,}|~{3,})/.exec(src)?.[1] ?? "```";
      return {
        type: "codeBlock",
        attrs: { language: node.lang ?? null, fence },
        content: node.value ? [{ type: "text", text: normalizeNewlines(node.value) }] : undefined,
      };
    }
    case "list":
      return convertList(node, body, depth);
    default:
      // table, html, footnoteDefinition, definition, yaml, math, ...
      if (depth > 0) throw new Unrepresentable();
      return rawBlock(body.slice(node.position!.start.offset!, node.position!.end.offset!));
  }
}

const nonEmpty = <T>(arr: T[]): T[] | undefined => (arr.length ? arr : undefined);

function convertList(list: List, body: string, depth: number): PMNode {
  const src = body.slice(list.position!.start.offset!);
  const hasChecked = (item: ListItem) => item.checked !== null && item.checked !== undefined;
  // A list mixing plain and checkbox items can't be a taskList (every item would grow a checkbox).
  // It stays a bullet list, and the "[x] " markers remain literal text, which round-trips as is.
  const isTask = list.children.length > 0 && list.children.every(hasChecked);
  const mixed = !isTask && list.children.some(hasChecked);
  const spread = Boolean(list.spread);
  const items = list.children.map((item) => convertItem(item, body, depth, isTask, mixed));
  if (isTask) {
    return {
      type: "taskList",
      attrs: { marker: /^[-*+]/.exec(src)?.[0] ?? "-", spread },
      content: items,
    };
  }
  if (list.ordered) {
    const m = /^\d+([.)])/.exec(src);
    return {
      type: "orderedList",
      attrs: { start: list.start ?? 1, delim: m?.[1] ?? ".", spread },
      content: items,
    };
  }
  return {
    type: "bulletList",
    attrs: { marker: /^[-*+]/.exec(src)?.[0] ?? "-", spread },
    content: items,
  };
}

function convertItem(
  item: ListItem,
  body: string,
  depth: number,
  isTask: boolean,
  mixed = false,
): PMNode {
  const content = item.children.map((c) => convertBlock(c, body, depth + 1));
  // PM list items must start with a paragraph.
  if (content.length === 0 || content[0].type !== "paragraph") content.unshift(paragraph());
  if (mixed && item.checked !== null && item.checked !== undefined) {
    const first = content[0];
    first.content = mergeText([
      { type: "text", text: item.checked ? "[x] " : "[ ] " },
      ...(first.content ?? []),
    ]);
  }
  if (isTask) return { type: "taskItem", attrs: { checked: Boolean(item.checked) }, content };
  return { type: "listItem", content };
}

function convertInline(
  nodes: PhrasingContent[],
  body: string,
  marks: PMMark[],
  depth: number,
): PMNode[] {
  const out: PMNode[] = [];
  const withMark = (m: PMMark) => (marks.some((x) => x.type === m.type) ? marks : [...marks, m]);
  const source = (n: PhrasingContent) =>
    body.slice(n.position!.start.offset!, n.position!.end.offset!);

  for (const n of nodes) {
    switch (n.type) {
      case "text": {
        const text = normalizeNewlines(n.value);
        if (text) out.push({ type: "text", text, ...(marks.length ? { marks } : {}) });
        break;
      }
      case "emphasis":
        out.push(...convertInline(n.children, body, withMark({ type: "italic" }), depth));
        break;
      case "strong":
        out.push(...convertInline(n.children, body, withMark({ type: "bold" }), depth));
        break;
      case "delete":
        out.push(...convertInline(n.children, body, withMark({ type: "strike" }), depth));
        break;
      case "link":
        out.push(
          ...convertInline(
            n.children,
            body,
            withMark({ type: "link", attrs: { href: n.url, title: n.title ?? null } }),
            depth,
          ),
        );
        break;
      case "inlineCode":
        // The code mark excludes every other mark, so e.g. bold code stays verbatim.
        if (marks.length) out.push(inlineRaw(source(n), depth));
        else out.push({ type: "text", text: n.value, marks: [{ type: "code" }] });
        break;
      case "break":
        out.push({ type: "hardBreak" });
        break;
      default:
        out.push(inlineRaw(source(n), depth));
    }
  }
  return mergeText(out);
}

function inlineRaw(source: string, depth: number): PMNode {
  // Inside containers a multi-line source would carry the container's line prefixes.
  if (depth > 0 && source.includes("\n")) throw new Unrepresentable();
  return rawInline(source);
}

function mergeText(nodes: PMNode[]): PMNode[] {
  const out: PMNode[] = [];
  for (const n of nodes) {
    const prev = out[out.length - 1];
    if (
      prev &&
      prev.type === "text" &&
      n.type === "text" &&
      JSON.stringify(prev.marks ?? []) === JSON.stringify(n.marks ?? [])
    ) {
      prev.text += n.text!;
    } else {
      out.push(n.type === "text" ? { ...n } : n);
    }
  }
  return out;
}
