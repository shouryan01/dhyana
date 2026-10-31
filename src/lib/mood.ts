/**
 * Mood check-in vocabulary: the valence scale (Apple Health's seven steps), the "what's having
 * the biggest impact" factors, and the colours. Stored values are documented in
 * `docs/vault-format.md`.
 */
import type { CheckIn } from "./schema";

/** Seven equal steps from -1 to 1, as Apple Health words them. */
export const VALENCE_LABELS = [
  "Very unpleasant",
  "Unpleasant",
  "Slightly unpleasant",
  "Neutral",
  "Slightly pleasant",
  "Pleasant",
  "Very pleasant",
] as const;

export const valenceStep = (v: number): number =>
  Math.min(6, Math.max(0, Math.floor(((v + 1) / 2) * 7)));

export const valenceLabel = (v: number): string => VALENCE_LABELS[valenceStep(v)];

/** Five colour classes for small marks (calendar dots, heatmap cells): -2 … 2. */
export function valenceBucket(v: number): -2 | -1 | 0 | 1 | 2 {
  if (v < -0.6) return -2;
  if (v < -0.2) return -1;
  if (v <= 0.2) return 0;
  if (v <= 0.6) return 1;
  return 2;
}

/**
 * The diverging mood colour for a valence: a neutral grey at 0, mixed towards the unpleasant
 * (cool violet) or pleasant (warm amber) pole. The three anchors are per-theme tokens in
 * `index.css`, so dark mode gets its own steps.
 */
export function moodColor(v: number): string {
  const p = Math.round(Math.min(1, Math.abs(v)) * 100);
  if (p === 0) return "var(--mood-mid)";
  return `color-mix(in oklab, var(${v < 0 ? "--mood-neg" : "--mood-pos"}) ${p}%, var(--mood-mid))`;
}

export const bucketColor = (b: number): string => moodColor(b / 2);

/** "What's having the biggest impact on you?" Stored as the id. */
export const FACTORS = [
  ["health", "Health"],
  ["fitness", "Fitness"],
  ["self-care", "Self-Care"],
  ["hobbies", "Hobbies"],
  ["identity", "Identity"],
  ["spirituality", "Spirituality"],
  ["community", "Community"],
  ["dating", "Dating"],
  ["family", "Family"],
  ["friends", "Friends"],
  ["partner", "Partner"],
  ["tasks", "Tasks"],
  ["weather", "Weather"],
  ["work", "Work"],
  ["education", "Education"],
  ["current-events", "Current Events"],
  ["travel", "Travel"],
  ["money", "Money"],
] as const;

const FACTOR_LABEL: Record<string, string> = Object.fromEntries(FACTORS);

/** A factor written by another app (or by hand) shows as written. */
export const factorLabel = (id: string): string => FACTOR_LABEL[id.toLowerCase()] ?? id;

/** Which way the starter emotions lean, so the picker can offer the likely ones first. */
const PLEASANT = new Set([
  "amazed",
  "amused",
  "brave",
  "calm",
  "confident",
  "content",
  "excited",
  "grateful",
  "happy",
  "hopeful",
  "joyful",
  "passionate",
  "peaceful",
  "proud",
  "relieved",
  "satisfied",
]);
const UNPLEASANT = new Set([
  "angry",
  "annoyed",
  "anxious",
  "ashamed",
  "disappointed",
  "discouraged",
  "disgusted",
  "drained",
  "embarrassed",
  "frustrated",
  "guilty",
  "hopeless",
  "irritated",
  "jealous",
  "lonely",
  "overwhelmed",
  "sad",
  "scared",
  "stressed",
  "worried",
]);

/** -1, 0 or 1: how an emotion name leans (0 for ones we don't know). */
export function emotionLean(name: string): number {
  const k = name.trim().toLowerCase();
  return PLEASANT.has(k) ? 1 : UNPLEASANT.has(k) ? -1 : 0;
}

/** Emotions that fit the chosen valence first, then the rest; alphabetical within each. */
export function sortEmotionsFor<T extends { name: string; display: string }>(
  list: T[],
  valence: number,
): T[] {
  const want = valence > 0.15 ? 1 : valence < -0.15 ? -1 : 0;
  const rank = (e: T) => {
    if (want === 0) return 0;
    const lean = emotionLean(e.name);
    return lean === want ? 0 : lean === 0 ? 1 : 2;
  };
  return [...list].sort(
    (a, b) =>
      rank(a) - rank(b) || a.display.localeCompare(b.display, undefined, { sensitivity: "base" }),
  );
}

const pad = (n: number) => String(n).padStart(2, "0");

/** The local time now, `HH:MM`. */
export const nowHHMM = (d = new Date()): string => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** "7:12 AM" / "07:12", in the user's locale. */
export function formatAt(at: string): string {
  const [h, m] = at.split(":").map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Mean valence of a day's check-ins, or null. */
export const averageValence = (list: CheckIn[]): number | null =>
  list.length
    ? Math.round((list.reduce((s, c) => s + c.valence, 0) / list.length) * 100) / 100
    : null;

/** Check-ins in time order, each with its index in the stored list (file first, then pending). */
export function timeline(
  mood: CheckIn[],
  pending: CheckIn[],
): { checkin: CheckIn; index: number; pending: boolean }[] {
  return [
    ...mood.map((checkin, index) => ({ checkin, index, pending: false })),
    ...pending.map((checkin, i) => ({ checkin, index: mood.length + i, pending: true })),
  ].sort((a, b) => a.checkin.at.localeCompare(b.checkin.at) || a.index - b.index);
}
