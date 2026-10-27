import { describe, it, expect } from 'vitest';
import { makeRunState } from '@/game/state';
import { recomputeStats } from '@/game/upgrades';
import { defaultMeta } from '@/core/save';
import { stepSim } from '@/game/sim';
import { EnemyGrid, spawnEnemy, killEnemy } from '@/game/combat';
import type { Enemy, RunState } from '@/game/types';
import type { SimControl } from '@/game/sim';
import {
  dailySeed, dailyCharacter, dailyScore, todayStr, loopHpMul, loopXpMul, fnv1a,
} from '@/game/balance';
import { DAILY_MODIFIERS, dailyModifierFor } from '@/data/daily.data';

const DT = 1 / 60;
const IDLE: SimControl = { mx: 0, my: 0, dash: false };

function makeState(seed = 7, mode: 'standard' | 'endless' | 'daily' = 'standard'): RunState {
  return makeRunState({ seed, characterId: 'peregrine', meta: defaultMeta(), mode });
}

/** 从敌池里筛 boss。 */
function bossesOf(s: RunState): Enemy[] {
  const out: Enemy[] = [];
  s.enemies.forEach((e) => {
    if (e.tier === 'boss') out.push(e);
  });
  return out;
}

describe('v1.1 运行模式', () => {
  it('标准模式：击杀 boss_eye 判定胜利（v1.0 行为保持）', () => {
    const s = makeState(7, 'standard');
    spawnEnemy(s, 'boss_eye', s.player.x + 40, s.player.y);
    const boss = bossesOf(s)[0]!;
    killEnemy(s, boss);
    expect(s.over).not.toBeNull();
    expect(s.over!.victory).toBe(true);
    expect(s.over!.reason).toBe('bossDown');
    expect(s.loop).toBe(0);
  });

  it('无尽模式：击杀 boss_eye 不结算，深度 +1 且导演时间轴重置', () => {
    const s = makeState(7, 'endless');
    // 推进一点时间，确认 loopStart 覆盖
    for (let i = 0; i < 120; i++) stepSim(s, DT, IDLE, new EnemyGrid()); // 2s
    spawnEnemy(s, 'boss_eye', s.player.x + 40, s.player.y);
    const boss = bossesOf(s)[0]!;
    killEnemy(s, boss);
    expect(s.over).toBeNull();
    expect(s.loop).toBe(1);
    expect(s.loopStart).toBeCloseTo(s.time, 6);
    expect(s.director.timelineIdx).toBe(0);
    expect(s.director.bossDone).toBe(false);
    expect(s.director.bossAlive).toBe(false);
    // 横幅提示无尽开启
    expect(s.banner?.key).toBe('warning.endless');
  });

  it('无尽模式：连续两轮击杀 boss_eye 深度累计到 2（重放的 timeline 可再次触发）', () => {
    const s = makeState(7, 'endless');
    for (let round = 0; round < 2; round++) {
      spawnEnemy(s, 'boss_eye', s.player.x + 40, s.player.y);
      const boss = bossesOf(s).at(-1)!;
      killEnemy(s, boss);
      expect(s.over).toBeNull();
    }
    expect(s.loop).toBe(2);
  });

  it('无尽模式：不受 780s 硬上限影响；标准模式超时判负', () => {
    const endless = makeState(7, 'endless');
    endless.time = 900;
    const g1 = new EnemyGrid();
    stepSim(endless, DT, IDLE, g1);
    expect(endless.over).toBeNull();

    const standard = makeState(7, 'standard');
    standard.time = 900;
    const g2 = new EnemyGrid();
    stepSim(standard, DT, IDLE, g2);
    expect(standard.over).not.toBeNull();
    expect(standard.over!.reason).toBe('timeUp');
  });

  it('循环缩放：loopHpMul 逐层递增，spawnEnemy 在无尽循环中应用 HP 乘数', () => {
    expect(loopHpMul(0)).toBeCloseTo(1, 10);
    expect(loopHpMul(1)).toBeGreaterThan(loopHpMul(0));
    expect(loopHpMul(3)).toBeGreaterThan(loopHpMul(2));
    expect(loopXpMul(2)).toBeCloseTo(1.3, 6);

    const s = makeState(7, 'endless');
    s.loop = 2;
    s.time = 0; // 排除时间成长，隔离循环乘数
    const e = spawnEnemy(s, 'mote', 100, 0)!;
    // mote 基础 8 HP，enemyHpScale(0)=1，loop 2 -> ×1.12²
    expect(e.maxHp).toBe(Math.round(8 * 1.12 * 1.12));
  });

  it('每日：种子/角色/修正器/得分 稳定且决定性', () => {
    // 种子稳定
    expect(dailySeed('2026-10-28')).toBe(dailySeed('2026-10-28'));
    expect(dailySeed('2026-10-28')).not.toBe(dailySeed('2026-10-29'));
    expect(dailySeed('2026-10-28')).toBe(fnv1a('abyssal-daily-2026-10-28'));

    // 角色确定且在名单内
    const roster = ['a', 'b', 'c', 'd'];
    expect(dailyCharacter('2026-10-28', roster)).toBe(dailyCharacter('2026-10-28', roster));
    expect(roster).toContain(dailyCharacter('2026-10-28', roster));

    // 修正器在池内且稳定
    const mod = dailyModifierFor('2026-10-28');
    expect(DAILY_MODIFIERS).toContain(mod);
    expect(dailyModifierFor('2026-10-28')).toBe(mod);

    // 得分公式
    expect(dailyScore(100, 60, 5, false)).toBe(100 + 120 + 100);
    expect(dailyScore(0, 0, 1, true)).toBe(20 + 500);
    // 今日字符串格式
    expect(todayStr(new Date(2026, 9, 28))).toBe('2026-10-28');
  });

  it('每日：makeRunState 应用修正器（magnet_storm 磁吸 ×2）', () => {
    const date = '2026-10-28';
    const seed = dailySeed(date);
    const s = makeRunState({ seed, characterId: 'peregrine', meta: defaultMeta(), mode: 'daily', dailyDate: date });
    s.weapons.push({ id: 'pulse', level: 1, cd: 0.2, t: 0 });
    const mod = dailyModifierFor(date);
    s.dailyModifier = mod.id;
    mod.apply(s);
    if (mod.id === 'magnet_storm') {
      expect(s.stats.pickupRadius).toBeCloseTo(180, 4);
    } else {
      // 其他修正器不改变磁吸基准 90
      expect(s.stats.pickupRadius).toBeCloseTo(90, 4);
    }
    expect(s.dailyDate).toBe(date);
  });

  it('每日修正器 Stats 侧效果在 recomputeStats 重建后不丢失', () => {
    const s = makeState(7);
    s.mode = 'daily';
    s.dailyModifier = 'glass_cannon';
    const mod = DAILY_MODIFIERS.find((m) => m.id === 'glass_cannon')!;
    mod.apply(s);
    const crit0 = s.stats.critChance;
    // 升级被动触发全量重建
    s.passives.push({ id: 'vessel', level: 1 });
    recomputeStats(s);
    expect(s.stats.critChance).toBeCloseTo(crit0, 6);
    // 重放语义：对重建后的总血量乘 0.85 —— (100 基础 + 25 vessel) × 0.85 = 106
    expect(s.stats.maxHp).toBe(106);
    // thick_hide 伤害重放
    const s2 = makeState(7);
    s2.mode = 'daily';
    s2.dailyModifier = 'thick_hide';
    DAILY_MODIFIERS.find((m) => m.id === 'thick_hide')!.apply(s2);
    const dmg0 = s2.stats.damageMul;
    s2.passives.push({ id: 'overdrive', level: 1 });
    recomputeStats(s2);
    expect(s2.stats.damageMul).toBeCloseTo(dmg0 * 1.08, 6); // overdrive ×1.08，thick_hide ×1.15 已重放
  });
});
