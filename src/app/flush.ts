import { backend } from "@/lib";

/**
 * Editors register a flush function so pending edits are written before navigation or quit.
 * Autosave is debounced; this is the "save-on-close" half.
 */
const flushers = new Set<() => Promise<void>>();

export function registerFlush(fn: () => Promise<void>): () => void {
  flushers.add(fn);
  return () => {
    flushers.delete(fn);
  };
}

export async function flushAll(): Promise<void> {
  await Promise.allSettled([...flushers].map((f) => f()));
}

/** Flush on quit: the Tauri close request (desktop) or beforeunload (browser dev). */
export async function installCloseFlush(): Promise<() => void> {
  const onUnload = () => void flushAll();
  window.addEventListener("beforeunload", onUnload);
  let unlisten: (() => void) | null = null;
  if (backend.native) {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const win = getCurrentWindow();
    unlisten = await win.onCloseRequested(async (e) => {
      e.preventDefault();
      await flushAll();
      await win.destroy();
    });
  }
  return () => {
    window.removeEventListener("beforeunload", onUnload);
    unlisten?.();
  };
}
