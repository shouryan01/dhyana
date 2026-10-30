/** Journal days are plain local calendar days (system timezone), written YYYY-MM-DD. */

const pad = (n: number) => String(n).padStart(2, "0");

export const toISODate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const isISODate = (s: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = parseISODate(s);
  return toISODate(d) === s;
};

export function parseISODate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export const todayISO = () => toISODate(new Date());

export function addDays(iso: string, delta: number): string {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + delta);
  return toISODate(d);
}

export const formatLong = (iso: string) =>
  parseISODate(iso).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

export const formatShort = (iso: string) =>
  parseISODate(iso).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

export const formatMonth = (year: number, month: number) =>
  new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });

/** 0 = Sunday ... 6 = Saturday */
export function firstDayOfWeek(): number {
  try {
    const loc = new Intl.Locale(navigator.language) as Intl.Locale & {
      weekInfo?: { firstDay: number };
      getWeekInfo?: () => { firstDay: number };
    };
    const info = loc.getWeekInfo?.() ?? loc.weekInfo;
    if (info) return info.firstDay % 7;
  } catch {
    /* fall through */
  }
  return 1;
}

/** Weeks of ISO dates (null = padding) for a month; month is 1-12. */
export function monthGrid(year: number, month: number, weekStart: number): (string | null)[][] {
  const first = new Date(year, month - 1, 1);
  const lead = (first.getDay() - weekStart + 7) % 7;
  const days = new Date(year, month, 0).getDate();
  const cells: (string | null)[] = Array(lead).fill(null);
  for (let d = 1; d <= days; d++) cells.push(`${year}-${pad(month)}-${pad(d)}`);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/**
 * Parses what a person types into "go to date": ISO, today/yesterday/tomorrow, +3 / -2 (days),
 * "next friday" / "last monday" / "friday".
 */
export function parseDateInput(input: string, base: string = todayISO()): string | null {
  const s = input.trim().toLowerCase();
  if (!s) return null;
  if (isISODate(s)) return s;
  if (s === "today" || s === "now") return base;
  if (s === "yesterday") return addDays(base, -1);
  if (s === "tomorrow") return addDays(base, 1);
  const rel = /^([+-])\s*(\d{1,4})\s*d?$/.exec(s);
  if (rel) return addDays(base, (rel[1] === "-" ? -1 : 1) * Number(rel[2]));
  const wk = /^(next|last|this)?\s*([a-z]+)$/.exec(s);
  if (wk) {
    const target = WEEKDAYS.findIndex((w) => w === wk[2] || (wk[2].length >= 3 && w.startsWith(wk[2])));
    if (target >= 0) {
      const cur = parseISODate(base).getDay();
      if (wk[1] === "last") return addDays(base, -(((cur - target + 7) % 7) || 7));
      return addDays(base, ((target - cur + 7) % 7) || (wk[1] === "next" ? 7 : 0));
    }
  }
  return null;
}
