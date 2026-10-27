import { Rng } from '@/core/rng';
import { Pool } from '@/core/pool';
import { makeStats } from './types';
import type {
  Attendant, CharacterId, Enemy, EBullet, Gem, Pickup, Projectile, RunConfig, RunState, Stats,
} from './types';
import { xpToNext } from './balance';
import { CHARACTER_DEFS } from '@/data/characters.data';
import { META_NODES } from '@/data/meta.data';

export function makeStatsForCharacter(charId: CharacterId, meta: RunConfig['meta']): Stats {
  const stats = makeStats();
  const char = CHARACTER_DEFS[charId];
  if (char) {
    for (const [k, v] of Object.entries(char.stats)) {
      const key = k as keyof Stats;
      // 角色数据里的值是"绝对覆盖"（如 maxHp/speed 基线）
      (stats as Record<keyof Stats, number>)[key] = v as number;
    }
  }
  for (const node of META_NODES) {
    const rank = meta.upgrades[node.id] ?? 0;
    if (rank > 0) node.apply(stats, rank);
  }
  return stats;
}

export function makeRunState(cfg: RunConfig): RunState {
  const stats = makeStatsForCharacter(cfg.characterId, cfg.meta);
  const state: RunState = {
    time: 0,
    rng: new Rng(cfg.seed),
    mode: cfg.mode ?? 'standard',
    loop: 0,
    loopStart: 0,
    evolutions: 0,
    dailyDate: cfg.dailyDate ?? null,
    dailyModifier: null,
    enemySpeedMul: 1,
    enemyHpMul: 1,
    bossHpMul: 1,
    characterId: cfg.characterId,
    player: {
      x: 0, y: 0, vx: 0, vy: 0,
      hp: stats.maxHp,
      iframe: 0,
      facing: -Math.PI / 2,
      dashCd: 0,
      dashT: 0,
      reviveUsed: 0,
      contactAcc: 0,
      contactT: 0,
    },
    stats,
    enemies: new Pool<Enemy>(() => ({
      id: 0, alive: false, kind: 'mote', x: 0, y: 0, vx: 0, vy: 0,
      hp: 1, maxHp: 1, r: 10, speed: 50, contactDps: 8, xp: 1,
      tier: 'normal', knockbackResist: 0, t: 0, flash: 0, slow: 0, stun: 0,
      phase: 0, tx: 0, ty: 0, spawnT: 0,
    }), 420),
    projectiles: new Pool<Projectile>(() => ({
      id: 0, alive: false, kind: 'pulse', x: 0, y: 0, vx: 0, vy: 0,
      r: 5, dmg: 10, life: 2, pierce: 0, bounce: 0, homing: 0,
      hitIds: null, rehit: 0, color: '#5be7ff', data0: 0, data1: 0,
    }), 700),
    ebullets: new Pool<EBullet>(() => ({
      id: 0, alive: false, x: 0, y: 0, vx: 0, vy: 0, r: 6, dmg: 10, life: 6,
    }), 260),
    gems: new Pool<Gem>(() => ({
      id: 0, alive: false, x: 0, y: 0, vx: 0, vy: 0, value: 1, pulled: false, t: 0,
    }), 900),
    pickups: new Pool<Pickup>(() => ({
      id: 0, alive: false, kind: 'heal', x: 0, y: 0, t: 0,
    }), 24),
    attendants: new Pool<Attendant>(() => ({
      id: 0, alive: false, kind: 'orbit', ownerWeapon: 'orbit',
      x: 0, y: 0, angle: 0, r: 10, dmg: 10, cd: 0, data0: 0,
    }), 64),
    weapons: [],
    passives: [],
    level: 1,
    xp: 0,
    xpToNext: xpToNext(1),
    pendingLevelUps: 0,
    kills: 0,
    elitesKilled: 0,
    bossesKilled: 0,
    damageDealt: 0,
    damageTaken: 0,
    cores: 0,
    director: {
      phaseIndex: 0, phaseT: 0, spawnBudget: 0, spawned: 0,
      timelineIdx: 0, intensity: 0.25, bossAlive: false, bossSpawned: false, bossDone: false,
      leashT: 0.5,
    },
    events: { damage: [], fx: [], sfx: [] },
    over: null,
    seen: new Set<string>(),
    banner: null,
    sfxThrottle: 0,
    metaRef: cfg.meta,
  };
  return state;
}

/** 清空一次性事件队列（渲染/音频消费后调用）。 */
export function drainEvents(state: RunState): void {
  state.events.damage.length = 0;
  state.events.fx.length = 0;
  state.events.sfx.length = 0;
}
