/** Helpers for the check-in's time picker. Times are stored as local `HH:MM` (24-hour). */

export interface Clock {
  /** 0-23 */
  h: number;
  /** 0-59 */
  m: number;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function parseClock(at: string): Clock {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(at);
  return m ? { h: Number(m[1]), m: Number(m[2]) } : { h: 0, m: 0 };
}

export const formatClock = ({ h, m }: Clock): string => `${pad(h)}:${pad(m)}`;

/** Does the user's locale write times on a 12-hour clock? */
export function uses12Hour(): boolean {
  try {
    return (
      new Intl.DateTimeFormat(undefined, { hour: "numeric" }).resolvedOptions().hour12 ?? false
    );
  } catch {
    return false;
  }
}

/** 0-23 → the 1-12 shown on a 12-hour clock, and whether it is the afternoon. */
export const to12 = (h24: number): { h: number; pm: boolean } => ({
  h: h24 % 12 || 12,
  pm: h24 >= 12,
});

/** 1-12 plus AM/PM → 0-23. */
export const from12 = (h12: number, pm: boolean): number => (h12 % 12) + (pm ? 12 : 0);
