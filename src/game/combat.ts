/**
 * 战斗系统：空间网格、索敌、伤害管线、死亡结算。
 * 这里是平衡与手感的枢纽 —— 改数值去 data/，改逻辑优先保持纯函数可测。
 */
import { ENEMY_DEFS } from '@/data/enemies.data';
import { dist2 } from '@/core/math';
import type { Enemy, EnemyKindId, FxEvent, RunState } from './types';
import { enemyDmgScale, enemyHpScale, loopHpMul, loopXpMul, playerDamageTaken, rollCrit } from './balance';

// ---------------- 空间网格 ----------------

const CELL = 96;

export class EnemyGrid {
  private cells = new Map<number, Enemy[]>();

  clear(): void {
    this.cells.clear();
  }

  private key(cx: number, cy: number): number {
    return cx * 73856093 ^ cy * 19349663;
  }

  insert(e: Enemy): void {
    const cx = Math.floor(e.x / CELL);
    const cy = Math.floor(e.y / CELL);
    const k = this.key(cx, cy);
    let arr = this.cells.get(k);
    if (!arr) {
      arr = [];
      this.cells.set(k, arr);
    }
    arr.push(e);
  }

  /** 遍历 (x,y) 半径 r 覆盖的所有敌人（可能含少量超界者，由调用方二次校验）。 */
  query(x: number, y: number, r: number, fn: (e: Enemy) => void): void {
    const minCx = Math.floor((x - r) / CELL);
    const maxCx = Math.floor((x + r) / CELL);
    const minCy = Math.floor((y - r) / CELL);
    const maxCy = Math.floor((y + r) / CELL);
    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        const arr = this.cells.get(this.key(cx, cy));
        if (arr) for (const e of arr) fn(e);
      }
    }
  }
}

// ---------------- 索敌 ----------------

export function nearestEnemy(state: RunState, x: number, y: number, maxDist: number): Enemy | null {
  let best: Enemy | null = null;
  let bestD = maxDist * maxDist;
  state.enemies.forEach((e) => {
    if (e.spawnT > 0) return;
    const d = dist2(x, y, e.x, e.y);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  });
  return best;
}

/** 最近的 N 个敌人（链式武器用）。按距离排序。 */
export function nearestEnemies(state: RunState, x: number, y: number, maxDist: number, n: number): Enemy[] {
  const out: Enemy[] = [];
  const maxD2 = maxDist * maxDist;
  state.enemies.forEach((e) => {
    if (e.spawnT > 0) return;
    const d = dist2(x, y, e.x, e.y);
    if (d <= maxD2) out.push(e);
  });
  out.sort((a, b) => dist2(x, y, a.x, a.y) - dist2(x, y, b.x, b.y));
  return out.slice(0, n);
}

// ---------------- 生成 ----------------

export function spawnEnemy(state: RunState, kind: EnemyKindId, x: number, y: number, hpMul = 1, dmgMul = 1): Enemy | null {
  const def = ENEMY_DEFS[kind];
  const e = state.enemies.spawn();
  if (!e) return null;
  const loopMul = state.mode === 'endless' && def.tier !== 'boss' ? loopHpMul(state.loop) : 1;
  const hpScale = def.tier === 'boss' ? hpMul * state.bossHpMul : enemyHpScale(state.time) * hpMul * state.enemyHpMul * loopMul;
  e.kind = kind;
  e.x = x;
  e.y = y;
  e.vx = 0;
  e.vy = 0;
  e.maxHp = Math.round(def.hp * hpScale);
  e.hp = e.maxHp;
  e.r = def.radius;
  e.speed = def.speed * state.enemySpeedMul;
  e.contactDps = def.contactDps * enemyDmgScale(state.time) * dmgMul;
  e.xp = def.xp;
  e.tier = def.tier;
  e.knockbackResist = def.knockbackResist;
  e.t = 0;
  e.flash = 0;
  e.slow = 0;
  e.stun = 0;
  e.phase = 0;
  e.tx = 0;
  e.ty = 0;
  e.spawnT = def.tier === 'normal' ? 0.35 : 0.8;
  state.director.spawned++;
  if (def.tier === 'boss') {
    state.director.bossAlive = true;
    state.director.bossSpawned = true;
  }
  state.seen.add(kind);
  state.events.fx.push({ kind: 'enemySpawn', x, y, r: e.r, color: def.color });
  return e;
}

