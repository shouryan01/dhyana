/**
 * One registry for every action in the app. The command palette, tooltips and the settings
 * reference all read from it, and the global key handler dispatches from it.
 *
 * Shortcut syntax: "mod+k", "mod+shift+t", "mod+[" (chords; work everywhere) and "g t" or "?"
 * (single keys / sequences; only fire when focus is NOT in a text field, e.g. not in the editor).
 */
export interface Action {
  id: string;
  label: string;
  group: "Navigate" | "Journal" | "App";
  /** Primary shortcut, shown in the palette and tooltips. */
  shortcut?: string;
  /** Extra keys that trigger the same action (e.g. a chord that also works inside the editor). */
  also?: string[];
  keywords?: string;
  run: () => void;
}

export const isMac = () =>
  typeof navigator !== "undefined" && /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent);

const isChord = (spec: string) => spec.includes("+") && spec.length > 1 && !spec.includes(" ");

export interface KeyLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

/** Does this key event match a chord like "mod+shift+t"? */
export function matchChord(e: KeyLike, spec: string, mac = isMac()): boolean {
  const parts = spec.toLowerCase().split("+");
  // A trailing "+" key ("mod++") splits into an empty last part.
  const key = parts[parts.length - 1] === "" ? "+" : parts[parts.length - 1];
  const mods = new Set(parts.slice(0, -1));
  const wantMod = mods.has("mod");
  const wantCtrl = mods.has("ctrl") || (wantMod && !mac);
  const wantMeta = mods.has("meta") || (wantMod && mac);
  return (
    e.ctrlKey === wantCtrl &&
    e.metaKey === wantMeta &&
    e.altKey === mods.has("alt") &&
    e.shiftKey === mods.has("shift") &&
    e.key.toLowerCase() === key
  );
}

export const isTextTarget = (el: EventTarget | null): boolean => {
  if (!(el instanceof HTMLElement)) return false;
  return (
    el.isContentEditable ||
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.tagName === "SELECT" ||
    el.getAttribute("role") === "textbox"
  );
};

/** macOS lists modifiers in Apple's order: Control, Option, Shift, Command. */
const MAC_MOD_ORDER = ["⌃", "⌥", "⇧", "⌘"];

/** Pretty-print a shortcut for display: "mod+shift+k" -> "⇧⌘K" on macOS, "Ctrl+Shift+K" elsewhere. */
export function formatShortcut(spec: string, mac = isMac()): string[] {
  if (!isChord(spec)) return spec.split(" ").map((k) => k.toUpperCase());
  const parts = spec.split("+");
  const key = parts[parts.length - 1] === "" ? "+" : parts[parts.length - 1];
  const mods = parts.slice(0, -1).map((m) => {
    switch (m.toLowerCase()) {
      case "mod":
        return mac ? "⌘" : "Ctrl";
      case "shift":
        return mac ? "⇧" : "Shift";
      case "alt":
        return mac ? "⌥" : "Alt";
      case "ctrl":
        return mac ? "⌃" : "Ctrl";
      default:
        return m;
    }
  });
  if (mac) mods.sort((a, b) => MAC_MOD_ORDER.indexOf(a) - MAC_MOD_ORDER.indexOf(b));
  return [...mods, key.length === 1 ? key.toUpperCase() : key];
}

/** One-line form for tooltips: "⇧⌘K" on macOS (no separators), "Ctrl+Shift+K" elsewhere. */
export const shortcutLabel = (spec: string, mac = isMac()): string => formatShortcut(spec, mac).join(mac ? "" : "+");

const specsOf = (a: Action): string[] => [a.shortcut, ...(a.also ?? [])].filter((s): s is string => !!s);

/**
 * Stateful dispatcher for key events: returns the action a key event triggers (or null), tracking
 * the first key of a two-key sequence like "g t".
 */
export function createDispatcher(getActions: () => Action[], now: () => number = Date.now) {
  let pending: { key: string; at: number } | null = null;
  const SEQUENCE_WINDOW_MS = 1000;

  return function dispatch(e: KeyLike, inText: boolean): Action | null {
    const entries = getActions().flatMap((a) => specsOf(a).map((spec) => ({ a, spec })));

    for (const { a, spec } of entries) {
      if (isChord(spec) && matchChord(e, spec)) {
        pending = null;
        return a;
      }
    }

    // Plain keys never fire from text fields, or with a modifier held.
    if (inText || e.ctrlKey || e.metaKey || e.altKey) {
      pending = null;
      return null;
    }
    const key = e.key.toLowerCase();
    if (key.length > 1) return null; // Shift, Tab, Enter, ...

    if (pending && now() - pending.at <= SEQUENCE_WINDOW_MS) {
      const seq = `${pending.key} ${key}`;
      pending = null;
      const hit = entries.find((x) => x.spec === seq);
      if (hit) return hit.a;
    }

    const single = entries.find((x) => !isChord(x.spec) && !x.spec.includes(" ") && x.spec === (x.spec === "?" ? e.key : key));
    if (single) {
      pending = null;
      return single.a;
    }
    pending = entries.some((x) => x.spec.startsWith(key + " ")) ? { key, at: now() } : null;
    return null;
  };
}
