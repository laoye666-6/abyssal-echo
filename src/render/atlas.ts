/**
 * 程序化精灵图集：启动时在离屏 canvas 上绘制所有精灵（含辉光与白色受击版）。
 * 零外部资源；改视觉只改这里。
 */

export type SpriteKey =
  | 'player' | 'gem' | 'pick_heal' | 'pick_bomb' | 'pick_core'
  | 'pr_pulse' | 'pr_pulse_supernova' | 'pr_nova' | 'pr_nova_collapse'
  | 'pr_shard' | 'pr_shard_mirror' | 'pr_drone' | 'pr_orbit' | 'pr_orbit_corona'
  | 'pr_mine' | 'pr_mine_bloom'
  | 'ebullet'
  | `enemy_${string}`;

export interface Sprite {
  /** 逻辑尺寸（半径），绘制时以中心对齐 */
  r: number;
  canvas: HTMLCanvasElement;
  /** 白色剪影版（受击闪白） */
  white: HTMLCanvasElement;
}

const PAD = 12; // 辉光留白

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

type Painter = (ctx: CanvasRenderingContext2D, r: number) => void;

/** 通用构建：画形 + 辉光 + 白版 */
function buildSprite(size: number, paint: Painter): Sprite {
  const dim = (size + PAD * 2) * 2;
  const c = makeCanvas(dim, dim);
  const ctx = c.getContext('2d')!;
  ctx.translate(dim / 2, dim / 2);
  ctx.scale(2, 2);
  ctx.shadowColor = 'rgba(120,220,255,0.9)';
  ctx.shadowBlur = size * 0.45;
  paint(ctx, size);
  // 白色剪影
  const wc = makeCanvas(dim, dim);
  const wctx = wc.getContext('2d')!;
  wctx.drawImage(c, 0, 0);
  wctx.globalCompositeOperation = 'source-in';
  wctx.fillStyle = '#ffffff';
  wctx.fillRect(0, 0, dim, dim);
  return { r: size, canvas: c, white: wc };
}

function poly(ctx: CanvasRenderingContext2D, pts: [number, number][], fill: string, stroke?: string, lw = 1.5): void {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.stroke();
  }
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string, stroke?: string, lw = 1.5): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.stroke();
  }
}

// ---------------- 玩家 ----------------

function paintPlayer(ctx: CanvasRenderingContext2D, r: number): void {
  ctx.shadowColor = 'rgba(91,231,255,1)';
  // 主体：锋利三角舰
  poly(ctx, [
    [0, -r * 1.15],
    [r * 0.78, r * 0.75],
    [0, r * 0.42],
    [-r * 0.78, r * 0.75],
  ], 'rgba(20,40,60,0.95)', '#5be7ff', 2);
  // 核心亮斑
  ctx.shadowBlur = 0;
  circle(ctx, 0, -r * 0.1, r * 0.26, '#bff4ff');
  // 引擎口
  poly(ctx, [
    [-r * 0.28, r * 0.75],
    [r * 0.28, r * 0.75],
    [0, r * 1.1],
  ], 'rgba(91,231,255,0.55)');
}

function paintGem(ctx: CanvasRenderingContext2D, r: number): void {
  ctx.shadowColor = 'rgba(143,232,107,1)';
  poly(ctx, [
    [0, -r],
    [r * 0.7, 0],
    [0, r],
    [-r * 0.7, 0],
  ], '#8fe86b', '#d8ffc8', 1.2);
  ctx.shadowBlur = 0;
  circle(ctx, 0, 0, r * 0.3, '#eaffde');
}

function paintHeal(ctx: CanvasRenderingContext2D, r: number): void {
  ctx.shadowColor = 'rgba(143,232,107,1)';
  circle(ctx, 0, 0, r, 'rgba(143,232,107,0.25)', '#8fe86b', 2);
  ctx.fillStyle = '#c9ffb4';
  ctx.fillRect(-r * 0.55, -r * 0.18, r * 1.1, r * 0.36);
  ctx.fillRect(-r * 0.18, -r * 0.55, r * 0.36, r * 1.1);
}

