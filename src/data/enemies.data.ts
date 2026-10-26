import type { EnemyDef, EnemyKindId } from '@/game/types';

/**
 * 敌人基础数值（t=0 时的值；随时间经 balance.enemyHpScale/enemyDmgScale 成长）。
 * color 为渲染层语义色。
 */
export const ENEMY_DEFS: Record<EnemyKindId, EnemyDef> = {
  mote: {
    id: 'mote', behavior: 'chaser',
    hp: 8, speed: 76, contactDps: 8, radius: 10, xp: 1,
    weight: 100, batch: 5, knockbackResist: 0.15, tier: 'normal',
    color: '#8fe86b',
  },
  dart: {
    id: 'dart', behavior: 'chaser',
    hp: 14, speed: 118, contactDps: 10, radius: 11, xp: 2,
    weight: 60, batch: 3, knockbackResist: 0.1, tier: 'normal',
    color: '#5bc8ff',
  },
  stinger: {
    id: 'stinger', behavior: 'weaver',
    hp: 20, speed: 95, contactDps: 12, radius: 12, xp: 3,
    weight: 45, batch: 3, knockbackResist: 0.1, tier: 'normal',
    color: '#ffd75b',
    params: { weaveAmp: 46, weaveFreq: 3.2 },
  },
  shardling: {
    id: 'shardling', behavior: 'splitter',
    hp: 32, speed: 64, contactDps: 12, radius: 14, xp: 3,
    weight: 38, batch: 2, knockbackResist: 0.2, tier: 'normal',
    color: '#ff9e5b',
    params: { childId: 0, childCount: 2 }, // childId 运行时映射到 mote
  },
  warden: {
    id: 'warden', behavior: 'shooter',
    hp: 42, speed: 58, contactDps: 14, radius: 13, xp: 5,
    weight: 26, batch: 1, knockbackResist: 0.3, tier: 'normal',
    color: '#c65bff',
    params: { keepDist: 240, fireCd: 2.4, bulletSpeed: 130, bulletDmg: 12 },
  },
  splitter: {
    id: 'splitter', behavior: 'splitter',
    hp: 95, speed: 46, contactDps: 16, radius: 21, xp: 8,
    weight: 18, batch: 1, knockbackResist: 0.45, tier: 'normal',
    color: '#5bffa8',
    params: { childId: 1, childCount: 3 },
  },
  bulwark: {
    id: 'bulwark', behavior: 'tank',
    hp: 170, speed: 36, contactDps: 22, radius: 23, xp: 10,
    weight: 13, batch: 1, knockbackResist: 0.85, tier: 'normal',
    color: '#ff5b7a',
  },
  phase: {
    id: 'phase', behavior: 'phaser',
    hp: 55, speed: 82, contactDps: 15, radius: 12, xp: 6,
    weight: 15, batch: 1, knockbackResist: 0.2, tier: 'normal',
    color: '#b45bff',
    params: { tpCd: 5, tpDist: 220 },
  },

  // ------- 精英（时间轴投放） -------
  elite_haste: {
    id: 'elite_haste', behavior: 'chaser',
    hp: 420, speed: 158, contactDps: 30, radius: 20, xp: 30,
    weight: 0, batch: 1, knockbackResist: 0.5, tier: 'elite',
    color: '#ffe45b',
  },
  elite_shield: {
    id: 'elite_shield', behavior: 'tank',
    hp: 900, speed: 44, contactDps: 26, radius: 26, xp: 40,
    weight: 0, batch: 1, knockbackResist: 0.95, tier: 'elite',
    color: '#ff7ab0',
  },
  elite_mother: {
    id: 'elite_mother', behavior: 'splitter',
    hp: 760, speed: 52, contactDps: 24, radius: 25, xp: 40,
    weight: 0, batch: 1, knockbackResist: 0.6, tier: 'elite',
    color: '#7affd0',
    params: { childId: 0, childCount: 4, spawnCd: 4 },
  },

  // ------- Boss -------
  boss_devourer: {
    id: 'boss_devourer', behavior: 'chaser',
    hp: 2600, speed: 74, contactDps: 40, radius: 34, xp: 80,
    weight: 0, batch: 1, knockbackResist: 1, tier: 'boss',
    color: '#ff5b5b',
  },
  boss_eye: {
    id: 'boss_eye', behavior: 'chaser',
    hp: 6600, speed: 58, contactDps: 50, radius: 40, xp: 120,
    weight: 0, batch: 1, knockbackResist: 1, tier: 'boss',
    color: '#ff4bd8',
  },
};
