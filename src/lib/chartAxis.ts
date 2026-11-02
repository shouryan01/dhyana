import { formatShort } from "./dates";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export interface AxisTick {
  /** `YYYY-MM-DD` the tick sits on. */
  date: string;
  label: string;
}

/**
 * Tick marks for a time axis between two journal days: the first of each month that falls inside
 * the range ("Mar", with the year on each January), thinned so there are at most `max` of them.
 * A range shorter than a month has no month starts, so it is labelled by its two ends instead.
 */
export function monthTicks(first: string, last: string, max = 8): AxisTick[] {
  const all: AxisTick[] = [];
  let y = Number(first.slice(0, 4));
  let m = Number(first.slice(5, 7));
  if (first.slice(8) !== "01" && ++m > 12) [y, m] = [y + 1, 1];
  for (;;) {
    const date = `${y}-${String(m).padStart(2, "0")}-01`;
    if (date > last) break;
    all.push({ date, label: m === 1 ? `Jan ${y}` : MONTHS[m - 1] });
    if (++m > 12) [y, m] = [y + 1, 1];
  }
  if (all.length === 0) {
    return first === last
      ? [{ date: first, label: formatShort(first) }]
      : [
          { date: first, label: formatShort(first) },
          { date: last, label: formatShort(last) },
        ];
  }
  const step = Math.ceil(all.length / max);
  return all.filter((_, i) => i % step === 0);
}