function paintBomb(ctx: CanvasRenderingContext2D, r: number): void {
  ctx.shadowColor = 'rgba(255,215,91,1)';
  circle(ctx, 0, 0, r, 'rgba(255,215,91,0.25)', '#ffd75b', 2);
  circle(ctx, 0, 0, r * 0.42, '#ffe9a0');
  ctx.strokeStyle = '#ffd75b';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.75, -0.5, 1.8);
  ctx.stroke();
}

function paintCore(ctx: CanvasRenderingContext2D, r: number): void {
  ctx.shadowColor = 'rgba(255,196,91,1)';
  poly(ctx, [
    [0, -r * 1.1],
    [r, 0],
    [0, r * 1.1],
    [-r, 0],
  ], 'rgba(255,196,91,0.4)', '#ffc45b', 2);
  ctx.shadowBlur = 0;
  poly(ctx, [
    [0, -r * 0.5],
    [r * 0.42, 0],
    [0, r * 0.5],
    [-r * 0.42, 0],
  ], '#ffe9b8');
}

// ---------------- 投射物 ----------------

function paintPulse(ctx: CanvasRenderingContext2D, r: number): void {
  ctx.shadowColor = 'rgba(91,231,255,1)';
  circle(ctx, 0, 0, r * 0.8, '#5be7ff');
  ctx.shadowBlur = 0;
  circle(ctx, 0, 0, r * 0.4, '#e8fbff');
}

function paintPulseSuper(ctx: CanvasRenderingContext2D, r: number): void {
  ctx.shadowColor = 'rgba(255,228,91,1)';
  circle(ctx, 0, 0, r * 0.85, '#ffe45b');
  ctx.shadowBlur = 0;
  circle(ctx, 0, 0, r * 0.45, '#fffbe8');
  ctx.strokeStyle = 'rgba(255,228,91,0.7)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.25, 0, Math.PI * 2);
  ctx.stroke();
}

function paintNova(ctx: CanvasRenderingContext2D, r: number): void {
  ctx.shadowColor = 'rgba(255,180,91,1)';
  poly(ctx, [
    [r, 0], [0, r * 0.5], [-r, 0], [0, -r * 0.5],
  ], '#ffb45b', '#ffe3c0', 1);
}

function paintNovaCollapse(ctx: CanvasRenderingContext2D, r: number): void {
  ctx.shadowColor = 'rgba(255,139,91,1)';
  poly(ctx, [
    [r * 1.2, 0], [0, r * 0.6], [-r * 1.2, 0], [0, -r * 0.6],
  ], '#ff8b5b', '#ffd0b8', 1.2);
}

function paintShard(ctx: CanvasRenderingContext2D, r: number): void {
  ctx.shadowColor = 'rgba(180,224,255,1)';
  poly(ctx, [
    [0, -r], [r * 0.5, -r * 0.2], [r * 0.3, r], [-r * 0.3, r * 0.8], [-r * 0.5, -r * 0.2],
  ], '#b4e0ff', '#eaf7ff', 1);
}

function paintShardMirror(ctx: CanvasRenderingContext2D, r: number): void {
  ctx.shadowColor = 'rgba(224,200,255,1)';
  poly(ctx, [
    [0, -r], [r * 0.5, -r * 0.2], [r * 0.3, r], [-r * 0.3, r * 0.8], [-r * 0.5, -r * 0.2],
  ], '#e0c8ff', '#f8f0ff', 1.2);
}

function paintDrone(ctx: CanvasRenderingContext2D, r: number): void {
  ctx.shadowColor = 'rgba(120,255,190,1)';
  poly(ctx, [
    [0, -r], [r * 0.7, r * 0.6], [0, r * 0.25], [-r * 0.7, r * 0.6],
  ], '#78ffbe', '#e0fff0', 1);
}

function paintOrbitBlade(ctx: CanvasRenderingContext2D, r: number): void {
  ctx.shadowColor = 'rgba(160,240,255,1)';
  poly(ctx, [
    [0, -r * 1.3], [r * 0.45, 0], [0, r * 1.3], [-r * 0.45, 0],
  ], 'rgba(160,240,255,0.95)', '#eaffff', 1);
}

