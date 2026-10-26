import { damp } from '@/core/math';

/** 相机：跟随 + 前瞻 + 创伤式震屏。 */
export class Camera {
  x = 0;
  y = 0;
  /** 0..1 震动强度（trauma） */
  trauma = 0;
  shakeMul = 1;

  private offX = 0;
  private offY = 0;
  private t = 0;

  follow(px: number, py: number, vx: number, vy: number, dt: number, viewportW: number, viewportH: number): void {
    // 前瞻：顺速度方向偏移，但限制幅度
    const lookX = px + vx * 0.18;
    const lookY = py + vy * 0.18;
    this.x = damp(this.x, lookX - viewportW / 2, 6, dt);
    this.y = damp(this.y, lookY - viewportH / 2, 6, dt);
    this.t += dt * 60;
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const mag = this.trauma * this.trauma * 14 * this.shakeMul;
    this.offX = Math.sin(this.t * 2.3) * mag + (Math.random() - 0.5) * mag;
    this.offY = Math.cos(this.t * 3.1) * mag + (Math.random() - 0.5) * mag;
  }

  kick(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  get ox(): number {
    return this.x + this.offX;
  }

  get oy(): number {
    return this.y + this.offY;
  }
}
