import type { RunState, Stats, WeaponBehavior, WeaponInstance } from '@/game/types';
import { dealDamageToEnemy, nearestEnemies } from '@/game/combat';
import { levelMul } from './helpers';

/** 链式电弧：闪电在敌人间跳跃，伤害逐跳衰减。进化 -> arc_tempest（高频 + 眩晕）。 */
export const arc: WeaponBehavior = {
  cooldown(level) {
    return 2.0 - 0.1 * (level - 1);
  },
  fire(state: RunState, w: WeaponInstance, stats: Stats): void {
    const evolved = w.id === 'arc_tempest';
    const lv = evolved ? 5 : w.level;
    const chains = evolved ? 9 : 2 + lv + stats.projCountBonus;
    let dmg = (evolved ? 15 : 13) * levelMul(lv, 0.15) * stats.damageMul;
    const range = 260 * stats.areaMul;
    const jumpRange = 150 * stats.areaMul;

    const targets = nearestEnemies(state, state.player.x, state.player.y, range, chains * 2);
    if (targets.length === 0) return;

    const hit = new Set<number>();
    const points: number[] = [state.player.x, state.player.y];
    let fromX = state.player.x;
    let fromY = state.player.y;
    let jumped = 0;

    for (const e of targets) {
      if (jumped >= chains) break;
      if (hit.has(e.id)) continue;
      const d = Math.hypot(e.x - fromX, e.y - fromY);
      const limit = jumped === 0 ? range : jumpRange;
      if (d > limit) continue;
      hit.add(e.id);
      points.push(e.x, e.y);
      dealDamageToEnemy(state, e, dmg, { knockback: 10, fromX, fromY });
      if (evolved) e.stun = Math.max(e.stun, 0.35);
      fromX = e.x;
      fromY = e.y;
      dmg *= 0.78;
      jumped++;
    }

    if (jumped > 0) {
      state.events.fx.push({ kind: 'chain', x: 0, y: 0, color: evolved ? '#ffffff' : '#9bd0ff', points });
      state.events.sfx.push({ name: 'shoot', v: 0.35, p: 1.9 });
    }
  },
};
