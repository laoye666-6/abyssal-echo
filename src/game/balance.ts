/**
 * 数值平衡 —— 全部纯函数。
 * 调平衡只改这里和 data/，不允许在行为代码里内联魔法数。
 */
import { clamp } from '@/core/math';
import type { Stats } from './types';

/** 运行总时长（秒）—— 9 分钟刷最终 Boss，击败即胜。 */
export const RUN_GOAL_TIME = 540;
/** 超时未击杀最终 Boss 也判负（防止无限拖） */
export const RUN_HARD_CAP = 660;

/** 经验曲线：升到 level+1 所需 XP。 */
export function xpToNext(level: number): number {
  return Math.round(5 + level * 7 + Math.pow(level, 1.6) * 1.6);
}

/** 敌人属性随时间成长。1.0 起步，10 分钟约 6 倍血量、2.6 倍伤害。 */
export function enemyHpScale(t: number): number {
  return 1 + Math.pow(t / 60, 1.42) * 0.42;
}

export function enemyDmgScale(t: number): number {
  return 1 + t / 60 * 0.16;
}

/** 玩家接触伤害结算（考虑护甲），下限 1。 */
export function playerDamageTaken(raw: number, armor: number): number {
  return Math.max(1, raw - armor);
}

/** 判定暴击。 */
export function rollCrit(stats: Stats, rng: { next(): number }): boolean {
  return rng.next() < clamp(stats.critChance, 0, 0.95);
}

/** 武器伤害终值 = 基础 * 等级系数 * 全局倍率，暴击在外层结算。 */
export function weaponDamage(base: number, stats: Stats): number {
  return base * stats.damageMul;
}

/** 敌人密度目标：同屏敌人数上限（防止失控堆积导致掉帧与不可读）。 */
export function maxEnemiesAt(t: number): number {
  return Math.round(clamp(90 + t * 0.55, 90, 320));
}

/** 星核结算：击杀 / 精英 / Boss / 存活时间。 */
export function coresEarned(kills: number, elites: number, bosses: number, survivedSec: number, victory: boolean): number {
  const base = Math.floor(kills / 45) + elites * 3 + bosses * 12 + Math.floor(survivedSec / 30);
  return victory ? base + 25 : base;
}

/** Boss 数值成长。 */
export function bossHpScale(t: number): number {
  return enemyHpScale(t) * 2.2;
}
