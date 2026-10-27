import { Clock, SIM_STEP } from '@/core/clock';
import { Input } from '@/core/input';
import { loadSave, persistSave, defaultMeta, SAVE_VERSION } from '@/core/save';
import type { SaveData } from '@/game/types';
import type { CharacterId, RunMode, RunState, UpgradeOption } from '@/game/types';
import { makeRunState, drainEvents } from '@/game/state';
import { EnemyGrid } from '@/game/combat';
import { stepSim } from '@/game/sim';
import { generateChoices, applyOption, collectRunSummary, startWeaponOf } from '@/game/upgrades';
import { coresEarned, RUN_GOAL_TIME, dailySeed, dailyCharacter, dailyScore, todayStr } from '@/game/balance';
import { evaluateLive, evaluateAfterRun, evaluateMeta } from '@/game/achievements';
import { dailyModifierFor } from '@/data/daily.data';
import { WAVE_PHASES } from '@/data/waves.data';
import { formatTime } from '@/core/math';
import { buildAtlas, type Atlas } from '@/render/atlas';
import { Camera } from '@/render/camera';
import { Particles } from '@/render/particles';
import { Renderer } from '@/render/renderer';
import { Hud } from '@/render/hud';
import { getAudio } from '@/audio/engine';
import { UiManager } from '@/ui/ui';
import { t, setLang } from '@/core/i18n';

export type AppMode = 'title' | 'characters' | 'running' | 'paused' | 'upgrade' | 'results' | 'settings' | 'codex' | 'meta' | 'achievements';

/** 每日挑战角色轮换名单（不受解锁限制）。 */
const DAILY_ROSTER: CharacterId[] = ['peregrine', 'bastion', 'astraeus', 'vesper'];

export interface RunResult {
  victory: boolean;
  reason: string;
  time: number;
  kills: number;
  level: number;
  damageDealt: number;
  cores: number;
  newRecord: boolean;
  unlockToast: string | null;
  // ---- v1.1 ----
  mode: RunMode;
  /** 无尽：完成的循环数 */
  depth: number;
  /** 本局进化次数 */
  evolutions: number;
  /** 每日：本局得分 / 当日最佳 / 是否刷新纪录 */
  dailyScore: number;
  dailyBestScore: number;
  newDailyBest: boolean;
}

export class GameApp {
  readonly atlas: Atlas;
  readonly camera = new Camera();
  readonly particles = new Particles();
  readonly renderer: Renderer;
  readonly hud: Hud;
  readonly input = new Input();
  readonly ui: UiManager;
  private readonly clock: Clock;

  save: SaveData;
  mode: AppMode = 'title';
  state: RunState | null = null;
  selectedCharacter: CharacterId = 'peregrine';
  /** 角色选择屏上的模式选择（v1.1） */
  selectedMode: RunMode = 'standard';
  lastResult: RunResult | null = null;

