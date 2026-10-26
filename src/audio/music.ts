/**
 * ============================================================
 *  ABYSSAL ECHO — 程序化自适应音乐（B 和声小调 / 92 BPM）
 * ------------------------------------------------------------
 *  分层（各自经独立 gain，随 intensity 平滑呼吸）：
 *   ① 低频 pad：双 detune 锯齿 + 低通 + 缓慢 LFO —— 常驻
 *   ② 低音脉冲：每拍一个 B1 正弦 pluck —— 常驻（run 模式）
 *   ③ 琶音层：16 分音符音型 + 点状延迟回声 —— intensity > 0.35 渐入
 *   ④ 紧张打击层：hi-hat 噪声 + 军鼓感 —— intensity > 0.7 渐入
 *  菜单模式：只有 pad + 偶发空灵铃音（随机 5-10s），intensity 视为 0。
 *  调度：lookahead 音序器 —— 每 100ms 心跳，调度未来 220ms 的音符；
 *  短音符自清理（onended disconnect），持久节点在 stop 时统一淡出断开，
 *  可无泄漏地反复 start/stop。
 * ============================================================
 */

import { noiseSource } from './sfx';

// ---------------- 常量 ----------------

const BPM = 92;
/** 16 分音符步长（秒） */
const STEP = 60 / BPM / 4;
/** 音序器心跳（毫秒） */
const TICK_MS = 100;
/** 调度前视窗口（秒） */
const LOOKAHEAD_S = 0.22;
/** 步循环长度：4 小节 × 16 步 */
const LOOP_STEPS = 64;

/** B 和声小调（B3 八度起）：B C# D E F# G A#（升 VII 营造太空恐怖感） */
const SCALE = [246.94, 277.18, 293.66, 329.63, 369.99, 391.99, 466.16] as const;
const PAD_ROOT = 61.735;  // B1
const PAD_FIFTH = 92.499; // F#2
const BASS_ROOT = 61.735; // B1
const BASS_LIFT = 48.999; // G1：每 4 小节末拍的暗色抬升

/** 琶音音型（音阶级度，7 = 高八度 B4；结尾沉入 A#4/E4 的阴郁轮廓） */
const ARP_PATTERN = [7, 9, 11, 13, 14, 13, 11, 9, 7, 9, 11, 13, 11, 9, 6, 4] as const;
/** 菜单铃音候选（F#5 / B5 / D6 / C#5） */
const BELL_NOTES = [739.99, 987.77, 1174.66, 554.37] as const;

export type MusicMode = 'menu' | 'run';

interface LayerGains {
  pad: GainNode;
  bass: GainNode;
  arp: GainNode;
  perc: GainNode;
  bell: GainNode;
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** 音阶级度 → 频率（deg 可跨八度，负数向下）。 */
function degHz(deg: number): number {
  const oct = Math.floor(deg / 7);
  const idx = ((deg % 7) + 7) % 7;
  return (SCALE[idx] ?? 246.94) * Math.pow(2, oct);
}

// ---------------- 音序器 ----------------

export class MusicDirector {
  private readonly ctx: AudioContext;
  private readonly out: AudioNode; // engine 的 music bus
  private running = false;
  private mode: MusicMode = 'menu';
  private intensity = 0;

  private gains: LayerGains | null = null;
  private padFilter: BiquadFilterNode | null = null;
  /** 持久节点（pad 振荡器、滤波器、延迟网络、层 gain），stop 时统一断开 */
  private persistent: AudioNode[] = [];
  private padSources: OscillatorNode[] = [];
  private timer: number | null = null;
  private step = 0;
  private nextStepTime = 0;
  private nextBellTime = 0;

  constructor(ctx: AudioContext, out: AudioNode) {
    this.ctx = ctx;
    this.out = out;
  }

  get isRunning(): boolean {
    return this.running;
  }

  /** 启动（若已在运行则先无泄漏地重建）。mode = 'menu' 时 intensity 视为 0。 */
  start(mode: MusicMode, intensity?: number): void {
    this.stop();
    this.mode = mode;
    if (intensity !== undefined) this.intensity = clamp01(intensity);
    this.buildGraph();
    const now = this.ctx.currentTime;
    this.step = 0;
    this.nextStepTime = now + 0.06;
    this.nextBellTime = now + 1.5 + Math.random() * 3.5;
    this.running = true;
    this.applyLayerTargets(1.2); // 从 0 平滑淡入
    this.timer = window.setInterval(this.tick, TICK_MS);
  }

