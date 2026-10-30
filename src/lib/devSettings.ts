/**
 * Developer-only switches. They exist only in dev builds (`pnpm dev` / `pnpm tauri dev`): in a
 * production build `IS_DEV` is false, the Settings section is not rendered, and every flag reads
 * as off. They live in localStorage, not in the app's settings file.
 */
export const IS_DEV = import.meta.env.DEV;

export interface DevSettings {
  /** Show onboarding on every launch, even when it has already been completed. */
  alwaysOnboarding: boolean;
  /** Keep the splash screen up for a couple of seconds so it can be looked at. */
  holdSplash: boolean;
}

const KEY = "dhyana.dev";
const OFF: DevSettings = { alwaysOnboarding: false, holdSplash: false };

export function getDevSettings(): DevSettings {
  if (!IS_DEV) return OFF;
  try {
    return { ...OFF, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return OFF;
  }
}

export function setDevSettings(patch: Partial<DevSettings>): DevSettings {
  const next = { ...getDevSettings(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // storage unavailable: the switch just won't persist
  }
  return next;
}
