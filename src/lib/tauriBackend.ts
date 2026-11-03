import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { z } from "zod";
import {
  AiViewSchema,
  BuiltSchema,
  DetectedAgentSchema,
  LogEntrySchema,
  McpInfoSchema,
  SessionInfoSchema,
  SessionSchema,
  UsageSchema,
  type ChatEvent,
} from "./ai";
import { AppStateSchema, DayFileSchema, SaveResultSchema, type Backend } from "./backend";
import {
  AnalyticsDaySchema,
  CheckInSchema,
  DayStatSchema,
  EntityDetailSchema,
  EntityPatchSchema,
  EntitySummarySchema,
  MentionSchema,
  OnThisDaySchema,
  RenameResultSchema,
  SavedSearchSchema,
  SearchHitSchema,
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
  async onHistoryChanged(cb) {
    return listen("history://changed", () => cb());
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
  async search(query) {
    return z.array(SearchHitSchema).parse(await invoke("search", { query }));
  },
  async analyticsDays() {
    return z.array(AnalyticsDaySchema).parse(await invoke("analytics_days"));
  },
  async savedSearches() {
    // A hand-edited or damaged file shouldn't break search: keep the entries that still parse.
    const raw = z
      .array(z.unknown())
      .catch([])
      .parse(await invoke("saved_searches"));
    return raw.flatMap((r) => {
      const s = SavedSearchSchema.safeParse(r);
      return s.success ? [s.data] : [];
    });
  },
  async saveSavedSearches(searches) {
    await invoke("save_saved_searches", { searches });
  },
  async sampleRoot() {
    return z.string().parse(await invoke("sample_root"));
  },
  async removeSample(path) {
    await invoke("remove_sample", { path });
  },
  async onEntitiesChanged(cb) {
    return listen("vault://entities", () => cb());
  },

  async aiGetSettings() {
    return AiViewSchema.parse(await invoke("ai_get_settings"));
  },
  async aiUpdateSettings(settings) {
    return AiViewSchema.parse(await invoke("ai_update_settings", { settings }));
  },
  async aiConsent(target, accepted) {
    return AiViewSchema.parse(await invoke("ai_consent", { target, accepted }));
  },
  async aiSetKey(provider, key) {
    await invoke("ai_set_key", { provider, key });
  },
  async aiClearKey(provider) {
    await invoke("ai_clear_key", { provider });
  },
  async aiDetectAgents() {
    return z.array(DetectedAgentSchema).parse(await invoke("ai_detect_agents"));
  },
  async aiPreview(input) {
    return BuiltSchema.parse(await invoke("ai_preview", { input }));
  },
  async aiSend(id, input) {
    return BuiltSchema.parse(await invoke("ai_send", { id, input }));
  },
  async aiCancel(id) {
    await invoke("ai_cancel", { id });
  },
  async onAiEvent(cb) {
    const Delta = z.object({ id: z.string(), text: z.string() });
    const Done = z.object({
      id: z.string(),
      inputTokens: z.number(),
      outputTokens: z.number(),
      sources: z.array(z.string()),
    });
    const Err = z.object({ id: z.string(), message: z.string() });
    const offs = await Promise.all([
      listen("ai://delta", (e) => {
        const d = Delta.parse(e.payload);
        cb({ type: "delta", ...d } satisfies ChatEvent);
      }),
      listen("ai://done", (e) => cb({ type: "done", ...Done.parse(e.payload) })),
      listen("ai://error", (e) => cb({ type: "error", ...Err.parse(e.payload) })),
    ]);
    return () => offs.forEach((off) => off());
  },
  async aiUsage() {
    return UsageSchema.parse(await invoke("ai_usage"));
  },
  async aiLog(limit) {
    return z.array(LogEntrySchema).parse(await invoke("ai_log", { limit }));
  },
  async aiClearLog() {
    await invoke("ai_clear_log");
  },
  async aiMcpInfo() {
    return McpInfoSchema.parse(await invoke("ai_mcp_info"));
  },
  async aiListSessions() {
    return z.array(SessionInfoSchema).parse(await invoke("ai_list_sessions"));
  },
  async aiLoadSession(id) {
    return SessionSchema.parse(await invoke("ai_load_session", { id }));
  },
  async aiSaveSession(id, session) {
    await invoke("ai_save_session", { id, session });
  },
  async aiDeleteSession(id) {
    await invoke("ai_delete_session", { id });
  },
};
