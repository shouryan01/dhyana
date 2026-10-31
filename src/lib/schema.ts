/**
 * The schema layer for notes: zod types for the built-in note types, shared by the UI (and later
 * the AI tools) so every edit is validated one way. Rust validates the same rules on write
 * (`src-tauri/src/entities.rs`).
 */
import { z } from "zod";
import { isISODate } from "./dates";

export const ENTITY_KINDS = ["person", "place", "emotion", "tag", "note"] as const;
export const EntityKindSchema = z.enum(ENTITY_KINDS);
export type EntityKind = z.infer<typeof EntityKindSchema>;

/** Built-in note types. `icon` is a lucide icon name; see `TypeIcon`. */
export const BUILTIN_TYPES = {
  journal: { label: "Journal", icon: "book-open" },
  person: { label: "Person", icon: "user" },
  place: { label: "Place", icon: "map-pin" },
  emotion: { label: "Emotion", icon: "smile" },
  tag: { label: "Tag", icon: "hash" },
  note: { label: "Note", icon: "file-text" },
} as const;

/** Written to `emotions/` the first time a vault is opened; mirrors the Rust list. */
export const SEEDED_EMOTIONS = [
  "amazed",
  "amused",
  "angry",
  "annoyed",
  "anxious",
  "ashamed",
  "brave",
  "calm",
  "confident",
  "content",
  "disappointed",
  "discouraged",
  "disgusted",
  "drained",
  "embarrassed",
  "excited",
  "frustrated",
  "grateful",
  "guilty",
  "happy",
  "hopeful",
  "hopeless",
  "indifferent",
  "irritated",
  "jealous",
  "joyful",
  "lonely",
  "overwhelmed",
  "passionate",
  "peaceful",
  "proud",
  "relieved",
  "sad",
  "satisfied",
  "scared",
  "stressed",
  "surprised",
  "worried",
] as const;

const dateOrEmpty = z
  .string()
  .refine((s) => s === "" || isISODate(s), { message: "Use a date like 1990-05-02" });

/** What can be edited on an entity page. `undefined` leaves a field alone; "" clears it. */
export const EntityPatchSchema = z.object({
  title: z.string().optional(),
  aliases: z.array(z.string()).optional(),
  relationship: z.string().optional(),
  birthday: dateOrEmpty.optional(),
  notes: z.string().optional(),
});
export type EntityPatch = z.infer<typeof EntityPatchSchema>;

export const EntitySummarySchema = z.object({
  path: z.string(),
  kind: z.string(),
  name: z.string(),
  title: z.string().nullable(),
  display: z.string(),
  aliases: z.array(z.string()),
  mentions: z.number(),
  lastMention: z.string().nullable(),
});
export type EntitySummary = z.infer<typeof EntitySummarySchema>;

export const MentionSchema = z.object({
  path: z.string(),
  kind: z.string(),
  name: z.string(),
  date: z.string().nullable(),
  context: z.string(),
});
export type Mention = z.infer<typeof MentionSchema>;

export const EntityDetailSchema = EntitySummarySchema.extend({
  relationship: z.string().nullable(),
  birthday: z.string().nullable(),
  notes: z.string(),
  backlinks: z.array(MentionSchema),
});
export type EntityDetail = z.infer<typeof EntityDetailSchema>;

export const TagInfoSchema = z.object({ tag: z.string(), count: z.number() });
export type TagInfo = z.infer<typeof TagInfoSchema>;

export const UpcomingEventSchema = z.object({
  date: z.string(),
  label: z.string().nullable(),
  source: z.string(),
  sourceDate: z.string().nullable(),
});
export type UpcomingEvent = z.infer<typeof UpcomingEventSchema>;

export const RenameResultSchema = z.object({
  entity: EntitySummarySchema,
  updatedNotes: z.number(),
});
export type RenameResult = z.infer<typeof RenameResultSchema>;

/** One mood check-in, as stored in a day's `mood:` frontmatter list. Mirrors `mood.rs`. */
export const CheckInSchema = z.object({
  /** Local time of day. */
  at: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 07:30"),
  /** -1 very unpleasant … 1 very pleasant. */
  valence: z.number().min(-1).max(1),
  /** Emotion note filenames, so renaming an emotion can rewrite them (master plan §4a). */
  emotions: z.array(z.string()),
  factors: z.array(z.string()),
});
export type CheckIn = z.infer<typeof CheckInSchema>;

export const DayStatSchema = z.object({
  date: z.string(),
  words: z.number(),
  checkins: z.number(),
  /** Average valence of the day's check-ins. */
  valence: z.number().nullable(),
});
export type DayStat = z.infer<typeof DayStatSchema>;

export const OnThisDaySchema = z.object({
  date: z.string(),
  words: z.number(),
  excerpt: z.string(),
});
export type OnThisDay = z.infer<typeof OnThisDaySchema>;

export const VersionSchema = z.object({
  id: z.string(),
  time: z.string(),
  message: z.string(),
  deleted: z.boolean(),
});
export type Version = z.infer<typeof VersionSchema>;

export const VersionContentSchema = z.object({
  text: z.string().nullable(),
  previous: z.string().nullable(),
  current: z.string().nullable(),
});
export type VersionContent = z.infer<typeof VersionContentSchema>;
