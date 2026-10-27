import type { WeaponBehavior, WeaponId } from '@/game/types';
import { pulse } from './pulse';
import { orbit } from './orbit';
import { nova } from './nova';
import { shard } from './shard';
import { arc } from './arc';
import { lance } from './lance';
import { drones } from './drones';
import { frost } from './frost';
import { scythe } from './scythe';
import { mines } from './mines';

/** 武器行为注册表：id -> 行为实现（含进化形态）。 */
export const WEAPON_BEHAVIORS: Record<WeaponId, WeaponBehavior> = {
  pulse,
  orbit,
  nova,
  arc,
  lance,
  drones,
  frost,
  shard,
  scythe,
  mines,
  pulse_supernova: pulse,
  orbit_corona: orbit,
  nova_collapse: nova,
  arc_tempest: arc,
  lance_singularity: lance,
  drones_hive: drones,
  frost_zero: frost,
  shard_mirror: shard,
  scythe_eclipse: scythe,
  mines_bloom: mines,
};
