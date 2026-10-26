import type { PassiveDef, PassiveId } from '@/game/types';

/** 8 条被动。apply 为纯函数：把等级效果写进 Stats。 */
export const PASSIVE_DEFS: Record<PassiveId, PassiveDef> = {
  overdrive: {
    id: 'overdrive',
    maxLevel: 5,
    apply: (s, lv) => { s.damageMul *= 1 + 0.08 * lv; },
  },
  tempo: {
    id: 'tempo',
    maxLevel: 5,
    apply: (s, lv) => { s.cooldownMul *= Math.max(0.4, 1 - 0.07 * lv); },
  },
  aero: {
    id: 'aero',
    maxLevel: 5,
    apply: (s, lv) => { s.moveSpeed *= 1 + 0.07 * lv; },
  },
  vessel: {
    id: 'vessel',
    maxLevel: 5,
    apply: (s, lv) => { s.maxHp += 25 * lv; s.regen += 0.4 * lv; },
  },
  magnet: {
    id: 'magnet',
    maxLevel: 5,
    apply: (s, lv) => { s.pickupRadius *= 1 + 0.3 * lv; },
  },
  optics: {
    id: 'optics',
    maxLevel: 5,
    apply: (s, lv) => { s.critChance += 0.06 * lv; s.critMul += 0.15 * lv; },
  },
  cortex: {
    id: 'cortex',
    maxLevel: 5,
    apply: (s, lv) => { s.xpMul *= 1 + 0.12 * lv; },
  },
  plating: {
    id: 'plating',
    maxLevel: 5,
    apply: (s, lv) => { s.armor += 1.5 * lv; },
  },
};
