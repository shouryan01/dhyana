/** `[[Alice|Ali]]` reads as "Ali" in a list of snippets. */
export const plainContext = (s: string): string =>
  s.replace(/\[\[([^\]|]+?)(?:\|([^\]]*))?\]\]/g, (_m, target: string, label?: string) =>
    (label || target).trim(),
  );
