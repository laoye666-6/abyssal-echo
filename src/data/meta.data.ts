import type { MetaUpgradeNode } from '@/game/types';

/** 星核强化树（跨局持久）。costs 长度 = maxRank。 */
export const META_NODES: MetaUpgradeNode[] = [
  { id: 'vit', maxRank: 5, costs: [15, 35, 70, 120, 190], apply: (s, r) => { s.maxHp += 12 * r; } },
  { id: 'pow', maxRank: 5, costs: [20, 45, 85, 145, 230], apply: (s, r) => { s.damageMul *= 1 + 0.04 * r; } },
  { id: 'spd', maxRank: 4, costs: [18, 40, 78, 135], apply: (s, r) => { s.moveSpeed *= 1 + 0.03 * r; } },
  { id: 'mag', maxRank: 4, costs: [15, 32, 62, 110], apply: (s, r) => { s.pickupRadius *= 1 + 0.12 * r; } },
  { id: 'luck', maxRank: 5, costs: [25, 55, 100, 160, 250], apply: (s, r) => { s.luck += r; } },
  { id: 'revive', maxRank: 1, costs: [380], apply: (s, r) => { s.revives += r; } },
];
