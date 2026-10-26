import type { CharacterDef } from '@/game/types';

export const CHARACTER_DEFS: Record<string, CharacterDef> = {
  peregrine: {
    id: 'peregrine',
    stats: { moveSpeed: 232 },
    startWeapon: 'pulse',
  },
  bastion: {
    id: 'bastion',
    stats: { maxHp: 140, armor: 2, pickupRadius: 84 },
    startWeapon: 'orbit',
  },
  astraeus: {
    id: 'astraeus',
    stats: { maxHp: 80, areaMul: 1.25, critChance: 0.15 },
    startWeapon: 'nova',
  },
};
