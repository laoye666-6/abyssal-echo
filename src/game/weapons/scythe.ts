import type { RunState, Stats, WeaponBehavior, WeaponInstance } from '@/game/types';
import { dealDamageToEnemy } from '@/game/combat';
import { levelMul } from './helpers';

/** 归一化角度差到 [-PI, PI]。 */
function angleDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * 虚空收割：朝向锥形挥砍，强击退。无弹道，直接结算。
 * 进化 -> scythe_eclipse 蚀月：360° 环斩，斩杀低血量非 Boss。
 */
export const scythe: WeaponBehavior = {
  cooldown(level) {
    return 1.7 - 0.12 * (level - 1);
  },
  fire(state: RunState, w: WeaponInstance, stats: Stats): void {
    const evolved = w.id === 'scythe_eclipse';
    const lv = evolved ? 5 : w.level;
    const radius = (evolved ? 150 : 95 + 6 * lv) * stats.areaMul;
    const arc = evolved ? Math.PI * 2 : (Math.PI * 2) / 3;
    const dmg = (evolved ? 30 : 16) * levelMul(lv, 0.18) * stats.damageMul;
    const knockback = evolved ? 240 : 170;
    const execute = evolved ? 0.12 : 0;
    const px = state.player.x;
    const py = state.player.y;
    const baseA = state.player.facing;

    state.enemies.forEach((e) => {
      if (e.spawnT > 0 || !e.alive) return;
      const dx = e.x - px;
      const dy = e.y - py;
      const d = Math.hypot(dx, dy);
      if (d > radius + e.r) return;
      if (Math.abs(angleDiff(Math.atan2(dy, dx), baseA)) > arc / 2) return;
      // 蚀月斩杀：非 Boss 且低于 12% 最大生命
      if (execute > 0 && e.tier !== 'boss' && e.hp < e.maxHp * execute) {
        dealDamageToEnemy(state, e, 9999, { noFlash: false });
        return;
      }
      dealDamageToEnemy(state, e, dmg, { knockback, fromX: px, fromY: py });
    });

    state.events.fx.push({
      kind: 'slash',
      x: px,
      y: py,
      r: radius,
      color: evolved ? '#e0c8ff' : '#c8b4ff',
      points: [baseA - arc / 2, baseA + arc / 2],
    });
    state.events.sfx.push({ name: 'shoot', v: 0.45, p: 0.55 });
  },
};
