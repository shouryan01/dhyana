/**
 * The schema layer for notes: zod types for the built-in note types, shared by the UI (and later
 * the AI tools) so every edit is validated one way. Rust validates the same rules on write
 * (`src-tauri/src/entities.rs`).
 */
import { z } from "zod";
import { isISODate } from "./dates";

export const ENTITY_KINDS = ["person", "place", "emotion", "tag"] as const;
export const EntityKindSchema = z.enum(ENTITY_KINDS);
export type EntityKind = z.infer<typeof EntityKindSchema>;

/** Built-in note types. `icon` is a lucide icon name; see `TypeIcon`. */
export const BUILTIN_TYPES = {
  journal: { label: "Journal", icon: "book-open" },
  person: { label: "Person", icon: "user" },
  place: { label: "Place", icon: "map-pin" },
  emotion: { label: "Emotion", icon: "smile" },
  tag: { label: "Tag", icon: "hash" },
} as const;

/** Written to `emotions/` the first time a vault is opened; mirrors the Rust list. */
export const SEEDED_EMOTIONS = [
  "calm",
  "content",
  "grateful",
  "hopeful",
  "joyful",
  "excited",
  "proud",
  "loved",
  "peaceful",
  "curious",
  "relieved",
  "amused",
  "sad",
  "anxious",
  "angry",
  "frustrated",
  "lonely",
  "tired",
  "overwhelmed",
  "stressed",
  "bored",
  "guilty",
  "afraid",
  "disappointed",
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