// ---------------- 伤害管线 ----------------

export interface DamageOpts {
  /** 击退强度（像素/秒），0 = 无 */
  knockback?: number;
  /** 来源方向（击退方向），不传则从原点向外 */
  fromX?: number;
  fromY?: number;
  /** 无视白闪直接结算（DoT） */
  noFlash?: boolean;
}

export function dealDamageToEnemy(
  state: RunState,
  e: Enemy,
  raw: number,
  opts: DamageOpts = {},
): { killed: boolean; dealt: number; crit: boolean } {
  if (!e.alive) return { killed: false, dealt: 0, crit: false };
  const crit = rollCrit(state.stats, state.rng);
  const amount = Math.max(1, Math.round(raw * (crit ? state.stats.critMul : 1)));
  e.hp -= amount;
  state.damageDealt += amount;
  if (!opts.noFlash) e.flash = 0.12;
  const killed = e.hp <= 0;

  if (opts.knockback && opts.knockback > 0 && e.knockbackResist < 1) {
    const kb = opts.knockback * (1 - e.knockbackResist);
    const dx = e.x - (opts.fromX ?? e.x - 1);
    const dy = e.y - (opts.fromY ?? e.y);
    const l = Math.hypot(dx, dy) || 1;
    e.vx += (dx / l) * kb;
    e.vy += (dy / l) * kb;
  }

  state.events.damage.push({
    x: e.x + (state.rng.next() - 0.5) * 10,
    y: e.y - e.r * 0.6,
    amount,
    crit,
    toPlayer: false,
    killed,
  });

  if (killed) killEnemy(state, e);
  else state.events.sfx.push({ name: 'hit', v: 0.5, p: 1 + state.rng.range(-0.08, 0.08) });
  return { killed, dealt: amount, crit };
}

/** 击杀结算：经验、分裂、计数、掉落、事件。 */
export function killEnemy(state: RunState, e: Enemy): void {
  if (!e.alive) return;
  const def = ENEMY_DEFS[e.kind];
  state.enemies.despawn(e);
  state.kills++;

  // 经验宝石（精英/Boss 掉大宝石+星核；无尽循环提高宝石价值）
  spawnGem(state, e.x, e.y, e.xp * loopXpMul(state.loop));
  if (e.tier === 'elite') {
    state.elitesKilled++;
    state.cores += 2;
    state.events.sfx.push({ name: 'kill', v: 1, p: 0.6 });
    if (e.kind === 'elite_echo') {
      // 回响体必掉星核拾取物
      spawnPickup(state, 'core', e.x, e.y);
    } else if (state.rng.chance(0.35)) {
      spawnPickup(state, 'heal', e.x, e.y);
    }
  } else if (e.tier === 'boss') {
    state.bossesKilled++;
    state.cores += 10;
    state.director.bossAlive = false;
    state.director.bossDone = true;
    spawnPickup(state, 'heal', e.x, e.y);
    spawnPickup(state, 'bomb', e.x + 30, e.y);
    state.events.sfx.push({ name: 'boss', v: 1, p: 0.5 });
    if (e.kind === 'boss_eye') {
      if (state.mode === 'endless') {
        // 无尽：不结算，进入下一循环（深度 +1，时间轴重放）
        state.loop++;
        state.loopStart = state.time;
        state.director.timelineIdx = 0;
        state.director.phaseIndex = 0;
        state.director.bossDone = false;
        state.banner = { key: 'warning.endless', t: 3.2 };
        state.events.sfx.push({ name: 'evolve', v: 1, p: 0.7 });
      } else {
        state.over = { victory: true, reason: 'bossDown' };
      }
    }
    // Boss 死亡：清屏伤害（爽点）
    state.enemies.forEach((other) => {
      if (other.tier !== 'boss') dealDamageToEnemy(state, other, 9999, { noFlash: false });
    });
  } else {
    // 幸运：普通怪小概率掉落星核拾取物（luck 同时影响升级权重与掉率）
    if (state.rng.chance(0.03 + state.stats.luck * 0.004)) {
      spawnPickup(state, 'core', e.x, e.y);
      state.events.sfx.push({ name: 'kill', v: 0.7, p: 0.9 });
    }
  }

  // 分裂体：shardling → 2 个 mote；splitter/elite_mother → mote 群
  if (def.behavior === 'splitter') {
    const count = def.params?.childCount ?? 2;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + state.rng.next();
      const child = spawnEnemy(state, 'mote', e.x + Math.cos(a) * 14, e.y + Math.sin(a) * 14);
      if (child) {
        child.hp = Math.max(1, Math.round(child.maxHp * 0.6));
        child.spawnT = 0.1;
      }
    }
  }

  state.events.fx.push({ kind: 'enemyDie', x: e.x, y: e.y, r: e.r, color: def.color });
  state.events.sfx.push({ name: 'enemyDie', v: e.tier === 'normal' ? 0.35 : 1, p: 1 + state.rng.range(-0.1, 0.1) });
}