function paintOrbitCorona(ctx: CanvasRenderingContext2D, r: number): void {
  ctx.shadowColor = 'rgba(255,240,160,1)';
  poly(ctx, [
    [0, -r * 1.3], [r * 0.5, 0], [0, r * 1.3], [-r * 0.5, 0],
  ], 'rgba(255,224,130,0.95)', '#fff6d8', 1.2);
}

function paintArcIcon(ctx: CanvasRenderingContext2D, r: number): void {
  ctx.shadowColor = 'rgba(155,208,255,1)';
  ctx.strokeStyle = '#9bd0ff';
  ctx.lineWidth = 2.6;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(-r * 0.7, -r * 0.9);
  ctx.lineTo(r * 0.15, -r * 0.25);
  ctx.lineTo(-r * 0.2, -r * 0.1);
  ctx.lineTo(r * 0.7, r * 0.9);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.1;
  ctx.stroke();
}

function paintLanceIcon(ctx: CanvasRenderingContext2D, r: number): void {
  ctx.shadowColor = 'rgba(139,255,240,1)';
  poly(ctx, [
    [-r * 0.9, -r * 0.28], [r * 0.7, -r * 0.14], [r * 1.1, 0], [r * 0.7, r * 0.14], [-r * 0.9, r * 0.28],
  ], 'rgba(20,70,70,0.9)', '#8bfff0', 1.8);
  ctx.shadowBlur = 0;
  poly(ctx, [
    [-r * 0.7, -r * 0.1], [r * 0.4, -r * 0.05], [r * 0.4, r * 0.05], [-r * 0.7, r * 0.1],
  ], '#d8fffb');
}

function paintFrostIcon(ctx: CanvasRenderingContext2D, r: number): void {
  ctx.shadowColor = 'rgba(191,232,255,1)';
  ctx.strokeStyle = '#bfe8ff';
  ctx.lineWidth = 2.2;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.95);
    ctx.stroke();
    const bx = Math.cos(a) * r * 0.62;
    const by = Math.sin(a) * r * 0.62;
    ctx.beginPath();
    ctx.moveTo(bx + Math.cos(a + 1.2) * r * 0.22, by + Math.sin(a + 1.2) * r * 0.22);
    ctx.lineTo(bx, by);
    ctx.lineTo(bx + Math.cos(a - 1.2) * r * 0.22, by + Math.sin(a - 1.2) * r * 0.22);
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
  circle(ctx, 0, 0, r * 0.16, '#eafaff');
}

function paintEBullet(ctx: CanvasRenderingContext2D, r: number): void {
  ctx.shadowColor = 'rgba(255,91,91,1)';
  circle(ctx, 0, 0, r * 0.75, '#ff5b5b');
  ctx.shadowBlur = 0;
  circle(ctx, 0, 0, r * 0.35, '#ffd8d8');
}

// ---------------- 敌人 ----------------

function paintMote(ctx: CanvasRenderingContext2D, r: number): void {
  ctx.shadowColor = 'rgba(143,232,107,0.9)';
  circle(ctx, 0, 0, r, 'rgba(38,66,32,0.95)', '#8fe86b', 2);
  ctx.shadowBlur = 0;
  circle(ctx, -r * 0.12, -r * 0.12, r * 0.52, 'rgba(143,232,107,1)');
  circle(ctx, -r * 0.3, -r * 0.3, r * 0.18, 'rgba(230,255,220,0.95)');
}

function paintDart(ctx: CanvasRenderingContext2D, r: number): void {
  ctx.shadowColor = 'rgba(91,200,255,0.9)';
  poly(ctx, [
    [r * 1.3, 0], [-r * 0.6, r * 0.65], [-r * 0.2, 0], [-r * 0.6, -r * 0.65],
  ], 'rgba(30,60,90,0.95)', '#5bc8ff', 1.5);
}

function paintStinger(ctx: CanvasRenderingContext2D, r: number): void {
  ctx.shadowColor = 'rgba(255,215,91,0.9)';
  poly(ctx, [
    [r * 1.2, 0], [0, r * 0.75], [-r, 0], [0, -r * 0.75],
  ], 'rgba(90,70,20,0.95)', '#ffd75b', 1.5);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255,215,91,0.6)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(-r * 0.5, -r * 0.35);
  ctx.lineTo(r * 0.3, r * 0.35);
  ctx.stroke();
}

