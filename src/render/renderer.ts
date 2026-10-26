import type { RunState, FxEvent } from '@/game/types';
import { ENEMY_DEFS } from '@/data/enemies.data';
import type { Atlas } from './atlas';
import { buildGlowBlob } from './atlas';
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
}

interface Star { x: number; y: number; s: number; a: number; layer: number }

export interface RenderOpts {
  showDamageNumbers: boolean;
  shakeMul: number;
}

const DMG_CAP = 160;

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private glow: HTMLCanvasElement;
  private vignette: HTMLCanvasElement | null = null;
  private stars: Star[] = [];
  private fx: TransientFx[] = [];
  private dmg: DmgNum[] = [];
  private w = 0;
  private h = 0;
  private dpr = 1;
  private time = 0;

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
      this.dmg.push({ alive: false, x: 0, y: 0, vy: 0, life: 0, max: 1, text: '', color: '#fff', size: 13 });
    }
    for (let i = 0; i < 220; i++) {
      this.stars.push({
        x: Math.random(), y: Math.random(),
        s: 0.6 + Math.random() * 1.6,
        a: 0.25 + Math.random() * 0.6,
        layer: Math.floor(Math.random() * 3),
      });
    }
    this.resize();
  }

  resize(): void {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = this.canvas.clientWidth || window.innerWidth;
    this.h = this.canvas.clientHeight || window.innerHeight;
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.vignette = null;
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

    this.particles.drawWorld(ctx, ox, oy);
    this.drawFxScreen(state, frameDt);
    if (this.opts.showDamageNumbers) this.drawDamageNumbers(frameDt);
    this.drawVignette(lowHp);
  }

  // ---------------- 背景 ----------------

  private drawBackground(): void {
    const ctx = this.ctx;
    const ox = this.camera.ox;
    const oy = this.camera.oy;

    // 星尘三层视差
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

    // 深空云气（大径向渐变，极低透明度）
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
      const hue = i % 2 === 0 ? 'rgba(40,80,140,0.10)' : 'rgba(90,40,120,0.08)';
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
      g.addColorStop(0, hue);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(sx - r, sy - r, r * 2, r * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
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

  private drawGlowAt(x: number, y: number, r: number, color: string, alpha: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = alpha;
    // 着色辉光：先画 glow，再叠 color 调色（用 filter 太慢，直接双层）
    ctx.drawImage(this.glow, x - r, y - r, r * 2, r * 2);
    ctx.globalAlpha = alpha * 0.85;
    ctx.globalCompositeOperation = 'source-over';
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = alpha * 0.5;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
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
        this.drawGlowAt(e.x, e.y, e.r * 1.5, 'rgba(120,200,255,0.5)', 0.35 * spawnA);
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
      this.drawGlowAt(b.x, b.y, b.r * 2.4, 'rgba(255,91,91,0.8)', 0.5);
      this.drawSprite('ebullet', b.x, b.y, b.r, 0);
    });
  }

  private drawGems(state: RunState): void {
    state.gems.forEach((g) => {
      const pulse = 1 + Math.sin(this.time * 5 + g.id) * 0.12;
      this.drawGlowAt(g.x, g.y, g.value >= 10 ? 18 : 11, 'rgba(143,232,107,0.7)', g.value >= 10 ? 0.6 : 0.4);
      this.drawSprite('gem', g.x, g.y, (g.value >= 10 ? 10 : 7) * pulse, this.time * 1.5 + g.id);
    });
  }

  private drawPickups(state: RunState): void {
    state.pickups.forEach((pk) => {
      const bob = Math.sin(this.time * 3 + pk.id) * 3;
      const color = pk.kind === 'heal' ? 'rgba(143,232,107,0.8)' : pk.kind === 'bomb' ? 'rgba(255,215,91,0.8)' : 'rgba(255,196,91,0.9)';
      this.drawGlowAt(pk.x, pk.y + bob, 26, color, 0.55);
      this.drawSprite(`pick_${pk.kind}`, pk.x, pk.y + bob, 13, this.time * 0.8);
    });
  }

  private drawAttendants(state: RunState): void {
    state.attendants.forEach((a) => {
      if (a.kind === 'orbit') {
        const key = a.ownerWeapon === 'orbit_corona' ? 'pr_orbit_corona' : 'pr_orbit';
        this.drawGlowAt(a.x, a.y, a.r * 2.4, 'rgba(140,230,255,0.7)', 0.4);
        this.drawSprite(key, a.x, a.y, a.r, a.angle * 3);
      } else if (a.kind === 'drone') {
        this.drawGlowAt(a.x, a.y, a.r * 2, 'rgba(120,255,190,0.5)', 0.3);
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
    // 引擎尾焰粒子由 App 层每步生成；这里画光晕
    this.drawGlowAt(p.x, p.y, 34, 'rgba(91,231,255,0.7)', 0.4);
    this.drawSprite('player', p.x, p.y, 15, p.facing + Math.PI / 2, blink);
    if (p.dashT > 0) {
      this.drawGlowAt(p.x, p.y, 60, 'rgba(160,240,255,0.9)', 0.5);
    }
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
          ctx.globalAlpha = (1 - k) * 0.9;
          const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
          g.addColorStop(0, f.color);
          g.addColorStop(0.7, f.color);
          g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = g;
          ctx.globalAlpha = (1 - k) * 0.55;
          ctx.beginPath();
          ctx.arc(f.x, f.y, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = (1 - k);
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
    slot.vy = -46;
    slot.life = crit ? 0.85 : 0.6;
    slot.max = slot.life;
    slot.text = String(amount);
    slot.color = toPlayer ? '#ff7a7a' : crit ? '#ffd75b' : '#e8f4ff';
    slot.size = toPlayer ? 14 : crit ? 19 : 13;
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
      ctx.globalAlpha = Math.min(1, k * 2);
      ctx.font = `700 ${d.size}px ui-monospace, Consolas, monospace`;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillText(d.text, d.x - ox + 1, d.y - oy + 1);
      ctx.fillStyle = d.color;
      ctx.fillText(d.text, d.x - ox, d.y - oy);
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
