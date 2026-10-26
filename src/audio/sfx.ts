/**
 * ============================================================
 *  ABYSSAL ECHO — SFX 合成配方（纯 WebAudio，无外部资源）
 * ------------------------------------------------------------
 *  设计基调：太空、清脆、不刺耳。
 *   · 每条配方 = 一组短生命周期节点，尾部 source 的 onended
 *     统一 disconnect 全部节点，杜绝泄漏。
 *   · 全部经引擎的 sfx bus 播放；同类节流由 engine.play 负责。
 *   · 时间一律用 AudioContext.currentTime 调度（t0 = 触发时刻）。
 *   · v = 音量系数（0..1，1 表示重要/响亮事件），
 *     p = 音高系数（0.5..2.5，直接缩放配方基准频率）。
 * ============================================================
 */

import type { SfxName } from '@/game/types';

/** 播放环境：引擎注入的 AudioContext 与目标总线。 */
export interface SfxCtx {
  ctx: AudioContext;
  dest: AudioNode;
}

// ---------------- 通用小工具 ----------------

/** 白噪声缓冲（每个 AudioContext 缓存一份，1 秒循环）。 */
const noiseCache = new WeakMap<AudioContext, AudioBuffer>();

/** 在 t0 起播一段循环白噪声（随机起点，避免每次听感一致），t0+dur 停止。 */
export function noiseSource(ctx: AudioContext, t0: number, dur: number, rate = 1): AudioBufferSourceNode {
  let buf = noiseCache.get(ctx);
  if (!buf) {
    buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noiseCache.set(ctx, buf);
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  src.playbackRate.value = rate;
  src.start(t0, Math.random());
  src.stop(t0 + dur);
  return src;
}

/** 建一个已设置类型/频率的振荡器并排定 start/stop。 */
function tone(c: SfxCtx, type: OscillatorType, f0: number, t0: number, dur: number): OscillatorNode {
  const o = c.ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(Math.max(1, f0), t0);
  o.start(t0);
  o.stop(t0 + dur);
  return o;
}

/** 频率指数滑向 f1（需先有 setValueAtTime 起点）。 */
function glideTo(o: OscillatorNode, f1: number, t1: number): void {
  o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t1);
}

/** 指数增益包络：attack 内冲到 peak，dur 时归于静音。 */
function env(g: GainNode, t0: number, peak: number, attack: number, dur: number): void {
  const a = Math.max(0.001, attack);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(dur, a + 0.01));
}

/** 建一个 Biquad 滤波器。 */
function filter(c: SfxCtx, type: BiquadFilterType, freq: number, q = 0.8): BiquadFilterNode {
  const f = c.ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  return f;
}

/** 尾部 source 播完（含 stop 排期）后，统一断开全部相关节点。 */
function disposeOnEnd(tail: AudioScheduledSourceNode, nodes: AudioNode[]): void {
  tail.onended = () => {
    for (const n of nodes) n.disconnect();
  };
}

/** hurt 用的轻失真曲线（tanh 软削波，模块级共享一份）。 */
const HURT_CURVE = (() => {
  const n = 257;
  const curve = new Float32Array(n);
  const k = 2.6;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(k * x) / Math.tanh(k);
  }
  return curve;
})();

// ---------------- 各音效配方 ----------------

/** shoot：短促三角波 blip，快速下滑（每秒可能几十次，保持极轻极短）。 */
function shoot(c: SfxCtx, t0: number, v: number, p: number): void {
  const o = tone(c, 'triangle', 920 * p, t0, 0.12);
  glideTo(o, 340 * p, t0 + 0.09);
  const g = c.ctx.createGain();
  env(g, t0, 0.38 * v, 0.004, 0.1);
  o.connect(g).connect(c.dest);
  disposeOnEnd(o, [o, g]);
}

/** hit：短噪声 burst + 高通（清脆的"碎裂"感）。 */
function hit(c: SfxCtx, t0: number, v: number, p: number): void {
  const n = noiseSource(c.ctx, t0, 0.07, 0.8 + 0.4 * p);
  const hp = filter(c, 'highpass', 2200, 0.7);
  const g = c.ctx.createGain();
  env(g, t0, 0.3 * v, 0.002, 0.06);
  n.connect(hp).connect(g).connect(c.dest);
  disposeOnEnd(n, [n, hp, g]);
}

