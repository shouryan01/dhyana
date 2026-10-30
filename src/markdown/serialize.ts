import type { PMMark, PMNode } from "./pm";

/**
 * Serializes ONE block (a block the user edited) to markdown, using "\n" newlines and no trailing
 * newline. Blocks the user did not touch never go through here; they are spliced back verbatim.
 */
export function serializeBlock(node: PMNode): string {
  switch (node.type) {
    case "paragraph":
      return serializeInline(node.content ?? []);
    case "heading": {
      const level = Number(node.attrs?.level ?? 1);
      const text = serializeInline(node.content ?? []);
      return `${"#".repeat(level)}${text ? " " + text : ""}`;
    }
    case "blockquote":
      return prefixLines(serializeBlocks(node.content ?? []), "> ", ">");
    case "horizontalRule":
      return "---";
    case "codeBlock":
      return serializeCode(node);
    case "bulletList":
    case "orderedList":
    case "taskList":
      return serializeList(node);
    case "rawBlock":
      return String(node.attrs?.source ?? "").replace(/\r\n?/g, "\n");
    default:
      // Unknown node: fall back to its plain text rather than losing it.
      return textOf(node);
  }
}

const isEmptyParagraph = (n: PMNode) => n.type === "paragraph" && !n.content?.length;

function serializeBlocks(nodes: PMNode[]): string {
  return nodes
    .filter((n) => !isEmptyParagraph(n))
    .map(serializeBlock)
    .join("\n\n");
}

const textOf = (node: PMNode): string => node.text ?? (node.content ?? []).map(textOf).join("");

function prefixLines(text: string, prefix: string, emptyPrefix: string): string {
  return text
    .split("\n")
    .map((line) => (line === "" ? emptyPrefix : prefix + line))
    .join("\n");
}

function indentContinuation(text: string, pad: string): string {
  return text
    .split("\n")
    .map((line, i) => (i === 0 || line === "" ? line : pad + line))
    .join("\n");
}

function serializeCode(node: PMNode): string {
  const code = textOf(node);
  const lang = String(node.attrs?.language ?? "");
  let fence = String(node.attrs?.fence ?? "```");
  const char = fence[0] === "~" ? "~" : "`";
  const runs = code.match(new RegExp(`${char}{3,}`, "g")) ?? [];
  const longest = Math.max(0, ...runs.map((m) => m.length));
  if (longest >= fence.length) fence = char.repeat(longest + 1);
  return `${fence}${lang}\n${code}${code ? "\n" : ""}${fence}`;
}

const isList = (n: PMNode) =>
  n.type === "bulletList" || n.type === "orderedList" || n.type === "taskList";

function serializeList(node: PMNode): string {
  const items = node.content ?? [];
  const spread = Boolean(node.attrs?.spread);
  const start = Number(node.attrs?.start ?? 1);
  const bullet = String(node.attrs?.marker ?? "-");
  const rendered = items.map((item, i) => {
    let marker: string;
    let pad: number;
    if (node.type === "orderedList") {
      marker = `${start + i}${String(node.attrs?.delim ?? ".")} `;
      pad = marker.length;
    } else {
      marker = `${bullet} `;
      pad = marker.length;
      if (node.type === "taskList") marker += item.attrs?.checked ? "[x] " : "[ ] ";
    }
    const body = serializeItemBlocks(item.content ?? [], spread);
    return marker + indentContinuation(body, " ".repeat(pad));
  });
  return rendered.join(spread ? "\n\n" : "\n");
}

function serializeItemBlocks(blocks: PMNode[], spread: boolean): string {
  let out = "";
  blocks.forEach((b, i) => {
    if (i > 0 && isEmptyParagraph(b)) return;
    const text = serializeBlock(b);
    if (i === 0) out = text;
    else out += (spread || !isList(b) ? "\n\n" : "\n") + text;
  });
  return out;
}

// ---------------------------------------------------------------------------------------------
// Inline

const DELIMS: Record<string, string> = { bold: "**", italic: "*", strike: "~~" };

const markKey = (m: PMMark) => JSON.stringify([m.type, m.attrs ?? null]);

