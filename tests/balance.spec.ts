import { describe, it, expect } from 'vitest';
import {
  xpToNext,
  enemyHpScale,
  enemyDmgScale,
  playerDamageTaken,
  coresEarned,
  maxEnemiesAt,
  bossHpScale,
} from '@/game/balance';

describe('balance 数值曲线', () => {
  it('xpToNext：level 1 为正，且随等级严格递增', () => {
    expect(xpToNext(1)).toBeGreaterThan(0);
    for (let l = 1; l < 80; l++) {
      expect(xpToNext(l + 1)).toBeGreaterThan(xpToNext(l));
    }
  });

  it('enemyHpScale / enemyDmgScale：t=0 时为 1，随时间单调递增', () => {
    expect(enemyHpScale(0)).toBe(1);
    expect(enemyDmgScale(0)).toBe(1);
    for (let t = 0; t <= 660; t += 30) {
      expect(enemyHpScale(t + 30)).toBeGreaterThan(enemyHpScale(t));
      expect(enemyDmgScale(t + 30)).toBeGreaterThan(enemyDmgScale(t));
    }
  });

  it('playerDamageTaken：armor 线性减伤，但有下限 1', () => {
    expect(playerDamageTaken(10, 0)).toBe(10);
    expect(playerDamageTaken(10, 3)).toBe(7);
    expect(playerDamageTaken(10, 100)).toBe(1); // 护甲高于伤害 -> 下限
    expect(playerDamageTaken(0.5, 0)).toBe(1); // 原始伤害不足 1 -> 下限
  });

  it('coresEarned：胜利额外 +25，随击杀数与存活时间增长', () => {
    const base = coresEarned(0, 0, 0, 0, false);
    expect(base).toBe(0);
    expect(coresEarned(0, 0, 0, 0, true)).toBe(base + 25);
    expect(coresEarned(100, 0, 0, 0, false)).toBeGreaterThan(base);
    expect(coresEarned(0, 0, 0, 120, false)).toBeGreaterThan(base);
    expect(coresEarned(100, 2, 1, 120, true)).toBeGreaterThan(
      coresEarned(100, 2, 1, 120, false),
    );
  });

  it('maxEnemiesAt：结果在 [90, 300] 内且随时间单调不减', () => {
    expect(maxEnemiesAt(0)).toBe(90);
    let prev = maxEnemiesAt(0);
    for (let t = 0; t <= 1200; t += 10) {
      const v = maxEnemiesAt(t);
      expect(v).toBeGreaterThanOrEqual(90);
      expect(v).toBeLessThanOrEqual(300);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
    expect(maxEnemiesAt(10000)).toBe(300); // 远超上限后钳制（上限 2026-10-27 平衡轮 320→300）
  });

  it('bossHpScale 恒大于同一时刻的 enemyHpScale', () => {
    for (let t = 0; t <= 660; t += 60) {
      expect(bossHpScale(t)).toBeGreaterThan(enemyHpScale(t));
    }
  });
});