function paintShardling(ctx: CanvasRenderingContext2D, r: number): void {
  ctx.shadowColor = 'rgba(255,158,91,0.9)';
  poly(ctx, [
    [0, -r * 1.1], [r * 0.9, -r * 0.2], [r * 0.55, r], [-r * 0.55, r * 0.9], [-r * 0.9, -r * 0.2],
  ], 'rgba(80,45,25,0.95)', '#ff9e5b', 1.5);
}

function paintWarden(ctx: CanvasRenderingContext2D, r: number): void {
  ctx.shadowColor = 'rgba(198,91,255,0.9)';
  circle(ctx, 0, 0, r, 'rgba(50,25,75,0.95)', '#c65bff', 1.8);
  ctx.shadowBlur = 0;
  circle(ctx, 0, 0, r * 0.55, 'rgba(198,91,255,0.35)', '#e0b0ff', 1);
  circle(ctx, 0, 0, r * 0.22, '#f4e0ff');
}

function paintSplitter(ctx: CanvasRenderingContext2D, r: number): void {
  ctx.shadowColor = 'rgba(91,255,168,0.9)';
  circle(ctx, 0, 0, r, 'rgba(25,70,50,0.95)', '#5bffa8', 1.8);
  ctx.shadowBlur = 0;
  circle(ctx, -r * 0.3, -r * 0.25, r * 0.28, 'rgba(91,255,168,0.5)');
  circle(ctx, r * 0.35, r * 0.1, r * 0.2, 'rgba(91,255,168,0.4)');
  circle(ctx, r * 0.05, -r * 0.5, r * 0.15, 'rgba(91,255,168,0.35)');
}

function paintBulwark(ctx: CanvasRenderingContext2D, r: number): void {
  ctx.shadowColor = 'rgba(255,91,122,0.9)';
  const hex: [number, number][] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    hex.push([Math.cos(a) * r * 1.05, Math.sin(a) * r * 1.05]);
  }
  poly(ctx, hex, 'rgba(70,25,38,0.95)', '#ff5b7a', 2);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255,91,122,0.5)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-r * 0.6, -r * 0.35);
  ctx.lineTo(r * 0.6, -r * 0.35);
  ctx.moveTo(-r * 0.7, 0.2 * r);
  ctx.lineTo(r * 0.7, 0.2 * r);
  ctx.stroke();
}

function paintPhase(ctx: CanvasRenderingContext2D, r: number): void {
  ctx.shadowColor = 'rgba(180,91,255,0.9)';
  ctx.globalAlpha = 0.85;
  poly(ctx, [
    [r * 0.2, -r * 1.1], [r, r * 0.6], [-r * 0.9, r * 0.8], [-r * 0.2, -r * 0.5],
  ], 'rgba(45,25,70,0.9)', '#b45bff', 1.5);
  ctx.globalAlpha = 1;
}

function paintEliteBase(ctx: CanvasRenderingContext2D, r: number): void {
  // 精英通用：更大的核 + 棘刺（外圈由渲染层画金色环）
  circle(ctx, 0, 0, r * 0.62, 'rgba(255,228,91,0.28)', '#ffe45b', 2);
  ctx.shadowBlur = 0;
  circle(ctx, 0, 0, r * 0.3, '#fff3c0');
}

function paintBossDevourer(ctx: CanvasRenderingContext2D, r: number): void {
  ctx.shadowColor = 'rgba(255,91,91,1)';
  // 主体
  circle(ctx, 0, 0, r, 'rgba(60,15,20,0.97)', '#ff5b5b', 2.5);
  // 棘刺
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const x1 = Math.cos(a) * r * 0.95;
    const y1 = Math.sin(a) * r * 0.95;
    const x2 = Math.cos(a) * r * 1.45;
    const y2 = Math.sin(a) * r * 1.45;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = '#ff5b5b';
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }
  // 巨口
  ctx.shadowBlur = 0;
  circle(ctx, 0, 0, r * 0.45, 'rgba(20,5,8,1)', '#ff8b8b', 1.5);
  circle(ctx, 0, 0, r * 0.2, '#ffbdbd');
}