/** enemyDie：下滑正弦 + 低通扫频噪声尾（消散感）。 */
function enemyDie(c: SfxCtx, t0: number, v: number, p: number): void {
  const o = tone(c, 'sine', 620 * p, t0, 0.27);
  glideTo(o, 90 * p, t0 + 0.24);
  const g1 = c.ctx.createGain();
  env(g1, t0, 0.5 * v, 0.005, 0.25);
  o.connect(g1).connect(c.dest);
  const n = noiseSource(c.ctx, t0, 0.3, 0.9);
  const lp = filter(c, 'lowpass', 1600, 0.7);
  lp.frequency.exponentialRampToValueAtTime(150, t0 + 0.26);
  const g2 = c.ctx.createGain();
  env(g2, t0, 0.22 * v, 0.004, 0.28);
  n.connect(lp).connect(g2).connect(c.dest);
  disposeOnEnd(n, [o, g1, n, lp, g2]);
}

/** kill：B 小三和弦整体下滑（稍长的"湮灭"和弦感）。 */
function kill(c: SfxCtx, t0: number, v: number, p: number): void {
  const lp = filter(c, 'lowpass', 2200, 0.7);
  lp.frequency.exponentialRampToValueAtTime(260, t0 + 0.45);
  const g = c.ctx.createGain();
  env(g, t0, 0.22 * v, 0.012, 0.5);
  lp.connect(g).connect(c.dest);
  const nodes: AudioNode[] = [lp, g];
  let tail: OscillatorNode | null = null;
  const freqs = [493.88, 587.33, 739.99] as const; // B4 / D5 / F#5
  freqs.forEach((f, i) => {
    const o = tone(c, 'sawtooth', f * p * (1 + i * 0.002), t0 + i * 0.004, 0.52);
    glideTo(o, f * p * 0.32, t0 + 0.44);
    o.connect(lp);
    nodes.push(o);
    tail = o;
  });
  if (tail) disposeOnEnd(tail, nodes);
}

/** pickup：快速上行双音 chirp（F#5 → C#6，悦耳不吵）。 */
function pickup(c: SfxCtx, t0: number, v: number, p: number): void {
  const o1 = tone(c, 'triangle', 739.99 * p, t0, 0.075);
  const g1 = c.ctx.createGain();
  env(g1, t0, 0.4 * v, 0.004, 0.06);
  o1.connect(g1).connect(c.dest);
  const o2 = tone(c, 'triangle', 1108.73 * p, t0 + 0.055, 0.11);
  const g2 = c.ctx.createGain();
  env(g2, t0 + 0.055, 0.42 * v, 0.004, 0.09);
  o2.connect(g2).connect(c.dest);
  disposeOnEnd(o2, [o1, g1, o2, g2]);
}

/** levelup：明亮四音上行琶音（B4-D5-F#5-B5）。 */
function levelup(c: SfxCtx, t0: number, v: number, p: number): void {
  const notes = [493.88, 587.33, 739.99, 987.77] as const;
  let tail: OscillatorNode | null = null;
  const nodes: AudioNode[] = [];
  notes.forEach((f, i) => {
    const last = i === notes.length - 1;
    const start = t0 + i * 0.085;
    const o = tone(c, 'triangle', f * p, start, last ? 0.3 : 0.15);
    const g = c.ctx.createGain();
    env(g, start, (last ? 0.18 : 0.12) * v, 0.005, last ? 0.26 : 0.12);
    o.connect(g).connect(c.dest);
    nodes.push(o, g);
    tail = o;
  });
  if (tail) disposeOnEnd(tail, nodes);
}

