import type { RunState, Stats, WeaponBehavior, WeaponInstance } from '@/game/types';
import { aimNearest, fireProjectile, levelMul } from './helpers';

/** 回响晶刃：弹射晶刃，在敌群之间折射。进化 -> shard_mirror。 */
export const shard: WeaponBehavior = {
  cooldown(level) {
    return 1.6 - 0.08 * (level - 1);
  },
  fire(state: RunState, w: WeaponInstance, stats: Stats): void {
    const evolved = w.id === 'shard_mirror';
    const lv = evolved ? 5 : w.level;
    const count = evolved ? 5 : 2 + (lv >= 4 ? 1 : 0);
    const dmg = (evolved ? 17 : 11) * levelMul(lv, 0.18) * stats.damageMul;
    const speed = 350 * stats.projSpeedMul;
    const bounce = evolved ? 14 : 2 + lv;
    for (let i = 0; i < count; i++) {
      const aim = aimNearest(state);
      const a = Math.atan2(aim.y, aim.x) + (i - (count - 1) / 2) * 0.5 + state.rng.range(-0.2, 0.2);
      fireProjectile(state, {
        kind: evolved ? 'shard_mirror' : 'shard',
        x: state.player.x,
        y: state.player.y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        dmg,
        r: 6 * stats.areaMul,
        life: 4,
        bounce,
        pierce: evolved ? 1 : 0,
        homing: 0.25,
        color: evolved ? '#e0c8ff' : '#b4e0ff',
      });
    }
    state.events.sfx.push({ name: 'shoot', v: 0.3, p: 2.1 });
  },
};
