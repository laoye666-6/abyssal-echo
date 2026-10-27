import type { RunState, FxEvent } from '@/game/types';
import { ENEMY_DEFS } from '@/data/enemies.data';
import type { Atlas } from './atlas';
import { buildGlowBlob } from './atlas';
import { GlowCache } from './glow';
import type { Camera } from './camera';
import type { Particles } from './particles';
import { clamp } from '@/core/math';

interface TransientFx {
  kind: string;
  x: number;
  y: number;
  x2: number;
  y2: number;
  r: number;
  color: string;
  t: number;
  max: number;
  points?: number[];
}

interface DmgNum {
  alive: boolean;
  x: number;
  y: number;
  vy: number;
  life: number;
  max: number;
  text: string;
  color: string;
  size: number;
  amount: number;
  crit: boolean;
  toPlayer: boolean;
}

interface Star { x: number; y: number; s: number; a: number; layer: number }

export interface RenderOpts {
  showDamageNumbers: boolean;
  shakeMul: number;
}

const DMG_CAP = 90;

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private glow: HTMLCanvasElement;
  private glowCache = new GlowCache();
  private vignette: HTMLCanvasElement | null = null;
  private stars: Star[] = [];
  private nebulae: HTMLCanvasElement[] = [];
  private fx: TransientFx[] = [];
  private dmg: DmgNum[] = [];
  private dashTrail: { x: number; y: number; rot: number; life: number }[] = [];
  private w = 0;
  private h = 0;
  private dpr = 1;
  private time = 0;

  // ---- 自适应画质：EMA 帧时间监控，卡顿自动降档、流畅自动回升 ----
  /** 2=高（DPR≤1.5 + 全特效） 1=中（DPR1） 0=低（DPR1 + 关云气/减辉光） */
  qualityTier = 2;
  private emaDt = 0.016;
  private tierCooldown = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly atlas: Atlas,
    private readonly camera: Camera,
    private readonly particles: Particles,
    private opts: RenderOpts,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.glow = buildGlowBlob();
    for (let i = 0; i < DMG_CAP; i++) {
      this.dmg.push({ alive: false, x: 0, y: 0, vy: 0, life: 0, max: 1, text: '', color: '#fff', size: 13, amount: 0, crit: false, toPlayer: false });
    }
    for (let i = 0; i < 220; i++) {
      this.stars.push({
        x: Math.random(), y: Math.random(),
        s: 0.6 + Math.random() * 1.6,
        a: 0.25 + Math.random() * 0.6,
        layer: Math.floor(Math.random() * 3),
      });
    }
    this.buildNebulae();
    this.resize();
  }

  /** 深空云气：两张 512² 贴图（青/紫），每帧 drawImage 平铺。 */
  private buildNebulae(): void {
    this.nebulae = [];
    for (const rgb of ['40,80,140', '90,40,120']) {
      const c = document.createElement('canvas');
      c.width = 512;
      c.height = 512;
      const g = c.getContext('2d')!;
      const grad = g.createRadialGradient(256, 256, 0, 256, 256, 256);
      grad.addColorStop(0, `rgba(${rgb},0.10)`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 512, 512);
      this.nebulae.push(c);
    }
  }

  resize(): void {
    // 高档位允许最高 1.5 DPR（2.0 会带来 4 倍像素填充，是低帧率主因之一）
    const cap = this.qualityTier >= 2 ? Math.min(1.5, window.devicePixelRatio || 1) : 1;
    this.dpr = cap;
    this.w = this.canvas.clientWidth || window.innerWidth;
    this.h = this.canvas.clientHeight || window.innerHeight;
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.vignette = null;
  }

  private setTier(t: number): void {
    if (t === this.qualityTier) return;
    this.qualityTier = t;
    this.resize();
  }

  setOptions(next: Partial<RenderOpts>): void {
    this.opts = { ...this.opts, ...next };
  }

  get width(): number { return this.w; }
  get height(): number { return this.h; }

  /** 每帧调用。frameDt 用于表现层动画（相机、fx、粒子）。 */
  render(state: RunState | null, frameDt: number, lowHp: boolean): void {
    const ctx = this.ctx;
    this.time += frameDt;

    // 自适应画质：>19ms（≈52fps 以下）快速降档，<14.5ms 持续回升 —— 目标稳 60fps
    this.emaDt = this.emaDt * 0.92 + Math.min(frameDt, 0.25) * 0.08;
    if (this.tierCooldown > 0) this.tierCooldown--;
    else if (this.qualityTier > 0 && this.emaDt > 0.019) {
      this.setTier(this.qualityTier - 1);
      this.tierCooldown = 180;
    } else if (this.qualityTier < 2 && this.emaDt < 0.0145) {
      this.setTier(this.qualityTier + 1);
      this.tierCooldown = 600;
    }

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    // 背景
    ctx.fillStyle = '#05070f';
    ctx.fillRect(0, 0, this.w, this.h);
    this.drawBackground();

    if (!state) return;

    const ox = this.camera.ox;
    const oy = this.camera.oy;
    ctx.save();
    ctx.translate(-ox, -oy);

    this.drawGems(state);
    this.drawPickups(state);
    this.drawEBullets(state);
    this.drawEnemies(state);
    this.drawAttendants(state);
    this.drawProjectiles(state);
    this.drawPlayer(state);
    this.drawFxWorld(state, frameDt);

    ctx.restore();

    // 限制粒子绘制量（实测：粒子满载 + lighter 混合是最大填充开销）
    this.particles.drawWorld(ctx, ox, oy, this.glow, this.qualityTier === 2 ? 1100 : this.qualityTier === 1 ? 800 : 500);
    this.drawFxScreen(state, frameDt);
    if (this.opts.showDamageNumbers) this.drawDamageNumbers(frameDt);
    this.drawVignette(lowHp);
  }

  // ---------------- 背景 ----------------

  private drawBackground(): void {
    const ctx = this.ctx;
    const ox = this.camera.ox;
    const oy = this.camera.oy;

    // 星尘三层视差（逐星小方块 —— 远比整层贴图合成便宜）
    const tile = Math.max(this.w, this.h) * 1.6;
    for (const st of this.stars) {
      const par = 0.15 + st.layer * 0.22;
      const sx = (((st.x * tile - ox * par) % tile) + tile) % tile - tile * 0.15;
      const sy = (((st.y * tile - oy * par) % tile) + tile) % tile - tile * 0.15;
      if (sx < -4 || sx > this.w + 4 || sy < -4 || sy > this.h + 4) continue;
      ctx.globalAlpha = st.a * (st.layer === 2 ? 1 : 0.75);
      ctx.fillStyle = st.layer === 2 ? '#cfe8ff' : '#8fb8d8';
      ctx.fillRect(sx, sy, st.s, st.s);
    }
    ctx.globalAlpha = 1;

    // 参考网格（世界系点阵）
    const spacing = 120;
    const startX = Math.floor(ox / spacing) * spacing;
    const startY = Math.floor(oy / spacing) * spacing;
    ctx.fillStyle = 'rgba(90,140,190,0.10)';
    for (let x = startX; x < ox + this.w + spacing; x += spacing) {
      for (let y = startY; y < oy + this.h + spacing; y += spacing) {
        ctx.fillRect(x - ox, y - oy, 2, 2);
      }
    }

    // 深空云气（预渲染贴图，screen 混合；低档位跳过）
    if (this.qualityTier >= 1) {
      const nebTile = 1800;
      ctx.globalCompositeOperation = 'screen';
      const par = 0.35;
      for (let i = 0; i < 4; i++) {
        const nx0 = (i * 761) % nebTile;
        const ny0 = (i * 1201) % nebTile;
        const sx = (((nx0 - ox * par) % nebTile) + nebTile) % nebTile - nebTile * 0.3;
        const sy = (((ny0 - oy * par) % nebTile) + nebTile) % nebTile - nebTile * 0.3;
        const r = 480 + (i % 2) * 260;
        if (sx + r < 0 || sx - r > this.w || sy + r < 0 || sy - r > this.h) continue;
        const tex = this.nebulae[i % 2];
        if (!tex) continue;
        ctx.drawImage(tex, sx - r, sy - r, r * 2, r * 2);
      }
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  // ---------------- 实体 ----------------

  private drawSprite(key: string, x: number, y: number, targetR: number, rot: number, alpha = 1, flash = 0): void {
    const ctx = this.ctx;
    const sp = this.atlas.get(key);
    if (!sp) return;
    const scale = targetR / sp.r;
    const drawW = sp.canvas.width / 2 * scale;
    const drawH = sp.canvas.height / 2 * scale;
    ctx.save();
    ctx.translate(x, y);
    if (rot) ctx.rotate(rot);
    ctx.globalAlpha = alpha;
    ctx.drawImage(sp.canvas, -drawW / 2, -drawH / 2, drawW, drawH);
    if (flash > 0) {
      ctx.globalAlpha = Math.min(1, flash / 0.12) * alpha;
      ctx.drawImage(sp.white, -drawW / 2, -drawH / 2, drawW, drawH);
    }
    ctx.restore();
  }

  /** 着色辉光：GlowCache 预渲染贴图，单次 drawImage（每帧数百次调用的热路径）。 */
  private drawGlowAt(x: number, y: number, r: number, color: string, alpha: number): void {
    const ctx = this.ctx;
    const tex = this.glowCache.get(color, r);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = alpha;
    ctx.drawImage(tex, x - r, y - r, r * 2, r * 2);
    ctx.restore();
  }

  private drawEnemies(state: RunState): void {
    const ctx = this.ctx;
    state.enemies.forEach((e) => {
      const def = ENEMY_DEFS[e.kind];
      const spawnA = e.spawnT > 0 ? clamp(1 - e.spawnT / 0.8, 0.15, 1) : 1;
      const spawnScale = e.spawnT > 0 ? 0.6 + 0.4 * (1 - e.spawnT / 0.8) : 1;

      // 精英/光环
      if (e.tier === 'elite' || e.tier === 'boss') {
        const pulse = 1 + Math.sin(this.time * 6) * 0.06;
        ctx.save();
        ctx.strokeStyle = e.tier === 'boss' ? '#ff9be4' : '#ffe45b';
        ctx.globalAlpha = 0.75 * spawnA;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r * 1.35 * pulse, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      if (e.slow > 0) {
        this.drawGlowAt(e.x, e.y, e.r * 1.5, '#78c8ff', 0.4 * spawnA);
      }

      const rot = def.behavior === 'chaser' || def.behavior === 'weaver'
        ? Math.atan2(state.player.y - e.y, state.player.x - e.x) + Math.PI / 2
        : this.time * (e.id % 2 === 0 ? 0.6 : -0.6);

      this.drawSprite(`enemy_${e.kind}`, e.x, e.y, e.r * spawnScale, rot, spawnA, e.flash);
      if (e.stun > 0) {
        ctx.save();
        ctx.strokeStyle = '#ffe9a0';
        ctx.globalAlpha = 0.9;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r + 4, this.time * 8, this.time * 8 + 2.2);
        ctx.stroke();
        ctx.restore();
      }
      // 小血条（精英以下不画，保持画面干净）
      if (e.tier !== 'normal' && e.hp < e.maxHp) {
        const w = e.r * 2.2;
        const yy = e.y - e.r - 10;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(e.x - w / 2, yy, w, 4);
        ctx.fillStyle = e.tier === 'boss' ? '#ff4bd8' : '#ffe45b';
        ctx.fillRect(e.x - w / 2, yy, w * clamp(e.hp / e.maxHp, 0, 1), 4);
      }
    });
  }

  private drawProjectiles(state: RunState): void {
    state.projectiles.forEach((p) => {
      const key = `pr_${p.kind}`;
      const ang = Math.atan2(p.vy, p.vx) + Math.PI / 2;
      // 尾迹
      this.drawGlowAt(p.x - p.vx * 0.012, p.y - p.vy * 0.012, p.r * 2.2, p.color, 0.35);
      this.drawSprite(key, p.x, p.y, p.r, ang);
    });
  }

  private drawEBullets(state: RunState): void {
    state.ebullets.forEach((b) => {
      this.drawGlowAt(b.x, b.y, b.r * 2.4, '#ff5b5b', 0.5);
      this.drawSprite('ebullet', b.x, b.y, b.r, 0);
    });
  }

  private drawGems(state: RunState): void {
    state.gems.forEach((g) => {
      const pulse = 1 + Math.sin(this.time * 5 + g.id) * 0.14;
      this.drawGlowAt(g.x, g.y, g.value >= 10 ? 22 : 14, '#8fe86b', g.value >= 10 ? 0.8 : 0.65);
      this.drawSprite('gem', g.x, g.y, (g.value >= 10 ? 11 : 8) * pulse, this.time * 1.5 + g.id);
    });
  }

  private drawPickups(state: RunState): void {
    state.pickups.forEach((pk) => {
      const bob = Math.sin(this.time * 3 + pk.id) * 3;
      const color = pk.kind === 'heal' ? '#8fe86b' : pk.kind === 'bomb' ? '#ffd75b' : '#ffc45b';
      this.drawGlowAt(pk.x, pk.y + bob, 26, color, 0.55);
      this.drawSprite(`pick_${pk.kind}`, pk.x, pk.y + bob, 13, this.time * 0.8);
    });
  }

  private drawAttendants(state: RunState): void {
    state.attendants.forEach((a) => {
      if (a.kind === 'orbit') {
        const key = a.ownerWeapon === 'orbit_corona' ? 'pr_orbit_corona' : 'pr_orbit';
        this.drawGlowAt(a.x, a.y, a.r * 2.4, '#8ce6ff', 0.4);
        this.drawSprite(key, a.x, a.y, a.r, a.angle * 3);
      } else if (a.kind === 'drone') {
        this.drawGlowAt(a.x, a.y, a.r * 2, '#78ffbe', 0.3);
        this.drawSprite('pr_drone', a.x, a.y, a.r, a.angle + Math.PI / 2);
      } else if (a.kind === 'aura') {
        const ctx = this.ctx;
        const pulse = 1 + Math.sin(this.time * 3.4) * 0.03;
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = a.ownerWeapon === 'frost_zero' ? '#bfe8ff' : '#8fd8ff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(a.x, a.y, a.r * pulse, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 0.06;
        ctx.fillStyle = '#8fd8ff';
        ctx.fill();
        ctx.restore();
      }
    });
  }

  private drawPlayer(state: RunState): void {
    const p = state.player;
    const blink = p.iframe > 0 ? (Math.sin(this.time * 40) > 0 ? 0.45 : 0.9) : 1;
    // 冲刺残影：冲刺期间记录轨迹点，渐隐重绘
    if (p.dashT > 0) {
      this.dashTrail.push({ x: p.x, y: p.y, rot: p.facing + Math.PI / 2, life: 0.26 });
      if (this.dashTrail.length > 12) this.dashTrail.shift();
      this.drawGlowAt(p.x, p.y, 60, '#a0f0ff', 0.5);
    }
    for (let i = this.dashTrail.length - 1; i >= 0; i--) {
      const g = this.dashTrail[i]!;
      g.life -= 0.016;
      if (g.life <= 0) {
        this.dashTrail.splice(i, 1);
        continue;
      }
      this.drawSprite('player', g.x, g.y, 15, g.rot, g.life * 1.6);
    }
    // 引擎尾焰粒子由 App 层每步生成；这里画光晕
    this.drawGlowAt(p.x, p.y, 34, '#5be7ff', 0.4);
    this.drawSprite('player', p.x, p.y, 15, p.facing + Math.PI / 2, blink);
  }

  // ---------------- FX ----------------

  /** 世界空间 fx（一次性事件 -> 瞬时动画 + 粒子） */
  private drawFxWorld(state: RunState, frameDt: number): void {
    const ctx = this.ctx;
    // 消费事件
    for (const ev of state.events.fx) {
      this.enqueueFx(ev, state);
    }

    // 绘制瞬时 fx
    ctx.save();
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i]!;
      f.t += frameDt;
      if (f.t >= f.max) {
        this.fx.splice(i, 1);
        continue;
      }
      const k = f.t / f.max; // 0..1
      ctx.globalCompositeOperation = 'lighter';
      switch (f.kind) {
        case 'explosion': {
          const r = f.r * (0.35 + 0.65 * k);
          const tex = this.glowCache.get(f.color, r);
          ctx.globalAlpha = (1 - k) * 0.75;
          ctx.drawImage(tex, f.x - r, f.y - r, r * 2, r * 2);
          ctx.globalAlpha = 1 - k;
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2.5 * (1 - k) + 0.5;
          ctx.beginPath();
          ctx.arc(f.x, f.y, r, 0, Math.PI * 2);
          ctx.stroke();
          break;
        }
        case 'ring': case 'levelUp': {
          const r = f.r * (0.2 + 0.8 * k);
          ctx.globalAlpha = 1 - k;
          ctx.strokeStyle = f.color;
          ctx.lineWidth = f.kind === 'levelUp' ? 3 : 2;
          ctx.beginPath();
          ctx.arc(f.x, f.y, r, 0, Math.PI * 2);
          ctx.stroke();
          if (f.kind === 'levelUp') {
            ctx.beginPath();
            ctx.arc(f.x, f.y, r * 0.7, 0, Math.PI * 2);
            ctx.stroke();
          }
          break;
        }
        case 'enemySpawn': {
          const r = f.r * (2.4 - 1.4 * k);
          ctx.globalAlpha = k * 0.8;
          ctx.strokeStyle = f.color;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(f.x, f.y, r, 0, Math.PI * 2);
          ctx.stroke();
          break;
        }
        case 'telegraph': {
          ctx.globalAlpha = 0.5 + 0.5 * Math.sin(this.time * 20);
          ctx.strokeStyle = f.color;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
          ctx.stroke();
          break;
        }
        case 'beam': {
          const w = f.r;
          ctx.globalAlpha = (1 - k) * 0.35;
          ctx.strokeStyle = f.color;
          ctx.lineWidth = w * 2.2;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(f.x, f.y);
          ctx.lineTo(f.x2, f.y2);
          ctx.stroke();
          ctx.globalAlpha = (1 - k);
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = Math.max(1.5, w * 0.7 * (1 - k * 0.5));
          ctx.beginPath();
          ctx.moveTo(f.x, f.y);
          ctx.lineTo(f.x2, f.y2);
          ctx.stroke();
          break;
        }
        case 'chain': {
          const pts = f.points ?? [];
          if (pts.length >= 4) {
            ctx.globalAlpha = (1 - k);
            ctx.strokeStyle = f.color;
            ctx.lineWidth = 6;
            ctx.globalAlpha = (1 - k) * 0.3;
            this.jaggedPath(pts);
            ctx.stroke();
            ctx.globalAlpha = 1 - k;
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.8;
            this.jaggedPath(pts);
            ctx.stroke();
          }
          break;
        }
        case 'freeze': {
          ctx.globalAlpha = 1 - k;
          ctx.strokeStyle = '#bfe8ff';
          ctx.lineWidth = 1.5;
          for (let s = 0; s < 3; s++) {
            const a = f.t * 6 + (s * Math.PI * 2) / 3;
            ctx.beginPath();
            ctx.arc(f.x, f.y, f.r + 3 + s * 2, a, a + 1.2);
            ctx.stroke();
          }
          break;
        }
        case 'shieldHit': {
          this.drawGlowAt(f.x, f.y, f.r * (1 + k), f.color, (1 - k) * 0.8);
          break;
        }
        case 'core': {
          this.drawGlowAt(f.x, f.y, f.r * (1 + k * 2), '#ffc45b', (1 - k) * 0.9);
          break;
        }
        default:
          break;
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  private jaggedPath(pts: number[]): void {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(pts[0]!, pts[1]!);
    for (let i = 2; i < pts.length - 2; i += 2) {
      const mx = (pts[i]! + pts[i + 2]!) / 2 + (Math.random() - 0.5) * 18;
      const my = (pts[i + 1]! + pts[i + 3]!) / 2 + (Math.random() - 0.5) * 18;
      ctx.lineTo(mx, my);
      ctx.lineTo(pts[i + 2]!, pts[i + 3]!);
    }
  }

  private enqueueFx(ev: FxEvent, state: RunState): void {
    switch (ev.kind) {
      case 'explosion':
        this.fx.push({ kind: 'explosion', x: ev.x, y: ev.y, x2: 0, y2: 0, r: ev.r ?? 60, color: ev.color, t: 0, max: 0.45 });
        this.particles.burst(ev.x, ev.y, ev.color, 14, 260, { size: 2.5, life: 0.5 });
        this.particles.burst(ev.x, ev.y, '#ffffff', 6, 180, { size: 1.6, life: 0.3 });
        break;
      case 'beam':
        this.fx.push({ kind: 'beam', x: ev.x, y: ev.y, x2: ev.x2 ?? 0, y2: ev.y2 ?? 0, r: ev.r ?? 8, color: ev.color, t: 0, max: 0.16 });
        break;
      case 'chain':
        this.fx.push({ kind: 'chain', x: 0, y: 0, x2: 0, y2: 0, r: 0, color: ev.color, t: 0, max: 0.18, points: ev.points });
        break;
      case 'ring':
        this.fx.push({ kind: 'ring', x: ev.x, y: ev.y, x2: 0, y2: 0, r: ev.r ?? 100, color: ev.color, t: 0, max: 0.5 });
        break;
      case 'telegraph':
        this.fx.push({ kind: 'telegraph', x: ev.x, y: ev.y, x2: 0, y2: 0, r: ev.r ?? 40, color: ev.color, t: 0, max: 0.8 });
        break;
      case 'levelUp':
        this.fx.push({ kind: 'levelUp', x: ev.x, y: ev.y, x2: 0, y2: 0, r: ev.r ?? 80, color: ev.color, t: 0, max: 0.55 });
        this.particles.burst(ev.x, ev.y, ev.color, 18, 200, { size: 2, life: 0.7, kind: 'glow' });
        break;
      case 'enemySpawn':
        this.fx.push({ kind: 'enemySpawn', x: ev.x, y: ev.y, x2: 0, y2: 0, r: ev.r ?? 20, color: ev.color, t: 0, max: 0.35 });
        if ((ev.r ?? 0) >= 28) this.camera.kick(0.5); // 精英/Boss 出场震屏
        break;
      case 'enemyDie':
        this.particles.burst(ev.x, ev.y, ev.color, 7 + Math.round((ev.r ?? 10) / 3), 190, { size: 2.4, life: 0.5, kind: 'shard' });
        this.particles.burst(ev.x, ev.y, '#ffffff', 3, 120, { size: 1.4, life: 0.25 });
        break;
      case 'freeze':
        this.fx.push({ kind: 'freeze', x: ev.x, y: ev.y, x2: 0, y2: 0, r: ev.r ?? 12, color: ev.color, t: 0, max: 0.3 });
        break;
      case 'shieldHit':
        this.fx.push({ kind: 'shieldHit', x: ev.x, y: ev.y, x2: 0, y2: 0, r: ev.r ?? 6, color: ev.color, t: 0, max: 0.14 });
        break;
      case 'core':
        this.fx.push({ kind: 'core', x: ev.x, y: ev.y, x2: 0, y2: 0, r: ev.r ?? 14, color: ev.color, t: 0, max: 0.5 });
        break;
      default:
        break;
    }
    void state;
  }

  private drawFxScreen(_state: RunState, _frameDt: number): void {
    // 预留：屏幕空间特效
  }

  // ---------------- 伤害数字 ----------------

  pushDamage(x: number, y: number, amount: number, crit: boolean, toPlayer: boolean): void {
    // 就近合并（70px 内同类数字叠加总量），避免数字海淹没画面
    for (const d of this.dmg) {
      if (d.alive && d.toPlayer === toPlayer && d.life > d.max * 0.45) {
        const dx = d.x - x;
        const dy = d.y - y;
        if (dx * dx + dy * dy < 70 * 70) {
          d.amount += amount;
          d.text = String(d.amount);
          d.life = Math.max(d.life, (crit ? 0.7 : 0.5));
          d.max = Math.max(d.max, d.life);
          d.color = toPlayer ? '#ff7a7a' : crit || d.crit ? '#ffd75b' : '#eef7ff';
          d.crit = d.crit || crit;
          d.size = toPlayer ? 15 : d.crit ? 20 : 15;
          return;
        }
      }
    }
    let slot: DmgNum | null = null;
    for (const d of this.dmg) {
      if (!d.alive) {
        slot = d;
        break;
      }
    }
    if (!slot) slot = this.dmg[0]!;
    slot.alive = true;
    slot.x = x;
    slot.y = y;
    slot.vy = -52;
    slot.amount = amount;
    slot.crit = crit;
    slot.toPlayer = toPlayer;
    slot.life = crit ? 0.7 : 0.5;
    slot.max = slot.life;
    slot.text = String(amount);
    slot.color = toPlayer ? '#ff7a7a' : crit ? '#ffd75b' : '#eef7ff';
    slot.size = toPlayer ? 15 : crit ? 20 : 15;
  }

  private drawDamageNumbers(frameDt: number): void {
    const ctx = this.ctx;
    const ox = this.camera.ox;
    const oy = this.camera.oy;
    ctx.save();
    ctx.textAlign = 'center';
    for (const d of this.dmg) {
      if (!d.alive) continue;
      d.life -= frameDt;
      if (d.life <= 0) {
        d.alive = false;
        continue;
      }
      d.y += d.vy * frameDt;
      d.vy *= Math.pow(0.92, frameDt * 60);
      const k = d.life / d.max;
      ctx.globalAlpha = Math.min(1, k * 2.2);
      ctx.font = `800 ${d.size}px ui-monospace, Consolas, monospace`;
      ctx.fillStyle = 'rgba(4,8,14,0.9)';
      const tx = d.x - ox;
      const ty = d.y - oy;
      ctx.fillText(d.text, tx + 1.2, ty);
      ctx.fillText(d.text, tx - 1.2, ty);
      ctx.fillText(d.text, tx, ty + 1.2);
      ctx.fillText(d.text, tx, ty - 1.2);
      ctx.fillStyle = d.color;
      ctx.fillText(d.text, tx, ty);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // ---------------- 暗角 ----------------

  private drawVignette(lowHp: boolean): void {
    const ctx = this.ctx;
    if (!this.vignette) {
      const c = document.createElement('canvas');
      c.width = Math.max(2, Math.round(this.w / 2));
      c.height = Math.max(2, Math.round(this.h / 2));
      const vctx = c.getContext('2d')!;
      const g = vctx.createRadialGradient(c.width / 2, c.height / 2, Math.min(c.width, c.height) * 0.42, c.width / 2, c.height / 2, Math.max(c.width, c.height) * 0.72);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(2,4,10,0.55)');
      vctx.fillStyle = g;
      vctx.fillRect(0, 0, c.width, c.height);
      this.vignette = c;
    }
    ctx.drawImage(this.vignette, 0, 0, this.w, this.h);

    if (lowHp) {
      const a = 0.12 + 0.1 * Math.sin(this.time * 6);
      const g = ctx.createRadialGradient(this.w / 2, this.h / 2, Math.min(this.w, this.h) * 0.3, this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.7);
      g.addColorStop(0, 'rgba(255,40,40,0)');
      g.addColorStop(1, `rgba(255,30,30,${a.toFixed(3)})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, this.w, this.h);
    }
  }

  /** 让外部画 HUD 时直接用同一 ctx（HUD 在 renderer 之后绘制）。 */
  get context(): CanvasRenderingContext2D {
    return this.ctx;
  }
}