export function serializeInline(nodes: PMNode[]): string {
  let out = "";
  const stack: PMMark[] = [];
  let atLineStart = true;

  const closeTo = (keep: number) => {
    if (stack.length <= keep) return;
    // Whitespace before a closing delimiter moves outside it ("**a **" is not bold).
    const trailing = /[ \t]+$/.exec(out)?.[0] ?? "";
    if (trailing) out = out.slice(0, out.length - trailing.length);
    while (stack.length > keep) out += closeDelim(stack.pop()!);
    out += trailing;
  };
  const closeAll = () => closeTo(0);

  for (const node of nodes) {
    if (node.type === "hardBreak") {
      closeAll();
      out += "\\\n";
      atLineStart = true;
      continue;
    }
    if (node.type === "rawInline") {
      closeAll();
      out += String(node.attrs?.source ?? "").replace(/\r\n?/g, "\n");
      atLineStart = false;
      continue;
    }

    const bareUrl = autolinkText(node);
    if (bareUrl !== null) {
      closeAll();
      out += bareUrl;
      atLineStart = false;
      continue;
    }

    let text = node.text ?? "";
    const marks = node.marks ?? [];
    const isCode = marks.some((m) => m.type === "code");
    const target = marks.filter((m) => m.type !== "code");
    const targetKeys = target.map(markKey);

    // Keep the longest prefix of open marks that this node still has; close the rest.
    let keep = 0;
    while (keep < stack.length && targetKeys.includes(markKey(stack[keep]))) keep++;

    // Whitespace-only text never opens a mark (that would emit empty delimiters).
    const toOpen =
      text.trim() === ""
        ? []
        : target.filter((m) => !stack.slice(0, keep).some((s) => markKey(s) === markKey(m)));
    if (text.trim() === "") keep = 0;

    closeTo(keep);
    if (toOpen.length) {
      // Leading whitespace goes before the opening delimiters.
      const lead = /^[ \t]+/.exec(text)?.[0] ?? "";
      if (lead) {
        out += lead;
        text = text.slice(lead.length);
      }
      for (const m of toOpen) {
        out += openDelim(m);
        stack.push(m);
      }
    }

    out += isCode ? codeSpan(text) : escapeText(text, atLineStart);
    if (text) atLineStart = text.endsWith("\n");
  }
  closeAll();
  return out;
}

function openDelim(m: PMMark): string {
  return m.type === "link" ? "[" : (DELIMS[m.type] ?? "");
}

function closeDelim(m: PMMark): string {
  if (m.type !== "link") return DELIMS[m.type] ?? "";
  const href = String(m.attrs?.href ?? "");
  const dest = /[\s()<>]/.test(href) ? `<${href}>` : href;
  const title = m.attrs?.title ? ` "${String(m.attrs.title).replace(/"/g, '\\"')}"` : "";
  return `](${dest}${title})`;
}

/** A link whose visible text is its own URL round-trips as a bare URL. */
function autolinkText(node: PMNode): string | null {
  if (node.type !== "text" || node.marks?.length !== 1 || node.marks[0].type !== "link")
    return null;
  const attrs = node.marks[0].attrs ?? {};
  const href = String(attrs.href ?? "");
  const text = node.text ?? "";
  if (attrs.title) return null;
  if (text === href && /^(https?:\/\/|mailto:)/i.test(href)) return text;
  if (`http://${text}` === href && /^www\./i.test(text)) return text;
  return null;
}

function codeSpan(text: string): string {
  const runs = text.match(/`+/g) ?? [];
  const len = runs.length ? Math.max(...runs.map((r) => r.length)) + 1 : 1;
  const ticks = "`".repeat(len);
  const pad = text.startsWith("`") || text.endsWith("`") ? " " : "";
  return `${ticks}${pad}${text}${pad}${ticks}`;
}

const PUNCT = /[!-/:-@[-`{-~]/;

export function escapeText(text: string, atLineStart: boolean): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const prev = i > 0 ? text[i - 1] : "";
    const next = text[i + 1] ?? "";
    switch (ch) {
      case "\\":
        out += next === "" || PUNCT.test(next) ? "\\\\" : "\\";
        break;
      case "*":
      case "`":
        out += "\\" + ch;
        break;
      case "_":
        // Intraword underscores never open emphasis; only escape at word edges.
        out += !/\w/.test(prev) || !/\w/.test(next) ? "\\_" : "_";
        break;
      case "~":
        out += next === "~" || prev === "~" ? "\\~" : "~";
        break;
      case "<":
        out += /[A-Za-z/!?]/.test(next) ? "\\<" : "<";
        break;
      case "&":
        out += /^[#A-Za-z0-9]+;/.test(text.slice(i + 1)) ? "\\&" : "&";
        break;
      case "]":
        out += next === "(" || next === "[" ? "\\]" : "]";
        break;
      default:
        out += ch;
    }
  }
  return escapeLineStarts(out, atLineStart);
}

function escapeLineStarts(text: string, atLineStart: boolean): string {
  return text
    .split("\n")
    .map((line, i) => {
      if (i === 0 && !atLineStart) return line;
      if (/^#{1,6}(\s|$)/.test(line)) return "\\" + line;
      if (/^>/.test(line)) return "\\" + line;
      if (/^[-+](\s|$)/.test(line)) return "\\" + line;
      if (/^\d+[.)](\s|$)/.test(line)) return line.replace(/^(\d+)([.)])/, "$1\\$2");
      if (/^(=+|-+)\s*$/.test(line)) return "\\" + line;
      return line;
    })
    .join("\n");
}
