/**
 * Words in a note body: whitespace-separated runs with at least one letter or digit, so `-` and
 * list markers don't count and `[[Alice]]` counts once. Mirrors `count_words` in `index.rs`.
 */
export const countWords = (body: string): number =>
  body.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
