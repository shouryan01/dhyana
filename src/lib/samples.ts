/**
 * Loads and unloads the sample journal. A sample is its own vault, in its own folder under app
 * data, so unloading is: switch back to the real vault, then move the sample folder to the trash.
 * Only desktop builds can do this; the browser build has a single in-memory vault.
 */
import { backend } from "@/lib";
import { SAMPLE_CHECKINS } from "@/samples/dwightCheckIns";
import { SAMPLE_ENTRIES, SAMPLE_PEOPLE, SAMPLE_PLACES } from "@/samples/dwightSchrute";

const KEY = "dhyana.sample";
const FOLDER = "dwight-schrute";

interface Loaded {
  /** The vault to return to when the sample is unloaded. */
  previousVault: string | null;
  /** The sample's folder. */
  dir: string;
}

/** Which sample is loaded, if any. Kept per device so a reload still knows how to unload. */
export function loadedSample(): Loaded | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null");
    return v && typeof v.dir === "string" ? (v as Loaded) : null;
  } catch {
    return null;
  }
}

const remember = (v: Loaded | null) => {
  try {
    if (v) localStorage.setItem(KEY, JSON.stringify(v));
    else localStorage.removeItem(KEY);
  } catch {
    // storage unavailable: unloading will then need the vault to be switched back by hand
  }
};

export interface VaultSwitch {
  /** The vault the app is using now. */
  current: string | null;
  setVault(path: string): Promise<void>;
  refreshEntities(): Promise<void>;
}

/**
 * Switches to a fresh sample vault and fills it. Any sample already there is trashed first, so
 * loading always gives the same journal.
 */
export async function loadSample(app: VaultSwitch): Promise<void> {
  if (!backend.native) throw new Error("Sample journals load in the desktop app.");
  if (loadedSample()) throw new Error("The sample journal is already loaded.");
  const dir = `${await backend.sampleRoot()}/${FOLDER}`;
  const previousVault = app.current;
  await backend.removeSample(dir);

  await app.setVault(dir);
  remember({ previousVault, dir });

  for (const name of SAMPLE_PEOPLE) await backend.createEntity("person", name);
  for (const name of SAMPLE_PLACES) await backend.createEntity("place", name);
  for (const e of SAMPLE_ENTRIES) {
    await backend.saveDay(e.date, e.body, null, false);
    const checkin = SAMPLE_CHECKINS[e.date];
    if (checkin) await backend.addMood(e.date, checkin);
  }
  await app.refreshEntities();
}

/**
 * Returns to the vault the sample was loaded over, then trashes the sample folder. Switching
 * first means the app never has a trashed vault open.
 */
export async function unloadSample(app: VaultSwitch): Promise<void> {
  const s = loadedSample();
  if (!s) throw new Error("No sample journal is loaded.");
  if (!s.previousVault) throw new Error("There is no journal to return to.");
  await app.setVault(s.previousVault);
  await backend.removeSample(s.dir);
  remember(null);
  await app.refreshEntities();
}
