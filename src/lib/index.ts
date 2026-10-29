import type { Backend } from "./backend";
import { createMemoryBackend } from "./memoryBackend";
import { tauriBackend } from "./tauriBackend";

const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const backend: Backend = inTauri ? tauriBackend : createMemoryBackend();
