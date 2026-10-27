import { describe, it, expect } from 'vitest';
import { makeRunState } from '@/game/state';
import { defaultMeta } from '@/core/save';
import type { MetaSnapshot, RunState } from '@/game/types';
import {
  ACHIEVEMENTS, evaluateLive, evaluateAfterRun, evaluateMeta, achievementProgress,
  type RunSummaryLite,
} from '@/game/achievements';

function makeState(seed = 7): RunState {
  return makeRunState({ seed, characterId: 'peregrine', meta: defaultMeta() });
}

function meta(): MetaSnapshot {
  return defaultMeta();
}

function summary(patch: Partial<RunSummaryLite>): RunSummaryLite {
  return {
    kills: 0, elitesKilled: 0, bossesKilled: 0, time: 0, level: 1,
    cores: 0, victory: false, evolutions: 0, mode: 'standard', depth: 1,
    weapons: ['pulse'], characterId: 'peregrine',
    ...patch,
  };
}

describe('achievements 成就系统', () => {
  it('成就清单：20 个，id 唯一', () => {
    expect(ACHIEVEMENTS.length).toBe(20);
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(20);
  });

  it('evaluateLive：单局击杀阈值（century 100 / legion 500）', () => {
    const s = makeState();
    const m = meta();
    s.kills = 99;
    expect(evaluateLive(s, m)).not.toContain('century');
    s.kills = 100;
    expect(evaluateLive(s, m)).toContain('century');
    // 已解锁不再返回
    m.achievements.century = 1;
    expect(evaluateLive(s, m)).not.toContain('century');
  });

  it('evaluateLive：flawless 需要 300s 且零受伤', () => {
    const s = makeState();
    const m = meta();
    s.time = 300;
    s.damageTaken = 1;
    expect(evaluateLive(s, m)).not.toContain('flawless');
    s.damageTaken = 0;
    expect(evaluateLive(s, m)).toContain('flawless');
    // 299s 不算
    const s2 = makeState();
    s2.time = 299;
    expect(evaluateLive(s2, meta())).not.toContain('flawless');
  });

  it('evaluateLive：maxed_weapon 满级或进化形态均算', () => {
    const s = makeState();
    s.weapons.push({ id: 'pulse', level: 4, cd: 1, t: 0 });
    expect(evaluateLive(s, meta())).not.toContain('maxed_weapon');
    s.weapons[0]!.level = 5;
    expect(evaluateLive(s, meta())).toContain('maxed_weapon');
    // 进化形态 maxLevel=1
    const s2 = makeState();
    s2.weapons.push({ id: 'pulse_supernova', level: 1, cd: 1, t: 0 });
    expect(evaluateLive(s2, meta())).toContain('maxed_weapon');
  });

  it('evaluateLive：full_arsenal 四武器栏、triple_evolution 三次进化', () => {
    const s = makeState();
    for (const id of ['pulse', 'orbit', 'nova'] as const) {
      s.weapons.push({ id, level: 1, cd: 1, t: 0 });
    }
    expect(evaluateLive(s, meta())).not.toContain('full_arsenal');
    s.weapons.push({ id: 'arc', level: 1, cd: 1, t: 0 });
    expect(evaluateLive(s, meta())).toContain('full_arsenal');

    const s2 = makeState();
    s2.evolutions = 3;
    expect(evaluateLive(s2, meta())).toContain('triple_evolution');
  });

  it('evaluateLive：无尽 depth_2/depth_5 按循环数（HUD 深度 = loop+1）', () => {
    const s = makeState();
    const m = meta();
    s.loop = 1;
    expect(evaluateLive(s, m)).not.toContain('depth_2'); // standard 模式不算
    s.mode = 'endless';
    expect(evaluateLive(s, m)).toContain('depth_2');
    s.loop = 4;
    expect(evaluateLive(s, m)).toContain('depth_5');
  });

  it('evaluateAfterRun：首局/胜利/每日/星核/次数类', () => {
    const m = meta();
    expect(evaluateAfterRun(summary({}), m)).not.toContain('first_echo');
    m.runs = 1;
    expect(evaluateAfterRun(summary({}), m)).toContain('first_echo');

    expect(evaluateAfterRun(summary({ victory: true }), meta())).toContain('eye_slayer');
    expect(evaluateAfterRun(summary({ bossesKilled: 1 }), meta())).toContain('devourer_slayer');
    expect(evaluateAfterRun(summary({ bossesKilled: 0, victory: true }), meta())).not.toContain('devourer_slayer');
    expect(evaluateAfterRun(summary({ mode: 'daily' }), meta())).toContain('daily_omen');
    expect(evaluateAfterRun(summary({ cores: 15 }), meta())).toContain('core_harvest');
    expect(evaluateAfterRun(summary({ cores: 14 }), meta())).not.toContain('core_harvest');
    expect(evaluateAfterRun(summary({ evolutions: 1 }), meta())).toContain('first_evolution');
    expect(evaluateAfterRun(summary({ kills: 100, time: 305 }), meta())).toContain('century');
  });

  it('evaluateAfterRun：无尽深度按到达深度（depth = loop+1）', () => {
    expect(evaluateAfterRun(summary({ mode: 'endless', depth: 2 }), meta())).toContain('depth_2');
    expect(evaluateAfterRun(summary({ mode: 'endless', depth: 1 }), meta())).not.toContain('depth_2');
    expect(evaluateAfterRun(summary({ mode: 'endless', depth: 5 }), meta())).toContain('depth_5');
  });

  it('evaluateMeta：core_mogul / veteran / forge_master / trifecta', () => {
    const m = meta();
    m.totalCoresEarned = 999;
    expect(evaluateMeta(m)).not.toContain('core_mogul');
    m.totalCoresEarned = 1000;
    expect(evaluateMeta(m)).toContain('core_mogul');

    const m2 = meta();
    m2.runs = 25;
    expect(evaluateMeta(m2)).toContain('veteran');

    const m3 = meta();
    m3.upgrades.vit = 4; // 未满
    expect(evaluateMeta(m3)).not.toContain('forge_master');
    m3.upgrades.vit = 5; // META_NODES vit maxRank=5
    expect(evaluateMeta(m3)).toContain('forge_master');

    const m4 = meta();
    m4.charWins = { peregrine: 2, bastion: 1 };
    expect(evaluateMeta(m4)).not.toContain('trifecta');
    m4.charWins.astraeus = 1;
    expect(evaluateMeta(m4)).toContain('trifecta');
  });

  it('progress：有进度定义的成就返回 [当前,目标] 且不越界', () => {
    const m = meta();
    m.bestKills = 250;
    const def = ACHIEVEMENTS.find((a) => a.id === 'legion')!;
    const prog = achievementProgress(def, m);
    expect(prog).not.toBeNull();
    expect(prog![0]).toBe(250);
    expect(prog![1]).toBe(500);
    // 无 progress 的成就返回 null
    const devourer = ACHIEVEMENTS.find((a) => a.id === 'devourer_slayer')!;
    expect(achievementProgress(devourer, m)).toBeNull();
  });
});
