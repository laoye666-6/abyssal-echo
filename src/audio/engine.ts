/**
 * ============================================================
 *  ABYSSAL ECHO — 音频引擎（惰性单例，纯 WebAudio，无外部资源）
 * ------------------------------------------------------------
 *  拓扑：sfx bus ──┐
 *                  ├→ 压限器（安全 limiter）→ master gain → destination
 *        music bus ─┘
 *  · unlock() 必须在用户手势后调用（浏览器自动播放策略）；
 *    解锁前的 play() 一律静默丢弃。
 *  · 节流：同类音效 30ms 内只播一次；v > 0.9 的重要音效豁免。
 *  · 所有临时节点在配方内部用完即断开（onended），无泄漏。
 *  · 音乐由 MusicDirector 驱动（B 和声小调 / 92 BPM，见 music.ts）：
 *      startMenuMusic()  → pad + 偶发铃音的平静层
 *      setIntensity(>0)  → 无缝切入战斗层，节奏随强度呼吸
 *      stopMusic()       → 全部停止
 * ============================================================
 */

import type { SfxName } from '@/game/types';
import { playSfx } from './sfx';
import { MusicDirector } from './music';

/** 同类音效节流窗口（秒）。 */
const SFX_THROTTLE_S = 0.03;

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function clampPitch(x: number): number {
  return x < 0.5 ? 0.5 : x > 2.5 ? 2.5 : x;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private sfxVol = 1;
  private musicVol = 1;
  /** 同名音效上次触发时刻（ctx.currentTime，秒） */
  private readonly lastPlayAt = new Map<SfxName, number>();
  private director: MusicDirector | null = null;
  /** 'off' = 从未启动或已 stopMusic；引擎侧镜像，负责模式切换判定 */
  private musicMode: 'off' | 'menu' | 'run' = 'off';

  /** 必须在用户手势后调用；幂等（重复调用仅尝试恢复被挂起的上下文）。 */
  unlock(): void {
    if (!this.ctx) {
      const ctx = new AudioContext();
      this.ctx = ctx;
      // 总线：sfx / music → 压限器 → master → 输出
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 24;
      comp.ratio.value = 3;
      comp.attack.value = 0.004;
      comp.release.value = 0.24;
      const master = ctx.createGain();
      master.gain.value = 1;
      const sfx = ctx.createGain();
      const music = ctx.createGain();
      sfx.connect(comp);
      music.connect(comp);
      comp.connect(master);
      master.connect(ctx.destination);
      this.sfxBus = sfx;
      this.musicBus = music;
      this.director = new MusicDirector(ctx, music);
      this.applyVolumes();
    }
    if (this.ctx.state !== 'running') {
      void this.ctx.resume().catch(() => undefined);
    }
  }

  setSfxVolume(v: number): void {
    this.sfxVol = clamp01(v);
    if (this.ctx) this.applyVolumes();
  }

  setMusicVolume(v: number): void {
    this.musicVol = clamp01(v);
    if (this.ctx) this.applyVolumes();
  }

  /** 播放一条音效事件（v=音量系数 0..1，p=音高系数 0.5..2.5）。 */
  play(name: SfxName, v: number, p: number): void {
    const ctx = this.ctx;
    const bus = this.sfxBus;
    // 自动播放策略：未解锁 / 被挂起时静默丢弃
    if (!ctx || !bus || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    // 节流：同类音效 30ms 内只播一次（重要音效 v>0.9 豁免）
    if (v <= 0.9) {
      const last = this.lastPlayAt.get(name);
      if (last !== undefined && now - last < SFX_THROTTLE_S) return;
    }
    this.lastPlayAt.set(name, now);
    playSfx({ ctx, dest: bus }, name, now + 0.002, clamp01(v), clampPitch(p));
  }

  /** 音乐强度 0..1（波次导演驱动，各层以 ~1.5s 时间常数平滑过渡）。
   *  若音乐尚未启动且 x > 0，会自动以战斗层启动（防止静音局）。 */
  setIntensity(x: number): void {
    const i = clamp01(x);
    const d = this.director;
    if (!d) return;
    if (i > 0 && this.musicMode === 'off') {
      this.musicMode = 'run';
      d.start('run', i);
      return;
    }
    if (i > 0 && this.musicMode === 'menu') {
      this.musicMode = 'run';
      d.setIntensity(i);
      d.enterRun(); // 菜单 → 战斗：pad 延续，节奏层渐入
      return;
    }
    d.setIntensity(i);
  }

  /** 停止音乐（回主菜单时调用）。 */
  stopMusic(): void {
    this.musicMode = 'off';
    this.director?.stop();
  }

  /** 主菜单环境音乐（更平静的层）；已在菜单层播放时幂等。 */
  startMenuMusic(): void {
    const d = this.director;
    if (!d) return; // 未解锁：等待 unlock 后由应用再次调用
    if (this.musicMode === 'menu' && d.isRunning) return;
    this.musicMode = 'menu';
    d.start('menu', 0);
  }

  /** 音量应用感知曲线（平方），经 setTargetAtTime 避免爆音。 */
  private applyVolumes(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    this.sfxBus?.gain.setTargetAtTime(this.sfxVol * this.sfxVol, t, 0.03);
    this.musicBus?.gain.setTargetAtTime(this.musicVol * this.musicVol * 0.9, t, 0.04);
  }
}

// ---------------- 惰性单例 ----------------

let singleton: AudioEngine | null = null;

export function getAudio(): AudioEngine {
  if (!singleton) singleton = new AudioEngine();
  return singleton;
}
