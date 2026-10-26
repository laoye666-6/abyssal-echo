import { describe, it, expect } from 'vitest';
import { makeRunState } from '@/game/state';
import { defaultMeta } from '@/core/save';
import { generateChoices, applyOption, isEvolutionEligible, recomputeStats } from '@/game/upgrades';
import type { RunState, UpgradeOption } from '@/game/types';

function makeState(): RunState {
  return makeRunState({ seed: 42, characterId: 'peregrine', meta: defaultMeta() });
}

/** 与 upgrades.keyOf 相同的去重键语义。 */
function optKey(o: UpgradeOption): string {
  switch (o.kind) {
    case 'newWeapon':
    case 'weaponLevel':
    case 'evolution':
      return `w:${o.id}`;
    case 'newPassive':
    case 'passiveLevel':
      return `p:${o.id}`;
    case 'heal':
      return 'heal';
  }
}

describe('upgrades 升级系统', () => {
  it('generateChoices 返回 3 个不重复选项', () => {
    const s = makeState();
    for (let round = 0; round < 10; round++) {
      const choices = generateChoices(s);
      expect(choices).toHaveLength(3);
      const keys = choices.map(optKey);
      expect(new Set(keys).size).toBe(3);
    }
  });

  it('武器满 4 个（MAX_WEAPON_SLOTS）后不再出现 newWeapon 选项', () => {
    const s = makeState();
    const ids = ['pulse', 'orbit', 'nova', 'arc'] as const;
    for (const id of ids) s.weapons.push({ id, level: 1, cd: 0, t: 0 });
    for (let round = 0; round < 10; round++) {
      for (const o of generateChoices(s)) {
        expect(o.kind).not.toBe('newWeapon');
      }
    }
  });

  it('被动满 4 个（MAX_PASSIVE_SLOTS）后不再出现 newPassive 选项', () => {
    const s = makeState();
    const ids = ['overdrive', 'tempo', 'aero', 'vessel'] as const;
    for (const id of ids) s.passives.push({ id, level: 1 });
    for (let round = 0; round < 10; round++) {
      for (const o of generateChoices(s)) {
        expect(o.kind).not.toBe('newPassive');
      }
    }
  });

  describe('isEvolutionEligible', () => {
    it('pulse lv5 + optics lv3 -> true', () => {
      const s = makeState();
      s.weapons.push({ id: 'pulse', level: 5, cd: 0, t: 0 });
      s.passives.push({ id: 'optics', level: 3 });
      expect(isEvolutionEligible(s, 'pulse')).toBe(true);
    });

    it('optics lv2（被动不足 3 级）-> false', () => {
      const s = makeState();
      s.weapons.push({ id: 'pulse', level: 5, cd: 0, t: 0 });
      s.passives.push({ id: 'optics', level: 2 });
      expect(isEvolutionEligible(s, 'pulse')).toBe(false);
    });

    it('pulse lv4（武器未满级）-> false', () => {
      const s = makeState();
      s.weapons.push({ id: 'pulse', level: 4, cd: 0, t: 0 });
      s.passives.push({ id: 'optics', level: 3 });
      expect(isEvolutionEligible(s, 'pulse')).toBe(false);
    });

    it('缺少对应被动 -> false', () => {
      const s = makeState();
      s.weapons.push({ id: 'pulse', level: 5, cd: 0, t: 0 });
      expect(isEvolutionEligible(s, 'pulse')).toBe(false);
    });
  });

  describe('applyOption 各分支', () => {
    it('newWeapon：加入 weapons，等级 1', () => {
      const s = makeState();
      applyOption(s, { kind: 'newWeapon', id: 'orbit' });
      expect(s.weapons).toHaveLength(1);
      expect(s.weapons[0]!.id).toBe('orbit');
      expect(s.weapons[0]!.level).toBe(1);
    });

    it('weaponLevel：提升对应武器等级', () => {
      const s = makeState();
      s.weapons.push({ id: 'pulse', level: 1, cd: 0, t: 0 });
      applyOption(s, { kind: 'weaponLevel', id: 'pulse', toLevel: 3 });
      expect(s.weapons[0]!.level).toBe(3);
    });

    it('heal：恢复生命且不超上限', () => {
      const s = makeState(); // peregrine maxHp = 100
      s.player.hp = 40;
      applyOption(s, { kind: 'heal', amount: 0.2 }); // +20
      expect(s.player.hp).toBe(60);
      applyOption(s, { kind: 'heal', amount: 2 }); // +200 -> 钳到上限
      expect(s.player.hp).toBe(s.stats.maxHp);
    });

    it('evolution：武器 id 就地替换为进化形态', () => {
      const s = makeState();
      s.weapons.push({ id: 'pulse', level: 5, cd: 0, t: 0 });
      s.passives.push({ id: 'optics', level: 3 });
      applyOption(s, { kind: 'evolution', id: 'pulse', into: 'pulse_supernova' });
      expect(s.weapons).toHaveLength(1);
      expect(s.weapons[0]!.id).toBe('pulse_supernova');
      expect(s.weapons[0]!.level).toBe(5);
      expect(s.events.sfx.some((e) => e.name === 'evolve')).toBe(true);
    });

    it('newPassive：加入被动并重算属性（plating +1.5 护甲）', () => {
      const s = makeState();
      applyOption(s, { kind: 'newPassive', id: 'plating' });
      expect(s.passives).toHaveLength(1);
      expect(s.stats.armor).toBeCloseTo(1.5, 5);
    });
  });

  it('recomputeStats：maxHp 增加时当前 hp 同步增加等差值', () => {
    const s = makeState();
    expect(s.stats.maxHp).toBe(100);
    s.player.hp = 40;
    s.passives.push({ id: 'vessel', level: 2 }); // maxHp +50, regen +0.8
    recomputeStats(s);
    expect(s.stats.maxHp).toBe(150);
    expect(s.player.hp).toBe(90); // 40 + 50
    expect(s.stats.regen).toBeCloseTo(0.8, 5);
  });
});