  private grid = new EnemyGrid();
  private audio = getAudio();
  private engineTrailT = 0;
  /** 成就实时判定节流 */
  private achvT = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.save = loadSave();
    setLang(this.save.settings.lang);
    this.atlas = buildAtlas();
    this.renderer = new Renderer(canvas, this.atlas, this.camera, this.particles, {
      showDamageNumbers: this.save.settings.showDamageNumbers,
      shakeMul: this.save.settings.screenShake,
      reducedFlash: this.save.settings.reducedFlash,
    });
    this.hud = new Hud(this.renderer, this.camera);
    this.ui = new UiManager(this);
    this.input.attach(window);
    this.audio.setSfxVolume(this.save.settings.sfxVolume);
    this.audio.setMusicVolume(this.save.settings.musicVolume);
    this.clock = new Clock(
      (dt) => this.step(dt),
      (frameDt) => this.renderFrame(frameDt),
    );
    window.addEventListener('resize', () => this.renderer.resize());
    // 失焦自动暂停（对局中）
    window.addEventListener('blur', () => {
      if (this.mode === 'running') this.pause();
    });
  }

  boot(): void {
    this.ui.mount(document.getElementById('app')!);
    this.ui.showTitle();
    this.audio.startMenuMusic();
    this.clock.start();
  }

  /** 音频解锁（首次手势调用） */
  unlockAudio(): void {
    this.audio.unlock();
  }

  // ---------------- 模式切换 ----------------

  showTitle(): void {
    this.mode = 'title';
    this.audio.startMenuMusic();
    this.ui.showTitle();
  }

  showCharacters(): void {
    this.mode = 'characters';
    this.ui.showCharacters();
  }

  showSettings(): void {
    this.mode = 'settings';
    this.ui.showSettings();
  }

  showCodex(): void {
    this.mode = 'codex';
    this.ui.showCodex();
  }

  showMeta(): void {
    this.mode = 'meta';
    this.ui.showMeta();
  }

  showAchievements(): void {
    this.mode = 'achievements';
    this.ui.showAchievements();
  }

  startRun(mode: RunMode = 'standard'): void {
    const isDaily = mode === 'daily';
    const date = todayStr();
    const seed = isDaily ? dailySeed(date) : (Math.random() * 0xffffffff) >>> 0;
    const characterId: CharacterId = isDaily
      ? dailyCharacter(date, DAILY_ROSTER)
      : this.selectedCharacter;
    this.state = makeRunState({
      seed,
      characterId,
      meta: this.save.meta,
      mode,
      dailyDate: isDaily ? date : undefined,
    });
    this.state.weapons.push({ id: startWeaponOf(characterId), level: 1, cd: 0.2, t: 0 });
    if (isDaily) {
      const mod = dailyModifierFor(date);
      this.state.dailyModifier = mod.id;
      mod.apply(this.state);
    }
    this.grid.clear();
    this.particles.clear();
    this.camera.x = -this.renderer.width / 2;
    this.camera.y = -this.renderer.height / 2;
    this.mode = 'running';
    this.audio.unlock();
    this.audio.startMenuMusic(); // 切换到局内由 intensity 驱动
    this.ui.showGame();
  }

  pause(): void {
    if (this.mode !== 'running') return;
    this.mode = 'paused';
    this.ui.showPause();
  }

  resume(): void {
    if (this.mode !== 'paused') return;
    this.mode = 'running';
    this.ui.showGame();
  }

  abandonRun(): void {
    if (!this.state) return;
    this.finishRun(false);
  }

  restartRun(): void {
    this.startRun();
  }

  // ---------------- 模拟 ----------------

  private step(dt: number): void {
    if (this.mode !== 'running' || !this.state) return;
    const state = this.state;
    const mv = this.input.moveVec();
    stepSim(state, dt, { mx: mv.x, my: mv.y, dash: this.input.held('dash') || this.input.pressed('dash') }, this.grid);

    // 成就实时判定（1s 节流）
    this.achvT -= dt;
    if (this.achvT <= 0) {
      this.achvT = 1;
      this.unlockAchievements(evaluateLive(state, this.save.meta));
    }

    // 引擎尾焰粒子
    this.engineTrailT -= dt;
    if (this.engineTrailT <= 0 && Math.hypot(state.player.vx, state.player.vy) > 40) {
      this.engineTrailT = 0.055;
      const a = state.player.facing + Math.PI;
      this.particles.spawn({
        x: state.player.x + Math.cos(a) * 14,
        y: state.player.y + Math.sin(a) * 14,
        vx: Math.cos(a) * 60 + (Math.random() - 0.5) * 30,
        vy: Math.sin(a) * 60 + (Math.random() - 0.5) * 30,
        life: 0.35,
        size: 2.4,
        color: '#5be7ff',
        kind: 'glow',
      });
    }

    if (state.pendingLevelUps > 0 && !state.over) {
      this.mode = 'upgrade';
      this.ui.showUpgrade(generateChoices(state));
      return;
    }
    if (state.over) {
      this.finishRun(state.over.victory);
    }
  }

  chooseUpgrade(opt: UpgradeOption): void {
    const state = this.state;
    if (!state) return;
    applyOption(state, opt);
    state.pendingLevelUps--;
    if (state.pendingLevelUps > 0) {
      this.ui.showUpgrade(generateChoices(state));
      this.mode = 'upgrade';
    } else {
      this.mode = 'running';
      this.ui.showGame();
    }
  }

  private finishRun(victory: boolean): void {
    const state = this.state;
    if (!state) return;
    const summary = collectRunSummary(state);
    const earned = coresEarned(summary.kills, summary.elitesKilled, summary.bossesKilled, summary.time, victory);
    const mode = state.mode;
    // 深度语义：当前所处回廊 = loop + 1（与 HUD 显示一致）
    const depth = state.loop + 1;

    // 每日得分
    let score = 0;
    let newDailyBest = false;
    if (mode === 'daily') {
      score = dailyScore(summary.kills, summary.time, summary.level, victory);
      const date = state.dailyDate ?? todayStr();
      const db = this.save.meta.dailyBest;
      if (db.date !== date) {
        this.save.meta.dailyBest = { date, score };
        newDailyBest = score > 0;
      } else if (score > db.score) {
        this.save.meta.dailyBest = { date, score };
        newDailyBest = true;
      }
    }

    // 写回元进度
    const meta = this.save.meta;
    const prevBest = meta.bestTime;
    meta.cores += earned;
    meta.totalCoresEarned += earned;
    meta.lifetimeKills += summary.kills;
    meta.bestTime = Math.max(meta.bestTime, summary.time);
    meta.bestKills = Math.max(meta.bestKills, summary.kills);
    meta.bestLevel = Math.max(meta.bestLevel, summary.level);
    meta.totalPlaySeconds += summary.time;
    meta.runs++;
    if (mode === 'endless') meta.endlessBestDepth = Math.max(meta.endlessBestDepth, depth);
    if (victory) {
      meta.victories++;
      meta.charWins[state.characterId] = (meta.charWins[state.characterId] ?? 0) + 1;
    }
    for (const id of summary.seen) {
      meta.bestiary[id] = (meta.bestiary[id] ?? 0) + 1;
    }
    let unlockToast: string | null = null;
    const tryUnlock = (id: CharacterId): void => {
      if (!meta.unlocked.includes(id)) {
        meta.unlocked.push(id);
        unlockToast = t(`char.${id}.name`);
      }
    };
    if (meta.bestTime >= 240) tryUnlock('bastion');
    if (summary.bossesKilled >= 1) tryUnlock('astraeus');
    if (summary.evolutions >= 1) tryUnlock('vesper');
    // 成就结算判定（state 仍在手上，live 判定可覆盖边界情况）
    this.unlockAchievements(evaluateLive(state, meta));
    this.unlockAchievements(evaluateAfterRun(summary, meta), true);
    persistSave(this.save);

    this.lastResult = {
      victory,
      reason: state.over?.reason ?? 'dead',
      time: summary.time,
      kills: summary.kills,
      level: summary.level,
      damageDealt: summary.damageDealt,
      cores: earned,
      newRecord: summary.time > prevBest && summary.time > 30,
      unlockToast,
      mode,
      depth,
      evolutions: state.evolutions,
      dailyScore: score,
      dailyBestScore: this.save.meta.dailyBest.score,
      newDailyBest,
    };
    this.state = null;
    this.mode = 'results';
    this.audio.stopMusic();
    this.ui.showResults(this.lastResult);
  }

  // ---------------- 渲染 ----------------

  private renderFrame(frameDt: number): void {
    const state = this.state;
    // 相机
    if (state) {
      this.camera.follow(state.player.x, state.player.y, state.player.vx, state.player.vy, frameDt, this.renderer.width, this.renderer.height);
    } else {
      // 标题背景缓慢漂移
      this.camera.x += frameDt * 12;
      this.camera.y += frameDt * 4;
    }
    this.particles.update(frameDt);
    const lowHp = state ? state.player.hp / state.stats.maxHp < 0.3 : false;
    this.renderer.render(state, frameDt, lowHp);
    if (state && (this.mode === 'running' || this.mode === 'paused' || this.mode === 'upgrade')) {
      this.hud.draw(state, this.mode === 'running' ? frameDt : 0, this.phaseLabel(state));
    }

    // Esc 暂停 / 恢复（升级弹窗打开时不响应）
    if (this.input.pressed('pause')) {
      if (this.mode === 'running') this.pause();
      else if (this.mode === 'paused') this.resume();
    }

    // 事件 -> 表现
    if (state) {
      for (const d of state.events.damage) {
        if (d.toPlayer) {
          this.camera.kick(0.3);
          this.renderer.pushDamage(state.player.x, state.player.y - 24, Math.round(d.amount), false, true);
        } else {
          if (d.killed) this.camera.kick(d.crit ? 0.12 : 0.05);
          this.renderer.pushDamage(d.x, d.y, d.amount, d.crit, false);
        }
      }
      const audio = this.audio;
      for (const s of state.events.sfx) {
        audio.play(s.name, s.v, s.p);
      }
      // 音乐强度
      audio.setIntensity(state.director.intensity);
      drainEvents(state);
    }
    this.input.endFrame();
  }

  private phaseLabel(state: RunState): string {
    const idx = state.director.phaseIndex;
    // 无尽模式下导演时间轴是循环相对时间
    const relT = state.mode === 'endless' ? state.time - state.loopStart : state.time;
    const nextAt = idx + 1 < WAVE_PHASES.length ? WAVE_PHASES[idx + 1]!.at : RUN_GOAL_TIME;
    if (state.director.bossAlive) return t('hud.boss');
    if (state.mode === 'endless') {
      return `${t('hud.depth')} ${state.loop + 1} · ${formatTime(Math.max(0, nextAt - relT))}`;
    }
    return `${t('hud.wave')} ${idx + 1} · ${formatTime(Math.max(0, nextAt - relT))}`;
  }

  // ---------------- 设置 ----------------

  updateSettings(mut: (s: SaveData['settings']) => void): void {
    mut(this.save.settings);
    persistSave(this.save);
    setLang(this.save.settings.lang);
    this.audio.setSfxVolume(this.save.settings.sfxVolume);
    this.audio.setMusicVolume(this.save.settings.musicVolume);
    this.camera.shakeMul = this.save.settings.screenShake;
    this.renderer.setOptions({
      showDamageNumbers: this.save.settings.showDamageNumbers,
      shakeMul: this.save.settings.screenShake,
      reducedFlash: this.save.settings.reducedFlash,
    });
  }

  resetSave(): void {
    this.save = { version: SAVE_VERSION, settings: this.save.settings, meta: defaultMeta() };
    persistSave(this.save);
  }

  // ---------------- 成就（v1.1） ----------------

  /** 批量解锁：写档 + toast（afterRun 的解锁不重复播升级音效由调用方决定，这里统一处理）。 */
  unlockAchievements(ids: string[], silentSfx = false): void {
    if (ids.length === 0) return;
    const meta = this.save.meta;
    let changed = false;
    for (const id of ids) {
      if (meta.achievements[id]) continue;
      meta.achievements[id] = 1;
      changed = true;
      this.ui.toast(`✦ ${t(`achv.${id}.name`)}`);
    }
    if (changed) {
      persistSave(this.save);
      if (!silentSfx) this.audio.play('levelup', 0.7, 1.3);
    }
  }

  /** 元进度类成就检查（购买星核强化后调用）。 */
  checkMetaAchievements(): void {
    this.unlockAchievements(evaluateMeta(this.save.meta), true);
  }

  get simStep(): number {
    return SIM_STEP;
  }
}
