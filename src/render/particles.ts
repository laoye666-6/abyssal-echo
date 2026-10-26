/** 池化粒子系统：命中火花、死亡碎裂、引擎尾焰、光环。 */

export type ParticleKind = 'spark' | 'glow' | 'shard' | 'smoke';

export interface Particle {
  alive: boolean;
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  kind: ParticleKind;
  drag: number;
  /** 旋转（shard 用） */
  rot: number;
  vrot: number;
}

const CAP = 2200;

export class Particles {
  readonly items: Particle[] = [];
  private cursor = 0;

  constructor() {
    for (let i = 0; i < CAP; i++) {
      this.items.push({
        alive: false, id: i, x: 0, y: 0, vx: 0, vy: 0,
        life: 0, maxLife: 1, size: 3, color: '#fff', kind: 'spark',
        drag: 0.9, rot: 0, vrot: 0,
      });
    }
  }

  spawn(o: Partial<Particle> & { x: number; y: number }): void {
    // 环形覆盖（超容量时最旧的被顶掉）
    let p: Particle | null = null;
    for (let i = 0; i < 8; i++) {
      const c = this.items[this.cursor]!;
      this.cursor = (this.cursor + 1) % CAP;
      if (!c.alive) {
        p = c;
        break;
      }
    }
    if (!p) p = this.items[this.cursor]!;
    p.alive = true;
    p.x = o.x;
    p.y = o.y;
    p.vx = o.vx ?? 0;
    p.vy = o.vy ?? 0;
    p.life = o.life ?? 0.5;
    p.maxLife = p.life;
    p.size = o.size ?? 3;
    p.color = o.color ?? '#ffffff';
    p.kind = o.kind ?? 'spark';
    p.drag = o.drag ?? 0.88;
    p.rot = o.rot ?? 0;
    p.vrot = o.vrot ?? 0;
  }

  burst(x: number, y: number, color: string, n: number, speed: number, opts: Partial<Particle> = {}): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.35 + Math.random() * 0.85);
      this.spawn({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        color,
        size: opts.size ?? (1.5 + Math.random() * 2.5),
        life: opts.life ?? (0.3 + Math.random() * 0.45),
        kind: opts.kind ?? 'spark',
        drag: opts.drag ?? 0.86,
        rot: Math.random() * Math.PI * 2,
        vrot: (Math.random() - 0.5) * 12,
      });
    }
  }

  update(dt: number): void {
    for (const p of this.items) {
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.alive = false;
        continue;
      }
      const dragF = Math.pow(p.drag, dt * 60);
      p.vx *= dragF;
      p.vy *= dragF;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vrot * dt;
    }
  }

  clear(): void {
    for (const p of this.items) p.alive = false;
  }

  get live(): number {
    let n = 0;
    for (const p of this.items) if (p.alive) n++;
    return n;
  }

  /** 世界坐标绘制（调用方已 translate 相机）。glow 需要 glow 贴图。 */
  drawWorld(ctx: CanvasRenderingContext2D, ox: number, oy: number, glow?: HTMLCanvasElement): void {
    ctx.save();
    for (const p of this.items) {
      if (!p.alive) continue;
      const k = p.life / p.maxLife;
      const sx = p.x - ox;
      const sy = p.y - oy;
      if (sx < -30 || sx > ctx.canvas.width + 30 || sy < -30 || sy > ctx.canvas.height + 30) continue;
      ctx.globalCompositeOperation = 'lighter';
      if (p.kind === 'glow' && glow) {
        ctx.globalAlpha = k * 0.8;
        ctx.drawImage(glow, sx - p.size * 3, sy - p.size * 3, p.size * 6, p.size * 6);
      } else if (p.kind === 'shard') {
        ctx.globalAlpha = k;
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      } else {
        // spark / smoke：小方点（性能好）
        ctx.globalAlpha = k * (p.kind === 'smoke' ? 0.35 : 0.95);
        ctx.fillStyle = p.color;
        const s = p.size * (0.5 + k * 0.5);
        ctx.fillRect(sx - s / 2, sy - s / 2, s, s);
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}