  /** 停止：淡出持久层 → 停止 pad 振荡器 → 延迟统一断开。 */
  stop(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    const nodes = this.persistent;
    const pads = this.padSources;
    const gains = this.gains;
    this.persistent = [];
    this.padSources = [];
    this.gains = null;
    this.padFilter = null;
    this.running = false;
    if (nodes.length === 0) return;
    const now = this.ctx.currentTime;
    if (gains) {
      for (const g of [gains.pad, gains.bass, gains.arp, gains.perc, gains.bell]) {
        g.gain.setTargetAtTime(0, now, 0.07);
      }
    }
    for (const o of pads) {
      try {
        o.stop(now + 0.35);
      } catch {
        /* 已停止 */
      }
    }
    window.setTimeout(() => {
      for (const s of pads) s.disconnect();
      for (const n of nodes) n.disconnect();
    }, 600);
  }

  /** 更新音乐强度（波次导演驱动）；层 gain 用 ~1.5s 时间常数平滑过渡。 */
  setIntensity(i: number): void {
    this.intensity = clamp01(i);
    if (this.running && this.mode === 'run') this.applyLayerTargets(1.5);
  }

  /** 菜单 → 战斗：保留 pad 与步进相位，无缝渐入节奏层。 */
  enterRun(): void {
    if (!this.running || this.mode === 'run') return;
    this.mode = 'run';
    this.applyLayerTargets(1.5);
  }

  // ---------------- 图构建 ----------------

  private buildGraph(): void {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const mkLayer = (): GainNode => {
      const g = ctx.createGain();
      g.gain.value = 0; // 一律从静音淡入，由 applyLayerTargets 抬到目标
      g.connect(this.out);
      this.persistent.push(g);
      return g;
    };
    const gains: LayerGains = {
      pad: mkLayer(),
      bass: mkLayer(),
      arp: mkLayer(),
      perc: mkLayer(),
      bell: mkLayer(),
    };
    this.gains = gains;

    // ---- ① 低频 pad：双 detune 锯齿 + 低通 + 缓慢 LFO ----
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 300;
    lp.Q.value = 0.6;
    lp.connect(gains.pad);
    this.persistent.push(lp);
    this.padFilter = lp;
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.055;
    const lfoAmt = ctx.createGain();
    lfoAmt.gain.value = 110;
    lfo.connect(lfoAmt).connect(lp.frequency);
    lfo.start(now);
    this.padSources.push(lfo);
    this.persistent.push(lfo, lfoAmt);
    const padSpecs: [number, number][] = [
      [PAD_ROOT, -5],
      [PAD_ROOT, 5],
      [PAD_FIFTH, 3],
    ];
    for (const [f, det] of padSpecs) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = det;
      const og = ctx.createGain();
      og.gain.value = 0.16;
      o.connect(og).connect(lp);
      o.start(now);
      this.padSources.push(o);
      this.persistent.push(o, og);
    }

    // ---- 琶音的回声通道：点状 16 分延迟 + 反馈 ----
    const dly = ctx.createDelay(1.0);
    dly.delayTime.value = STEP * 3;
    const fb = ctx.createGain();
    fb.gain.value = 0.32;
    const send = ctx.createGain();
    send.gain.value = 0.45;
    gains.arp.connect(send);
    send.connect(dly);
    dly.connect(fb);
    fb.connect(dly);
    dly.connect(this.out);
    this.persistent.push(dly, fb, send);
  }

  // ---------------- 层目标与过渡 ----------------

  private layerTarget(name: keyof LayerGains): number {
    const i = this.intensity;
    switch (name) {
      case 'pad':
        return this.mode === 'menu' ? 0.75 : 0.9;
      case 'bell':
        return this.mode === 'menu' ? 1 : 0;
      case 'bass':
        return this.mode === 'menu' ? 0 : 0.55 + 0.45 * i;
      case 'arp':
        return this.mode === 'menu' ? 0 : clamp01((i - 0.35) / 0.25);
      case 'perc':
        return this.mode === 'menu' ? 0 : clamp01((i - 0.7) / 0.2);
    }
  }

  private applyLayerTargets(tc: number): void {
    const g = this.gains;
    if (!g) return;
    const now = this.ctx.currentTime;
    for (const name of ['pad', 'bass', 'arp', 'perc', 'bell'] as const) {
      g[name].gain.setTargetAtTime(this.layerTarget(name), now, tc);
    }
    // 强度越高，pad 低通越亮
    const bright = this.mode === 'menu' ? 300 : 300 + 300 * this.intensity;
    this.padFilter?.frequency.setTargetAtTime(bright, now, tc);
  }