function paintBossEye(ctx: CanvasRenderingContext2D, r: number): void {
  ctx.shadowColor = 'rgba(255,75,216,1)';
  circle(ctx, 0, 0, r, 'rgba(55,12,48,0.97)', '#ff4bd8', 2.5);
  // 虹膜
  ctx.shadowBlur = 0;
  circle(ctx, 0, 0, r * 0.55, 'rgba(255,75,216,0.25)', '#ff9be4', 1.5);
  circle(ctx, 0, 0, r * 0.3, '#ffd6f4');
  ctx.ellipse(0, 0, r * 0.28, r * 0.55, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(40,5,35,0.95)';
  ctx.fill();
  // 触须
  ctx.strokeStyle = 'rgba(255,75,216,0.6)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.4;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.95);
    ctx.quadraticCurveTo(
      Math.cos(a + 0.4) * r * 1.35, Math.sin(a + 0.4) * r * 1.35,
      Math.cos(a + 0.15) * r * 1.6, Math.sin(a + 0.15) * r * 1.6,
    );
    ctx.stroke();
  }
}

// ---------------- v1.1 新增 ----------------

/** 星棘雷：八向棘刺壳体 + 芯点 */
function paintMine(ctx: CanvasRenderingContext2D, r: number): void {
  ctx.shadowColor = 'rgba(168,244,255,1)';
  poly(
    ctx,
    [[0, -r * 1.2], [r * 0.5, -r * 0.3], [r * 1.1, 0], [r * 0.5, r * 0.3], [0, r * 1.2], [-r * 0.5, r * 0.3], [-r * 1.1, 0], [-r * 0.5, -r * 0.3]],
    'rgba(20,40,52,0.95)', '#a8f4ff', 1.5,
  );
  circle(ctx, 0, 0, r * 0.42, '#a8f4ff');
}

/** 星棘花海：绿色变体 + 高亮芯 */
function paintMineBloom(ctx: CanvasRenderingContext2D, r: number): void {
  ctx.shadowColor = 'rgba(122,255,208,1)';
  poly(
    ctx,
    [[0, -r * 1.25], [r * 0.55, -r * 0.35], [r * 1.15, 0], [r * 0.55, r * 0.35], [0, r * 1.25], [-r * 0.55, r * 0.35], [-r * 1.15, 0], [-r * 0.55, -r * 0.35]],
    'rgba(16,48,38,0.95)', '#7affd0', 1.5,
  );
  circle(ctx, 0, 0, r * 0.45, '#7affd0');
  circle(ctx, 0, 0, r * 0.2, '#eafff6');
}

/** 回响体：镜面人形双弧 */
function paintEliteEcho(ctx: CanvasRenderingContext2D, r: number): void {
  ctx.shadowColor = 'rgba(168,244,255,1)';
  circle(ctx, 0, 0, r, 'rgba(24,42,58,0.95)', '#a8f4ff', 2);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#d8f8ff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(-r * 0.25, -r * 0.1, r * 0.35, Math.PI * 0.5, Math.PI * 1.5);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(r * 0.25, r * 0.1, r * 0.35, Math.PI * 1.5, Math.PI * 2.5);
  ctx.stroke();
  circle(ctx, 0, 0, r * 0.16, '#ffffff');
}

/** 图标：虚空收割（弧刃 + 柄） */
function paintScytheIcon(ctx: CanvasRenderingContext2D, r: number): void {
  ctx.shadowColor = 'rgba(200,180,255,1)';
  ctx.strokeStyle = '#c8b4ff';
  ctx.lineWidth = r * 0.24;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(0, r * 0.3, r * 0.78, Math.PI * 1.12, Math.PI * 1.88);
  ctx.stroke();
  ctx.strokeStyle = '#8f7ad8';
  ctx.lineWidth = r * 0.16;
  ctx.beginPath();
  ctx.moveTo(-r * 0.68, r * 0.85);
  ctx.lineTo(r * 0.18, -r * 0.5);
  ctx.stroke();
}

