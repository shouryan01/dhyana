/** A short burst of confetti from a point on screen. Does nothing for reduced-motion users. */

const COLORS = ["#e8a33d", "#d9683f", "#6aa87a", "#5b8fd9", "#b57bd6", "#e2c14a"];

interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  rot: number;
  vr: number;
  color: string;
}

export function confetti({ x, y, count = 60 }: { x: number; y: number; count?: number }): void {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const dpr = window.devicePixelRatio || 1;
  const canvas = document.createElement("canvas");
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  Object.assign(canvas.style, {
    position: "fixed",
    inset: "0",
    width: "100%",
    height: "100%",
    pointerEvents: "none",
    zIndex: "100",
  });
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas.remove();
  ctx.scale(dpr, dpr);

  const pieces: Piece[] = Array.from({ length: count }, () => {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1;
    const speed = 5 + Math.random() * 8;
    return {
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      w: 5 + Math.random() * 5,
      h: 3 + Math.random() * 4,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.4,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    };
  });

  const start = performance.now();
  const frame = (now: number) => {
    const t = now - start;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    for (const p of pieces) {
      p.vy += 0.3; // gravity
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - Math.max(0, t - 1400) / 600);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (t < 2000) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}