/** evolve：宏大上行和弦（锯齿波渐亮）+ B6 shimmer + 高频空气声。 */
function evolve(c: SfxCtx, t0: number, v: number, p: number): void {
  const lp = filter(c, 'lowpass', 300, 0.9);
  lp.frequency.setValueAtTime(300, t0);
  lp.frequency.exponentialRampToValueAtTime(2600, t0 + 0.7);
  lp.frequency.exponentialRampToValueAtTime(500, t0 + 1.5);
  const g = c.ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.3 * v, t0 + 0.35);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.6);
  lp.connect(g).connect(c.dest);
  const nodes: AudioNode[] = [lp, g];
  const chord = [246.94, 293.66, 369.99, 493.88] as const; // B3 / D4 / F#4 / B4
  chord.forEach((f, i) => {
    const o = tone(c, 'sawtooth', f * p, t0 + i * 0.06, 1.65);
    o.connect(lp);
    nodes.push(o);
  });
  // shimmer：带轻微颤音的高频正弦
  const sh = tone(c, 'sine', 1975.5 * p, t0 + 0.2, 1.9);
  const lfo = tone(c, 'sine', 5.5, t0 + 0.2, 1.9);
  const lfoAmt = c.ctx.createGain();
  lfoAmt.gain.value = 14;
  lfo.connect(lfoAmt).connect(sh.frequency);
  const sg = c.ctx.createGain();
  env(sg, t0 + 0.2, 0.035 * v, 0.5, 1.7);
  sh.connect(sg).connect(c.dest);
  // 空气声：高通噪声轻扫
  const air = noiseSource(c.ctx, t0, 1.4, 1.2);
  const hp = filter(c, 'highpass', 6000, 0.7);
  const ag = c.ctx.createGain();
  env(ag, t0, 0.05 * v, 0.3, 1.3);
  air.connect(hp).connect(ag).connect(c.dest);
  nodes.push(sh, lfo, lfoAmt, sg, air, hp, ag);
  disposeOnEnd(sh, nodes);
}

/** hurt：低频 thud（正弦下坠过轻失真）+ 闷噪敲击。 */
function hurt(c: SfxCtx, t0: number, v: number, p: number): void {
  const o = tone(c, 'sine', 130 * p, t0, 0.26);
  glideTo(o, 44 * p, t0 + 0.2);
  const ws = c.ctx.createWaveShaper();
  ws.curve = HURT_CURVE;
  const lp = filter(c, 'lowpass', 480, 0.7);
  const g = c.ctx.createGain();
  env(g, t0, 0.5 * v, 0.006, 0.24);
  o.connect(ws); ws.connect(lp); lp.connect(g); g.connect(c.dest);
  const n = noiseSource(c.ctx, t0, 0.08, 0.8);
  const lp2 = filter(c, 'lowpass', 360, 0.7);
  const g2 = c.ctx.createGain();
  env(g2, t0, 0.18 * v, 0.002, 0.07);
  n.connect(lp2); lp2.connect(g2); g2.connect(c.dest);
  disposeOnEnd(o, [o, ws, lp, g, n, lp2, g2]);
}

/** boss：低沉警报双音（A2/E2 锯齿交替两轮 + 亚低音持续）。 */
function boss(c: SfxCtx, t0: number, v: number, p: number): void {
  const lp = filter(c, 'lowpass', 420, 0.8);
  lp.connect(c.dest);
  const nodes: AudioNode[] = [lp];
  let tail: OscillatorNode | null = null;
  const seq: [number, number][] = [[110, 0], [82.41, 0.32], [110, 0.64], [82.41, 0.96]];
  for (const [f, dt] of seq) {
    const dur = dt >= 0.96 ? 0.38 : 0.3;
    const start = t0 + dt;
    const o = tone(c, 'sawtooth', f * p, start, dur + 0.04);
    const g = c.ctx.createGain();
    env(g, start, 0.28 * v, 0.02, dur);
    o.connect(g).connect(lp);
    nodes.push(o, g);
    tail = o;
  }
  const sub = tone(c, 'sine', 55 * p, t0, 1.4);
  const sg = c.ctx.createGain();
  env(sg, t0, 0.12 * v, 0.05, 1.32);
  sub.connect(sg).connect(c.dest);
  nodes.push(sub, sg);
  if (tail) disposeOnEnd(tail, nodes);
}

/** warning：轻量警示双音（E5 → C#5 三角波）。 */
function warning(c: SfxCtx, t0: number, v: number, p: number): void {
  const o1 = tone(c, 'triangle', 659.26 * p, t0, 0.18);
  const g1 = c.ctx.createGain();
  env(g1, t0, 0.26 * v, 0.008, 0.15);
  o1.connect(g1).connect(c.dest);
  const o2 = tone(c, 'triangle', 554.37 * p, t0 + 0.18, 0.26);
  const g2 = c.ctx.createGain();
  env(g2, t0 + 0.18, 0.26 * v, 0.008, 0.22);
  o2.connect(g2).connect(c.dest);
  disposeOnEnd(o2, [o1, g1, o2, g2]);
}