export function spawnGem(state: RunState, x: number, y: number, value: number): void {
  const g = state.gems.spawn();
  if (!g) return;
  g.x = x + state.rng.range(-6, 6);
  g.y = y + state.rng.range(-6, 6);
  g.vx = 0;
  g.vy = 0;
  g.value = value;
  g.pulled = false;
  g.t = 0;
}

export function spawnPickup(state: RunState, kind: 'heal' | 'bomb' | 'core', x: number, y: number): void {
  const p = state.pickups.spawn();
  if (!p) return;
  p.kind = kind;
  p.x = x;
  p.y = y;
  p.t = 0;
}

// ---------------- 玩家受伤 ----------------

export function damagePlayer(state: RunState, raw: number): void {
  const p = state.player;
  if (p.iframe > 0 || state.over) return;
  const dmg = playerDamageTaken(raw, state.stats.armor);
  p.hp -= dmg;
  state.damageTaken += dmg;
  p.iframe = 0.35;
  state.events.damage.push({ x: p.x, y: p.y - 18, amount: dmg, crit: false, toPlayer: true, killed: false });
  state.events.sfx.push({ name: 'hurt', v: 1, p: 1 });

  if (p.hp <= 0) {
    tryRevive(state);
  }
}

/** 死亡时尝试复活；成功返回 true。复活清空周围敌人并给长无敌。 */
export function tryRevive(state: RunState): boolean {
  const p = state.player;
  if (p.reviveUsed >= state.stats.revives) {
    p.hp = 0;
    state.over = { victory: false, reason: 'dead' };
    return false;
  }
  p.reviveUsed++;
  p.hp = state.stats.maxHp * 0.6;
  p.iframe = 2.5;
  state.events.sfx.push({ name: 'revive', v: 1, p: 1 });
  state.events.fx.push({ kind: 'levelUp', x: p.x, y: p.y, r: 120, color: '#ffd75b' });
  state.enemies.forEach((e) => {
    if (e.tier === 'boss') return;
    if (dist2(e.x, e.y, p.x, p.y) < 260 * 260) killEnemy(state, e);
  });
  return true;
}

/** 每步末尾调用：把 fx/sfx 事件截断到合理长度（性能护栏）。 */
export function capEvents(state: RunState, maxFx: number): void {
  if (state.events.fx.length > maxFx) state.events.fx.length = maxFx;
  if (state.events.sfx.length > 24) state.events.sfx.length = 24;
}

/** 通用爆炸：范围内伤害 + fx。 */
export function explode(
  state: RunState,
  x: number,
  y: number,
  radius: number,
  dmg: number,
  color: string,
  grid: EnemyGrid,
  knockback = 60,
): void {
  grid.query(x, y, radius + 40, (e) => {
    if (dist2(x, y, e.x, e.y) <= (radius + e.r) * (radius + e.r)) {
      dealDamageToEnemy(state, e, dmg, { knockback, fromX: x, fromY: y });
    }
  });
  const fx: FxEvent = { kind: 'explosion', x, y, r: radius, color };
  state.events.fx.push(fx);
}

// ---------------- 玩家属性便捷 ----------------

