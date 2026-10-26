/**
 * 种子随机数（mulberry32）。
 * 一次运行（Run）内的所有随机必须来自这里，保证同种子同轨迹，可回放、可单测。
 */
export class Rng {
  private s: number;

  readonly seed: number;

  constructor(seed: number) {
    this.seed = seed >>> 0;
    this.s = seed >>> 0;
  }

  /** [0,1) */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** [min, max) 浮点 */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** [min, max] 整数（含两端） */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  /** 按权重挑选，返回索引。权重全 0 或空数组返回 -1。 */
  weighted(weights: readonly number[]): number {
    let total = 0;
    for (const w of weights) total += w;
    if (total <= 0) return -1;
    let roll = this.next() * total;
    for (let i = 0; i < weights.length; i++) {
      roll -= weights[i]!;
      if (roll < 0) return i;
    }
    return weights.length - 1;
  }

  /** 洗牌（Fisher–Yates，返回新数组）。 */
  shuffled<T>(arr: readonly T[]): T[] {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      const tmp = out[i]!;
      out[i] = out[j]!;
      out[j] = tmp;
    }
    return out;
  }

  pick<T>(arr: readonly T[]): T {
    return arr[this.int(0, arr.length - 1)]!;
  }

  /** 带方向偏差的均匀角度（±spread 围绕 center）。 */
  angleAround(center: number, spread: number): number {
    return center + this.range(-spread, spread);
  }
}
