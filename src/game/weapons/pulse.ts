import type { RunState, Stats, WeaponBehavior, WeaponInstance } from '@/game/types';
import { aimNearest, fireProjectile, levelMul } from './helpers';

/** 脉冲星尘：追踪弹。进化 -> pulse_supernova（命中迸裂成环）。 */
export const pulse: WeaponBehavior = {
  cooldown(level) {
    return 0.85 - 0.05 * (level - 1);
  },
  fire(state: RunState, w: WeaponInstance, stats: Stats): void {
    const evolved = w.id === 'pulse_supernova';
    const lv = evolved ? 5 : w.level;
    const count = evolved ? 3 : 1 + (lv >= 3 ? 1 : 0) + (lv >= 5 ? 1 : 0) + stats.projCountBonus;
    const dmg = (evolved ? 18 : 10) * levelMul(lv, 0.15) * stats.damageMul;
    const speed = 430 * stats.projSpeedMul;
    const aim = aimNearest(state);
    const spread = 0.14;
    for (let i = 0; i < count; i++) {
      const off = count > 1 ? (i - (count - 1) / 2) * spread : 0;
      const a = Math.atan2(aim.y, aim.x) + off;
      fireProjectile(state, {
        kind: evolved ? 'pulse_supernova' : 'pulse',
        x: state.player.x + Math.cos(a) * 14,
        y: state.player.y + Math.sin(a) * 14,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        dmg,
        r: evolved ? 8 : 5,
        life: 2.2,
        homing: evolved ? 0.7 : 0.55,
        color: evolved ? '#ffe45b' : '#5be7ff',
        data0: evolved ? Math.round(10 * stats.damageMul * stats.areaMul) : 0,
      });
    }
    state.events.sfx.push({ name: 'shoot', v: 0.25, p: 1.6 });
  },
};
