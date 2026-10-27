import type { PassiveId, WeaponId } from '@/game/types';

export interface WeaponData {
  id: WeaponId;
  maxLevel: number;
  evolution?: { passive: PassiveId; into: WeaponId };
}

/** 全部武器（含进化形态）的数据定义。行为实现见 src/game/weapons/。 */
export const WEAPON_DATA: Record<WeaponId, WeaponData> = {
  pulse: { id: 'pulse', maxLevel: 5, evolution: { passive: 'optics', into: 'pulse_supernova' } },
  orbit: { id: 'orbit', maxLevel: 5, evolution: { passive: 'plating', into: 'orbit_corona' } },
  nova: { id: 'nova', maxLevel: 5, evolution: { passive: 'vessel', into: 'nova_collapse' } },
  arc: { id: 'arc', maxLevel: 5, evolution: { passive: 'tempo', into: 'arc_tempest' } },
  lance: { id: 'lance', maxLevel: 5, evolution: { passive: 'overdrive', into: 'lance_singularity' } },
  drones: { id: 'drones', maxLevel: 5, evolution: { passive: 'cortex', into: 'drones_hive' } },
  frost: { id: 'frost', maxLevel: 5, evolution: { passive: 'aero', into: 'frost_zero' } },
  shard: { id: 'shard', maxLevel: 5, evolution: { passive: 'magnet', into: 'shard_mirror' } },
  scythe: { id: 'scythe', maxLevel: 5, evolution: { passive: 'aegis', into: 'scythe_eclipse' } },
  mines: { id: 'mines', maxLevel: 5, evolution: { passive: 'greed', into: 'mines_bloom' } },

  pulse_supernova: { id: 'pulse_supernova', maxLevel: 1 },
  orbit_corona: { id: 'orbit_corona', maxLevel: 1 },
  nova_collapse: { id: 'nova_collapse', maxLevel: 1 },
  arc_tempest: { id: 'arc_tempest', maxLevel: 1 },
  lance_singularity: { id: 'lance_singularity', maxLevel: 1 },
  drones_hive: { id: 'drones_hive', maxLevel: 1 },
  frost_zero: { id: 'frost_zero', maxLevel: 1 },
  shard_mirror: { id: 'shard_mirror', maxLevel: 1 },
  scythe_eclipse: { id: 'scythe_eclipse', maxLevel: 1 },
  mines_bloom: { id: 'mines_bloom', maxLevel: 1 },
};

/** 玩家可从升级里获得的"基础武器"清单（不含进化形态）。 */
export const BASE_WEAPONS: WeaponId[] = [
  'pulse', 'orbit', 'nova', 'arc', 'lance', 'drones', 'frost', 'shard',
  'scythe', 'mines',
];

/** 最多同时持有几把武器/被动。 */
export const MAX_WEAPON_SLOTS = 4;
export const MAX_PASSIVE_SLOTS = 4;
