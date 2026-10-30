/** A line diff for the read-only history view. Notes are small, so a plain LCS is plenty. */

export interface DiffLine {
  kind: "same" | "add" | "del";
  text: string;
}

const splitLines = (s: string): string[] => {
  if (s === "") return [];
  const lines = s.replace(/\r\n/g, "\n").split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
};

/** Lines removed from `a`, added in `b`, and kept, in order. */
export function diffLines(a: string, b: string): DiffLine[] {
  const x = splitLines(a);
  const y = splitLines(b);
  // Trim the common start and end first; edits are usually small and local.
  let start = 0;
  while (start < x.length && start < y.length && x[start] === y[start]) start++;
  let endX = x.length;
  let endY = y.length;
  while (endX > start && endY > start && x[endX - 1] === y[endY - 1]) {
    endX--;
    endY--;
  }
  const xs = x.slice(start, endX);
  const ys = y.slice(start, endY);
  const n = xs.length;
  const m = ys.length;
  // lcs[i][j] = longest common subsequence of xs[i..] and ys[j..]
  const lcs = new Uint32Array((n + 1) * (m + 1));
  const at = (i: number, j: number) => i * (m + 1) + j;
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[at(i, j)] =
        xs[i] === ys[j]
          ? lcs[at(i + 1, j + 1)] + 1
          : Math.max(lcs[at(i + 1, j)], lcs[at(i, j + 1)]);
    }
  }
  const out: DiffLine[] = x.slice(0, start).map((text) => ({ kind: "same", text }));
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (xs[i] === ys[j]) {
      out.push({ kind: "same", text: xs[i] });
      i++;
      j++;
    } else if (lcs[at(i + 1, j)] >= lcs[at(i, j + 1)]) {
      out.push({ kind: "del", text: xs[i++] });
    } else {
      out.push({ kind: "add", text: ys[j++] });
    }
  }
  while (i < n) out.push({ kind: "del", text: xs[i++] });
  while (j < m) out.push({ kind: "add", text: ys[j++] });
  for (const text of x.slice(endX)) out.push({ kind: "same", text });
  return out;
}

export type DiffChunk = DiffLine | { kind: "skip"; count: number };

/** Long runs of unchanged lines folded down to `context` lines either side of a change. */
export function foldUnchanged(lines: DiffLine[], context = 2): DiffChunk[] {
  const changed = lines.map((l) => l.kind !== "same");
  const keep = lines.map((_, i) => {
    for (let d = -context; d <= context; d++) if (changed[i + d]) return true;
    return false;
  });
  const out: DiffChunk[] = [];
  let skipped = 0;
  lines.forEach((l, i) => {
    if (keep[i]) {
      if (skipped) out.push({ kind: "skip", count: skipped });
      skipped = 0;
      out.push(l);
    } else skipped++;
  });
  if (skipped) out.push({ kind: "skip", count: skipped });
  return out;
}
