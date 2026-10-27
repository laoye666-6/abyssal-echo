import type { CharacterId, DailyModifier, Stats } from '@/game/types';
import { dailySeed } from '@/game/balance';

/** 每日角色轮换名单（不受解锁限制——每日即试用日）。 */
export const DAILY_ROSTER: CharacterId[] = ['peregrine', 'bastion', 'astraeus', 'vesper'];

/**
 * 每日挑战修正器池：种子抽取其一。
 * apply 在 makeRunState 之后、首帧之前调用；直接改 state（stats / 生成乘数 / 初始武器）。
 */
export const DAILY_MODIFIERS: DailyModifier[] = [
  {
    id: 'swift_swarm',
    descKey: 'daily.mod.swift_swarm',
    apply: (s) => {
      s.enemySpeedMul *= 1.15;
      s.stats.xpMul *= 1.2;
    },
  },
  {
    id: 'magnet_storm',
    descKey: 'daily.mod.magnet_storm',
    apply: (s) => {
      s.stats.pickupRadius *= 2;
    },
  },
  {
    id: 'frail_giants',
    descKey: 'daily.mod.frail_giants',
    apply: (s) => {
      s.bossHpMul *= 0.7;
    },
  },
  {
    id: 'thick_hide',
    descKey: 'daily.mod.thick_hide',
    apply: (s) => {
      s.enemyHpMul *= 1.2;
      s.stats.damageMul *= 1.15;
    },
  },
  {
    id: 'head_start',
    descKey: 'daily.mod.head_start',
    apply: (s) => {
      // 初始武器直接 2 级（app.startRun 先 push 初始武器再 apply，这里必中）
      const w = s.weapons[0];
      if (w) w.level = Math.max(w.level, 2);
    },
  },
  {
    id: 'glass_cannon',
    descKey: 'daily.mod.glass_cannon',
    apply: (s) => {
      s.stats.critChance = Math.min(0.95, s.stats.critChance + 0.1);
      s.stats.maxHp = Math.max(40, Math.round(s.stats.maxHp * 0.85));
      s.player.hp = Math.min(s.player.hp, s.stats.maxHp);
    },
  },
];

/** 当日命中的修正器（与 startRun 的抽取保持同一公式）。 */
export function dailyModifierFor(date: string): DailyModifier {
  const seed = dailySeed(date);
  return DAILY_MODIFIERS[seed % DAILY_MODIFIERS.length]!;
}

/**
 * 每日修正器的 Stats 侧效果重放。
 * recomputeStats 会从 角色+元进度+被动 全量重建属性，apply() 在开局写入的
 * stats 改动会被冲掉——升级/被动每次重建后必须按 dailyModifier 重放一次。
 * （enemySpeedMul/enemyHpMul/bossHpMul 挂在 state 上，不受重建影响。）
 */
export function applyDailyStatsMods(modId: string | null, stats: Stats): void {
  switch (modId) {
    case 'swift_swarm':
      stats.xpMul *= 1.2;
      break;
    case 'magnet_storm':
      stats.pickupRadius *= 2;
      break;
    case 'thick_hide':
      stats.damageMul *= 1.15;
      break;
    case 'glass_cannon':
      stats.critChance = Math.min(0.95, stats.critChance + 0.1);
      stats.maxHp = Math.max(40, Math.round(stats.maxHp * 0.85));
      break;
    default:
      break;
  }
}
