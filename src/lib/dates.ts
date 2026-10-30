/** Journal days are plain local calendar days (system timezone), written YYYY-MM-DD. */

const pad = (n: number) => String(n).padStart(2, "0");

export const toISODate = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

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
const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

/** Same day of the month, `n` months on (clamped to the end of a shorter month). */
export function addMonths(iso: string, n: number): string {
  const d = parseISODate(iso);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return toISODate(d);
}

const monthIndex = (word: string): number =>
  word.length >= 3 ? MONTHS.findIndex((m) => m === word || m.startsWith(word)) : -1;

/**
 * "dec 25", "25 december", "december 25th 2027", "12/25": a month and day, with an optional year.
 * Without a year it is the next such day, today included.
 */
function parseMonthDay(s: string, base: string): string | null {
  let month = -1;
  let day = 0;
  let year: number | null = null;
  let m = /^([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?$/.exec(s);
  if (m) {
    month = monthIndex(m[1]);
    day = Number(m[2]);
    year = m[3] ? Number(m[3]) : null;
  } else if ((m = /^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\.?(?:,?\s+(\d{4}))?$/.exec(s))) {
    month = monthIndex(m[2]);
    day = Number(m[1]);
    year = m[3] ? Number(m[3]) : null;
  } else if ((m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/.exec(s))) {
    month = Number(m[1]) - 1;
    day = Number(m[2]);
    year = m[3] ? Number(m[3]) : null;
  }
  if (month < 0 || month > 11 || day < 1) return null;
  const build = (y: number) => `${y}-${pad(month + 1)}-${pad(day)}`;
  if (year !== null) return isISODate(build(year)) ? build(year) : null;
  const thisYear = parseISODate(base).getFullYear();
  for (const y of [thisYear, thisYear + 1]) {
    if (isISODate(build(y)) && build(y) >= base) return build(y);
  }
  return null;
}

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
  const ahead = /^in\s+(a|an|\d{1,3})\s+(day|week|month)s?$/.exec(s);
  if (ahead) {
    const n = /^\d/.test(ahead[1]) ? Number(ahead[1]) : 1;
    if (ahead[2] === "month") return addMonths(base, n);
    return addDays(base, n * (ahead[2] === "week" ? 7 : 1));
  }
  if (s === "next week") return addDays(base, 7);
  if (s === "next month") return addMonths(base, 1);
  const monthDay = parseMonthDay(s, base);
  if (monthDay) return monthDay;
  const wk = /^(next|last|this)?\s*([a-z]+)$/.exec(s);
  if (wk) {
    const target = WEEKDAYS.findIndex(
      (w) => w === wk[2] || (wk[2].length >= 3 && w.startsWith(wk[2])),
    );
    if (target >= 0) {
      const cur = parseISODate(base).getDay();
      if (wk[1] === "last") return addDays(base, -((cur - target + 7) % 7 || 7));
      return addDays(base, (target - cur + 7) % 7 || (wk[1] === "next" ? 7 : 0));
    }
  }
  return null;
}
