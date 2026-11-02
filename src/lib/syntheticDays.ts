/** A deterministic synthetic journal, for the dashboard's performance check and demos. */
import { addDays } from "./dates";
import type { AnalyticsDay } from "./schema";

const WORDS = `morning coffee walked river garden friend work meeting deadline tired happy quiet
  evening dinner cooked book read thought plan project weekend rain sun cold warm music call sister
  mother walk gym run slept dream idea writing letter market train city window light small slow
  remember forget wonder worry hope gratitude lunch tea home office kitchen bridge hill lake`.split(
  /\s+/,
);
const PEOPLE = ["Alex", "Sam", "Jo", "Priya", "Mum", "Ben"];
const PLACES = ["Cafe Nero", "The Park", "Office"];
const EMOTIONS = ["calm", "happy", "sad", "anxious", "grateful", "tired"];
const TAGS = ["work", "family", "health", "ideas", "gratitude"];

/** Mulberry32: small, fast, and the same numbers every run. */
function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `count` calendar days ending at `end`; about 85% of them have an entry of roughly 250 words. */
export function syntheticDays(count: number, end: string, seed = 1): AnalyticsDay[] {
  const r = rng(seed);
  const pick = <T>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const out: AnalyticsDay[] = [];
  for (let i = count - 1; i >= 0; i--) {
    if (r() < 0.15) continue;
    const date = addDays(end, -i);
    const n = 120 + Math.floor(r() * 260);
    const sentences: string[] = [];
    for (let w = 0; w < n;) {
      const len = 5 + Math.floor(r() * 12);
      const s = Array.from({ length: len }, () => pick(WORDS));
      s[0] = s[0][0].toUpperCase() + s[0].slice(1);
      sentences.push(`${s.join(" ")}${r() < 0.1 ? "?" : r() < 0.1 ? "!" : "."}`);
      w += len;
    }
    const links = [
      ...Array.from({ length: Math.floor(r() * 3) }, () => ({
        name: pick(PEOPLE),
        kind: "person",
      })),
      ...(r() < 0.4 ? [{ name: pick(PLACES), kind: "place" }] : []),
      ...(r() < 0.2 ? [{ name: pick(EMOTIONS), kind: "emotion" }] : []),
    ];
    const hour = String(6 + Math.floor(r() * 17)).padStart(2, "0");
    out.push({
      date,
      words: n,
      created: `${date}T${hour}:${String(Math.floor(r() * 60)).padStart(2, "0")}:00+00:00`,
      body: sentences.join(" "),
      moods:
        r() < 0.7
          ? Array.from({ length: 1 + Math.floor(r() * 2) }, () => ({
              at: `${String(Math.floor(r() * 24)).padStart(2, "0")}:00`,
              valence: Math.round((r() * 2 - 1) * 100) / 100,
              emotions: [pick(EMOTIONS)],
              factors: [],
            }))
          : [],
      tags: r() < 0.5 ? [pick(TAGS)] : [],
      links,
    });
  }
  return out;
}
