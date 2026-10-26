/**
 * 波次导演：控制生成节奏、敌人构成、时间轴事件、难度强度。
 * 目标是"压力曲线"——前 2 分钟教学式平缓，中段交替高潮，结尾 Boss 战。
 */
import { WAVE_PHASES, TIMELINE } from '@/data/waves.data';
import { ENEMY_DEFS } from '@/data/enemies.data';
import type { EnemyKindId, RunState } from './types';
import { bossHpScale, maxEnemiesAt } from './balance';
import { spawnEnemy, spawnPickup } from './combat';

/** 生成环：出生在玩家视野外一点。 */
const RING_MIN = 520;
const RING_MAX = 680;
/** 距玩家超过该距离的普通敌人将被"传送"回环上（保持密度）。 */
const LEASH = 1500;

function pickRingPoint(state: RunState, out: { x: number; y: number }): void {
  const p = state.player;
  const a = state.rng.next() * Math.PI * 2;
  const r = state.rng.range(RING_MIN, RING_MAX);
  out.x = p.x + Math.cos(a) * r;
  out.y = p.y + Math.sin(a) * r;
}

const tmp = { x: 0, y: 0 };

export function stepDirector(state: RunState, dt: number): void {
  const d = state.director;
  const t = state.time;

  // ---- 相位推进 ----
  let phase = WAVE_PHASES[0]!;
  for (const ph of WAVE_PHASES) {
    if (t >= ph.at) phase = ph;
    else break;
  }
  const idx = WAVE_PHASES.indexOf(phase);
  if (idx !== d.phaseIndex) {
    d.phaseIndex = idx;
    d.phaseT = 0;
  }
  const nextAt = idx + 1 < WAVE_PHASES.length ? WAVE_PHASES[idx + 1]!.at : phase.at + 60;
  const dur = Math.max(1, nextAt - phase.at);
  const localT = t - phase.at;
  const rate = phase.startRate + (phase.endRate - phase.startRate) * Math.min(1, localT / dur);
  d.intensity += (phase.intensity - d.intensity) * Math.min(1, dt * 0.5);

  // ---- 常规生成 ----
  // Boss 存活时压低常规生成，保持战斗可读
  const bossSuppress = d.bossAlive ? 0.35 : 1;
  d.spawnBudget += rate * bossSuppress * dt;
  const cap = maxEnemiesAt(t);

  while (d.spawnBudget >= 1 && state.enemies.live < cap) {
    // 按权重选敌人
    let total = 0;
    for (const e of phase.pool) total += e.w;
    let roll = state.rng.next() * total;
    let chosen: EnemyKindId = phase.pool[0]!.id;
    for (const e of phase.pool) {
      roll -= e.w;
      if (roll < 0) {
        chosen = e.id;
        break;
      }
    }
    const def = ENEMY_DEFS[chosen];
    const batch = Math.max(1, def.batch);
    pickRingPoint(state, tmp);
    const cx = tmp.x;
    const cy = tmp.y;
    const spread = 14 + batch * 6;
    for (let i = 0; i < batch; i++) {
      if (state.enemies.live >= cap) break;
      const ox = state.rng.range(-spread, spread);
      const oy = state.rng.range(-spread, spread);
      spawnEnemy(state, chosen, cx + ox, cy + oy);
    }
    d.spawnBudget -= batch;
  }
  if (d.spawnBudget > 4) d.spawnBudget = 4;

  // ---- 时间轴事件 ----
  while (d.timelineIdx < TIMELINE.length && TIMELINE[d.timelineIdx]!.at <= t) {
    const ev = TIMELINE[d.timelineIdx]!.kind;
    d.timelineIdx++;
    switch (ev.type) {
      case 'elite': {
        pickRingPoint(state, tmp);
        spawnEnemy(state, ev.id, tmp.x, tmp.y);
        state.banner = { key: 'warning.elite', t: 2.4 };
        state.events.sfx.push({ name: 'warning', v: 1, p: 1 });
        break;
      }
      case 'boss': {
        pickRingPoint(state, tmp);
        spawnEnemy(state, ev.id, tmp.x, tmp.y, bossHpScale(state.time));
        state.banner = { key: ev.id === 'boss_eye' ? 'warning.finalboss' : 'warning.boss', t: 3 };
        state.events.sfx.push({ name: 'boss', v: 1, p: 1 });
        break;
      }
      case 'swarm': {
        for (let i = 0; i < ev.count; i++) {
          if (state.enemies.live >= cap + 40) break;
          const a = (i / ev.count) * Math.PI * 2;
          const r = state.rng.range(RING_MIN, RING_MAX);
          spawnEnemy(state, ev.id, state.player.x + Math.cos(a) * r, state.player.y + Math.sin(a) * r);
        }
        state.events.sfx.push({ name: 'warning', v: 0.7, p: 1.4 });
        break;
      }
      case 'pickupDrop': {
        const a = state.rng.next() * Math.PI * 2;
        spawnPickup(state, ev.kind, state.player.x + Math.cos(a) * 180, state.player.y + Math.sin(a) * 180);
        break;
      }
      case 'warning': {
        state.banner = { key: ev.key, t: 2.6 };
        state.events.sfx.push({ name: 'warning', v: 1, p: 1 });
        break;
      }
    }
  }

  // ---- 横幅计时 ----
  if (state.banner) {
    state.banner.t -= dt;
    if (state.banner.t <= 0) state.banner = null;
  }
}

/** 超距敌人重新拉回生成环（保持威胁密度，防止甩尾逃课）。 */
export function leashEnemies(state: RunState): void {
  const p = state.player;
  state.enemies.forEach((e) => {
    if (e.tier !== 'normal') return;
    const dx = e.x - p.x;
    const dy = e.y - p.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > LEASH * LEASH) {
      const a = Math.atan2(dy, dx) + state.rng.range(-0.6, 0.6);
      const r = state.rng.range(RING_MIN, RING_MAX);
      e.x = p.x + Math.cos(a) * r;
      e.y = p.y + Math.sin(a) * r;
      e.vx = 0;
      e.vy = 0;
    }
  });
}
