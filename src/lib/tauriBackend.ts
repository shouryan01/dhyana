import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { z } from "zod";
import { AppStateSchema, DayFileSchema, SaveResultSchema, type Backend } from "./backend";
import {
  CheckInSchema,
  DayStatSchema,
  EntityDetailSchema,
  EntityPatchSchema,
  EntitySummarySchema,
  MentionSchema,
  OnThisDaySchema,
  RenameResultSchema,
  TagInfoSchema,
  UpcomingEventSchema,
  VersionContentSchema,
  VersionSchema,
} from "./schema";

const ChangedSchema = z.object({ dates: z.array(z.string()) });

export const tauriBackend: Backend = {
  native: true,
  async getAppState() {
    return AppStateSchema.parse(await invoke("get_app_state"));
  },
  async updateSettings(patch) {
    return AppStateSchema.parse(await invoke("update_settings", { patch }));
  },
  async defaultVaultPath() {
    return z.string().parse(await invoke("default_vault_path"));
  },
  async setVault(path) {
    return AppStateSchema.parse(await invoke("set_vault", { path }));
  },
  async pickFolder() {
    const picked = await open({ directory: true, multiple: false });
    return typeof picked === "string" ? picked : null;
  },
  async readDay(date) {
    return DayFileSchema.parse(await invoke("read_day", { date }));
  },
  async saveDay(date, body, expectedHash, force) {
    return SaveResultSchema.parse(await invoke("save_day", { date, body, expectedHash, force }));
  },
  async deleteDay(date) {
    return z.boolean().parse(await invoke("delete_day", { date }));
  },
  async listDays(year, month) {
    return z.array(z.string()).parse(await invoke("list_days", { year, month }));
  },
  async listYears() {
    return z.array(z.number()).parse(await invoke("list_years"));
  },
  async onVaultChanged(cb) {
    return listen("vault://changed", (e) => cb(ChangedSchema.parse(e.payload).dates));
  },
  async addMood(date, checkin) {
    return DayFileSchema.parse(
      await invoke("add_mood", { date, checkin: CheckInSchema.parse(checkin) }),
    );
  },
  async updateMood(date, index, checkin) {
    return DayFileSchema.parse(
      await invoke("update_mood", { date, index, checkin: CheckInSchema.parse(checkin) }),
    );
  },
  async deleteMood(date, index) {
    return DayFileSchema.parse(await invoke("delete_mood", { date, index }));
  },
  async moodOffer(date) {
    return z.boolean().parse(await invoke("mood_offer", { date }));
  },
  async markMoodOffered(date, outcome) {
    await invoke("mark_mood_offered", { date, outcome });
  },
  async dayStats(from, to) {
    return z.array(DayStatSchema).parse(await invoke("day_stats", { from, to }));
  },
  async onThisDay(date) {
    return z.array(OnThisDaySchema).parse(await invoke("on_this_day", { date }));
  },
  async noteHistory(path) {
    return z.array(VersionSchema).parse(await invoke("note_history", { path }));
  },
  async noteVersion(path, id) {
    return VersionContentSchema.parse(await invoke("note_version", { path, id }));
  },
  async restoreVersion(path, id) {
    await invoke("restore_version", { path, id });
  },
  async checkpoint(reason) {
    return z
      .string()
      .nullable()
      .parse(await invoke("checkpoint", { reason }));
  },
  async listEntities() {
    return z.array(EntitySummarySchema).parse(await invoke("list_entities"));
  },
  async listTags() {
    return z.array(TagInfoSchema).parse(await invoke("list_tags"));
  },
  async getEntity(path) {
    return EntityDetailSchema.parse(await invoke("get_entity", { path }));
  },
  async createEntity(kind, name) {
    return EntitySummarySchema.parse(await invoke("create_entity", { kind, name }));
  },
  async updateEntity(path, patch) {
    return EntityDetailSchema.parse(
      await invoke("update_entity", { path, patch: EntityPatchSchema.parse(patch) }),
    );
  },
  async renameEntity(path, newName) {
    return RenameResultSchema.parse(await invoke("rename_entity", { path, newName }));
  },
  async deleteEntity(path) {
    await invoke("delete_entity", { path });
  },
  async tagNotes(tag) {
    return z.array(MentionSchema).parse(await invoke("tag_notes", { tag }));
  },
  async resetLibrary() {
    return z.number().parse(await invoke("reset_library"));
  },
  async upcoming(from, limit) {
    return z.array(UpcomingEventSchema).parse(await invoke("upcoming", { from, limit }));
  },
  async rebuildIndex() {
    await invoke("rebuild_index");
  },
  async onEntitiesChanged(cb) {
    return listen("vault://entities", () => cb());
  },
};
