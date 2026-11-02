/**
 * One mood check-in per sample entry, keyed by journal day. Each check-in's emotions and
 * factors follow what the entry is about, so the mood views have something real to show.
 */
import type { CheckIn } from "@/lib/schema";

export const SAMPLE_CHECKINS: Record<string, CheckIn> = {
  "2026-01-02": { at: "07:30", valence: 0.3, emotions: ["hopeful"], factors: ["work"] },
  "2026-01-14": { at: "18:00", valence: 0.5, emotions: ["proud"], factors: ["work"] },
  "2026-01-28": { at: "09:15", valence: -0.6, emotions: ["angry"], factors: ["work"] },
  "2026-02-09": { at: "10:30", valence: 0.2, emotions: ["proud", "annoyed"], factors: ["work"] },
  "2026-02-20": { at: "08:00", valence: 0.1, emotions: ["amused"], factors: ["work"] },
  "2026-03-03": { at: "09:05", valence: 0.7, emotions: ["happy"], factors: ["dating"] },
  "2026-03-14": { at: "14:00", valence: -0.4, emotions: ["frustrated"], factors: ["tasks"] },
  "2026-03-22": { at: "10:14", valence: -0.7, emotions: ["angry"], factors: ["work"] },
  "2026-04-05": { at: "19:30", valence: 0.8, emotions: ["happy"], factors: ["dating"] },
  "2026-04-19": { at: "16:00", valence: -0.8, emotions: ["sad"], factors: ["partner"] },
  "2026-04-20": { at: "09:00", valence: -0.7, emotions: ["lonely"], factors: ["partner"] },
  "2026-05-02": { at: "08:30", valence: -0.2, emotions: ["anxious"], factors: ["hobbies"] },
  "2026-05-18": { at: "11:00", valence: -0.3, emotions: ["angry"], factors: ["work"] },
  "2026-06-01": { at: "06:00", valence: 0.4, emotions: ["hopeful"], factors: ["hobbies"] },
  "2026-06-16": { at: "20:00", valence: 0.1, emotions: ["embarrassed"], factors: ["community"] },
  "2026-07-08": { at: "17:30", valence: -0.6, emotions: ["scared"], factors: ["work"] },
  "2026-07-22": { at: "15:00", valence: 0.9, emotions: ["proud"], factors: ["work"] },
  "2026-08-05": { at: "17:00", valence: 0.8, emotions: ["happy"], factors: ["dating"] },
  "2026-08-19": { at: "12:00", valence: -0.3, emotions: ["annoyed"], factors: ["work"] },
  "2026-09-04": { at: "18:45", valence: -0.6, emotions: ["sad"], factors: ["partner"] },
  "2026-09-16": { at: "15:00", valence: -0.2, emotions: ["annoyed"], factors: ["work"] },
  "2026-10-01": { at: "07:00", valence: 0.6, emotions: ["proud"], factors: ["hobbies"] },
  "2026-10-14": { at: "19:00", valence: 0.7, emotions: ["happy"], factors: ["community"] },
  "2026-10-28": { at: "10:00", valence: 0.5, emotions: ["happy"], factors: ["friends"] },
  "2026-11-15": { at: "16:00", valence: 0.6, emotions: ["grateful"], factors: ["work"] },
  "2026-12-01": { at: "07:15", valence: 0.3, emotions: ["calm"], factors: ["weather"] },
  "2026-12-31": { at: "21:00", valence: 0.4, emotions: ["grateful"], factors: ["friends"] },
};
