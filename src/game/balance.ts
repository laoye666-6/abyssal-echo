/**
 * 数值平衡 —— 全部纯函数。
 * 调平衡只改这里和 data/，不允许在行为代码里内联魔法数。
 */
import { clamp } from '@/core/math';
import type { Stats } from './types';

/** 运行总时长（秒）—— 9 分钟刷最终 Boss，击败即胜。 */
export const RUN_GOAL_TIME = 540;
/** 超时未击杀最终 Boss 也判负（防止无限拖） */
export const RUN_HARD_CAP = 780;

/** 经验曲线：升到 level+1 所需 XP。 */
export function xpToNext(level: number): number {
  return Math.round(4 + level * 5 + Math.pow(level, 1.6) * 1.5);
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

/** 敌人密度目标：同屏敌人数上限（防止失控堆积导致掉帧与不可读）。 */
export function maxEnemiesAt(t: number): number {
  return Math.round(clamp(90 + t * 0.5, 90, 300));
}

/** 星核结算：击杀 / 精英 / Boss / 存活时间。 */
export function coresEarned(kills: number, elites: number, bosses: number, survivedSec: number, victory: boolean): number {
  const base = Math.floor(kills / 45) + elites * 3 + bosses * 12 + Math.floor(survivedSec / 30);
  return victory ? base + 25 : base;
}

/** Boss 数值成长。 */
export function bossHpScale(t: number): number {
  return enemyHpScale(t) * 1.8;
}

// ---------------- v1.1：无尽模式 ----------------

/** 无尽循环敌人 HP 乘数：每深一层 +12%（绝对时间成长之上再叠）。 */
export function loopHpMul(loop: number): number {
  return Math.pow(1.12, loop);
}

/** 无尽循环经验乘数：保证玩家成长能跟上压力。 */
export function loopXpMul(loop: number): number {
  return 1 + 0.15 * loop;
}

// ---------------- v1.1：每日挑战 ----------------

/** FNV-1a 32 位哈希：把日期字符串折成稳定种子。 */
export function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** 每日种子：同一天恒定。 */
export function dailySeed(dateStr: string): number {
  return fnv1a(`abyssal-daily-${dateStr}`);
}

/** 当日轮换角色（含未解锁角色——每日即试用日）。 */
export function dailyCharacter<T extends string>(dateStr: string, roster: T[]): T {
  const idx = fnv1a(`abyssal-daily-char-${dateStr}`) % roster.length;
  return roster[idx]!;
}

/** 每日得分：击杀 + 存活 + 等级 + 胜利奖励。 */
export function dailyScore(kills: number, survivedSec: number, level: number, victory: boolean): number {
  return kills + Math.floor(survivedSec) * 2 + level * 20 + (victory ? 500 : 0);
}

/** 今日日期字符串（本地时区）。 */
export function todayStr(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