/** bomb：爆炸 = 宽带噪声低通下扫 + 亚低频正弦坠落。 */
function bomb(c: SfxCtx, t0: number, v: number, p: number): void {
  const n = noiseSource(c.ctx, t0, 0.9, 1);
  const lp = filter(c, 'lowpass', 5000, 0.6);
  lp.frequency.exponentialRampToValueAtTime(90, t0 + 0.8);
  const g = c.ctx.createGain();
  env(g, t0, 0.55 * v, 0.005, 0.85);
  n.connect(lp).connect(g).connect(c.dest);
  const o = tone(c, 'sine', 150 * p, t0, 0.75);
  glideTo(o, 26 * p, t0 + 0.7);
  const g2 = c.ctx.createGain();
  env(g2, t0, 0.42 * v, 0.008, 0.72);
  o.connect(g2).connect(c.dest);
  disposeOnEnd(n, [n, lp, g, o, g2]);
}

/** revive：上行滑音（C4 → C6）+ 光晕泛音 + 高频空气渐起。 */
function revive(c: SfxCtx, t0: number, v: number, p: number): void {
  const o = tone(c, 'sine', 261.63 * p, t0, 0.65);
  glideTo(o, 1046.5 * p, t0 + 0.55);
  const g = c.ctx.createGain();
  env(g, t0, 0.22 * v, 0.06, 0.6);
  o.connect(g).connect(c.dest);
  const halo = tone(c, 'triangle', 2093 * p, t0 + 0.15, 1.35);
  const hg = c.ctx.createGain();
  env(hg, t0 + 0.15, 0.06 * v, 0.35, 1.15);
  halo.connect(hg).connect(c.dest);
  const air = noiseSource(c.ctx, t0, 1.2, 1.1);
  const hp = filter(c, 'highpass', 5200, 0.7);
  const ag = c.ctx.createGain();
  env(ag, t0, 0.06 * v, 0.25, 1.1);
  air.connect(hp).connect(ag).connect(c.dest);
  disposeOnEnd(halo, [o, g, halo, hg, air, hp, ag]);
}

/** dash：短促 whoosh（带通噪声中心频率快速上扫）。 */
function dash(c: SfxCtx, t0: number, v: number, p: number): void {
  const n = noiseSource(c.ctx, t0, 0.2, 1);
  const bp = filter(c, 'bandpass', 380 * p, 1.1);
  bp.frequency.exponentialRampToValueAtTime(2600 * p, t0 + 0.16);
  const g = c.ctx.createGain();
  env(g, t0, 0.3 * v, 0.015, 0.18);
  n.connect(bp).connect(g).connect(c.dest);
  disposeOnEnd(n, [n, bp, g]);
}

/** ui：极短 click（三角波，约 30ms 内结束，几乎无尾）。 */
function ui(c: SfxCtx, t0: number, v: number, p: number): void {
  const o = tone(c, 'triangle', 1350 * p, t0, 0.045);
  const g = c.ctx.createGain();
  env(g, t0, 0.16 * v, 0.001, 0.03);
  o.connect(g).connect(c.dest);
  disposeOnEnd(o, [o, g]);
}

// ---------------- 分发 ----------------

/** 播放一条音效（t0 通常为 ctx.currentTime + 2ms）。节流由引擎负责。 */
export function playSfx(c: SfxCtx, name: SfxName, t0: number, v: number, p: number): void {
  switch (name) {
    case 'shoot': return shoot(c, t0, v, p);
    case 'hit': return hit(c, t0, v, p);
    case 'enemyDie': return enemyDie(c, t0, v, p);
    case 'kill': return kill(c, t0, v, p);
    case 'pickup': return pickup(c, t0, v, p);
    case 'levelup': return levelup(c, t0, v, p);
    case 'evolve': return evolve(c, t0, v, p);
    case 'hurt': return hurt(c, t0, v, p);
    case 'boss': return boss(c, t0, v, p);
    case 'warning': return warning(c, t0, v, p);
    case 'bomb': return bomb(c, t0, v, p);
    case 'revive': return revive(c, t0, v, p);
    case 'dash': return dash(c, t0, v, p);
    case 'ui': return ui(c, t0, v, p);
  }
}