  // ---------------- 调度 ----------------

  private readonly tick = (): void => {
    if (!this.running) return;
    const now = this.ctx.currentTime;
    const horizon = now + LOOKAHEAD_S;
    while (this.nextStepTime < horizon) {
      this.scheduleStep(this.step, this.nextStepTime);
      this.step = (this.step + 1) % LOOP_STEPS;
      this.nextStepTime += STEP;
    }
    // 菜单：偶发空灵铃音（5-10s 随机间隔）
    if (this.mode === 'menu' && this.nextBellTime <= horizon) {
      this.scheduleBell(Math.max(this.nextBellTime, now + 0.03));
      this.nextBellTime = now + 5 + Math.random() * 5;
    }
  };

  private scheduleStep(step: number, t: number): void {
    // ② 低音脉冲：每拍（bar 3 末拍落到 G1，4 小节一轮的暗色呼吸）
    if (step % 4 === 0 && this.layerTarget('bass') > 0.01) {
      const bar = Math.floor(step / 16);
      const beat = Math.floor((step % 16) / 4);
      this.scheduleBass(t, bar === 3 && beat === 3 ? BASS_LIFT : BASS_ROOT);
    }
    // ③ 琶音：16 分音符音型
    if (this.layerTarget('arp') > 0.01) {
      const deg = ARP_PATTERN[step % ARP_PATTERN.length] ?? 7;
      this.scheduleArp(t, deg);
    }
    // ④ 紧张打击层：hi-hat 每步 + 军鼓感在每小节 2/4 拍
    if (this.layerTarget('perc') > 0.01) {
      this.scheduleHat(t, step % 2 === 1);
      if (step % 16 === 4 || step % 16 === 12) this.scheduleSnare(t);
    }
  }

  private scheduleBass(t: number, hz: number): void {
    const out = this.gains?.bass;
    if (!out) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(hz, t);
    o.frequency.exponentialRampToValueAtTime(hz * 0.985, t + 0.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.58);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.6);
    o.onended = () => {
      o.disconnect();
      g.disconnect();
    };
  }

  private scheduleArp(t: number, deg: number): void {
    const out = this.gains?.arp;
    if (!out) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(degHz(deg), t);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.13, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.17);
    o.onended = () => {
      o.disconnect();
      g.disconnect();
    };
  }

  private scheduleHat(t: number, accent: boolean): void {
    const out = this.gains?.perc;
    if (!out) return;
    const ctx = this.ctx;
    const src = noiseSource(ctx, t, 0.05, 1.4);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7600;
    hp.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(accent ? 0.08 : 0.045, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
    src.connect(hp); hp.connect(g); g.connect(out);
    src.onended = () => {
      src.disconnect();
      hp.disconnect();
      g.disconnect();
    };
  }

  private scheduleSnare(t: number): void {
    const out = this.gains?.perc;
    if (!out) return;
    const ctx = this.ctx;
    // 沙带：带通噪声
    const src = noiseSource(ctx, t, 0.18, 1);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1900;
    bp.Q.value = 0.9;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.2, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    src.connect(bp); bp.connect(g); g.connect(out);
    // 腔体：短促下坠正弦
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(210, t);
    o.frequency.exponentialRampToValueAtTime(130, t + 0.09);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.13, t + 0.004);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
    o.connect(og).connect(out);
    o.start(t);
    o.stop(t + 0.13);
    src.onended = () => {
      src.disconnect();
      bp.disconnect();
      g.disconnect();
      o.disconnect();
      og.disconnect();
    };
  }

  /** 空灵铃音：非整数泛型玻璃质感正弦簇，长衰减。 */
  private scheduleBell(t: number): void {
    const out = this.gains?.bell;
    if (!out) return;
    const ctx = this.ctx;
    const f = BELL_NOTES[Math.floor(Math.random() * BELL_NOTES.length)] ?? 987.77;
    const partials: [number, number][] = [
      [f, 1],
      [f * 2.01, 0.35],
      [f * 2.98, 0.12],
    ];
    const nodes: AudioNode[] = [];
    let tail: OscillatorNode | null = null;
    for (const [hf, amp] of partials) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = hf;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.075 * amp, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.8);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 2.9);
      nodes.push(o, g);
      tail = o;
    }
    if (tail) {
      tail.onended = () => {
        for (const n of nodes) n.disconnect();
      };
    }
  }
}
