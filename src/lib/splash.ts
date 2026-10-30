/** The static splash lives in index.html so it paints before JS loads; this drives it from React. */
const FADE_MS = 160;

export function hideSplash(el: HTMLElement | null = document.getElementById("splash")): void {
  if (!el) return;
  el.style.opacity = "0";
  window.setTimeout(() => el.remove(), FADE_MS);
}

/** Dev only: show the splash again for `ms`, then fade it out. Keep the markup in step with index.html. */
export function previewSplash(ms = 2000): void {
  if (document.getElementById("splash")) return;
  const el = document.createElement("div");
  el.id = "splash"; // styled by the <style> block in index.html
  el.innerHTML = '<img src="/logo.svg" alt="" /><div class="mark">dhyāna</div>';
  el.style.opacity = "0";
  document.body.append(el);
  requestAnimationFrame(() => requestAnimationFrame(() => (el.style.opacity = "1")));
  window.setTimeout(() => hideSplash(el), ms);
}
