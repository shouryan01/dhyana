import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { z } from "zod";
import {
  AppStateSchema,
  DayFileSchema,
  SaveResultSchema,
  type Backend,
} from "./backend";

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
    return SaveResultSchema.parse(
      await invoke("save_day", { date, body, expectedHash, force }),
    );
  },
  async listDays(year, month) {
    return z.array(z.string()).parse(await invoke("list_days", { year, month }));
  },
  async onVaultChanged(cb) {
    return listen("vault://changed", (e) => cb(ChangedSchema.parse(e.payload).dates));
  },
};