/** 图标：星棘雷 */
function paintMinesIcon(ctx: CanvasRenderingContext2D, r: number): void {
  ctx.shadowColor = 'rgba(122,255,208,1)';
  poly(
    ctx,
    [[0, -r], [r * 0.6, -r * 0.2], [r * 0.75, r * 0.5], [0, r * 0.9], [-r * 0.75, r * 0.5], [-r * 0.6, -r * 0.2]],
    'rgba(16,48,38,0.95)', '#7affd0', 1.5,
  );
  circle(ctx, 0, 0, r * 0.3, '#7affd0');
  ctx.strokeStyle = '#7affd0';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.55, 0.3, 1.4);
  ctx.stroke();
}

/** 精灵尺寸（半径）表 */
const SIZES: Record<string, number> = {
  player: 15,
  gem: 7,
  pick_heal: 12,
  pick_bomb: 12,
  pick_core: 11,
  pr_pulse: 6,
  pr_pulse_supernova: 8,
  pr_nova: 7,
  pr_nova_collapse: 8,
  pr_shard: 7,
  pr_shard_mirror: 7,
  pr_drone: 7,
  pr_orbit: 8,
  pr_orbit_corona: 9,
  pr_mine: 7,
  pr_mine_bloom: 8,
  icon_arc: 13,
  icon_lance: 13,
  icon_frost: 13,
  icon_scythe: 13,
  icon_mines: 13,
  ebullet: 7,
  enemy_mote: 10,
  enemy_dart: 11,
  enemy_stinger: 12,
  enemy_shardling: 14,
  enemy_warden: 13,
  enemy_splitter: 21,
  enemy_bulwark: 23,
  enemy_phase: 12,
  enemy_elite_haste: 20,
  enemy_elite_shield: 26,
  enemy_elite_mother: 25,
  enemy_elite_echo: 22,
  enemy_boss_devourer: 34,
  enemy_boss_eye: 40,
};

const PAINTERS: Record<string, Painter> = {
  player: paintPlayer,
  gem: paintGem,
  pick_heal: paintHeal,
  pick_bomb: paintBomb,
  pick_core: paintCore,
  pr_pulse: paintPulse,
  pr_pulse_supernova: paintPulseSuper,
  pr_nova: paintNova,
  pr_nova_collapse: paintNovaCollapse,
  pr_shard: paintShard,
  pr_shard_mirror: paintShardMirror,
  pr_drone: paintDrone,
  pr_orbit: paintOrbitBlade,
  pr_orbit_corona: paintOrbitCorona,
  pr_mine: paintMine,
  pr_mine_bloom: paintMineBloom,
  icon_arc: paintArcIcon,
  icon_lance: paintLanceIcon,
  icon_frost: paintFrostIcon,
  icon_scythe: paintScytheIcon,
  icon_mines: paintMinesIcon,
  ebullet: paintEBullet,
  enemy_mote: paintMote,
  enemy_dart: paintDart,
  enemy_stinger: paintStinger,
  enemy_shardling: paintShardling,
  enemy_warden: paintWarden,
  enemy_splitter: paintSplitter,
  enemy_bulwark: paintBulwark,
  enemy_phase: paintPhase,
  enemy_elite_haste: paintEliteBase,
  enemy_elite_shield: paintEliteBase,
  enemy_elite_mother: paintEliteBase,
  enemy_elite_echo: paintEliteEcho,
  enemy_boss_devourer: paintBossDevourer,
  enemy_boss_eye: paintBossEye,
};

export type Atlas = Map<string, Sprite>;

export function buildAtlas(): Atlas {
  const atlas: Atlas = new Map();
  for (const [key, paint] of Object.entries(PAINTERS)) {
    const size = SIZES[key] ?? 10;
    atlas.set(key, buildSprite(size, paint));
  }
  return atlas;
}

/** 柔光斑（粒子/光环通用）：白色径向渐变，绘制时用 tint 着色。 */
export function buildGlowBlob(): HTMLCanvasElement {
  const size = 64;
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return c;
}
