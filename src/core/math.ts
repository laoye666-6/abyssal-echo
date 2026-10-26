/** 纯数学工具 —— 无副作用，全部可单测。 */

export interface Vec2 {
  x: number;
  y: number;
}

export const TAU = Math.PI * 2;

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** 帧率无关的指数趋近（用于相机平滑、UI 缓动）。 */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

export function len(x: number, y: number): number {
  return Math.hypot(x, y);
}

export function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
}

export function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay);
}

/** 归一化方向；零向量返回 (0,0)。 */
export function normX(x: number, y: number): number {
  const l = Math.hypot(x, y);
  return l === 0 ? 0 : x / l;
}

export function normY(x: number, y: number): number {
  const l = Math.hypot(x, y);
  return l === 0 ? 0 : y / l;
}

/** 把角度差归到 [-π, π]。 */
export function angleDiff(a: number, b: number): number {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/** 圆-圆碰撞的平方距离快速判断。 */
export function circlesOverlap(
  ax: number, ay: number, ar: number,
  bx: number, by: number, br: number,
): boolean {
  const r = ar + br;
  return dist2(ax, ay, bx, by) <= r * r;
}

/** 稳定的字符串 hash（用于把 id 映射到固定色相/抖动等）。 */
export function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 数字格式化：12345 -> 12.3k */
export function formatCompact(n: number): string {
  if (n < 1000) return String(Math.floor(n));
  if (n < 1_000_000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return (n / 1_000_000).toFixed(2).replace(/\.00$/, '') + 'M';
}

/** 秒 -> m:ss */
export function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}
