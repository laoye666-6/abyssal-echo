import type { Attendant, RunState, Stats, WeaponBehavior, WeaponInstance } from '@/game/types';
import { dealDamageToEnemy, type EnemyGrid } from '@/game/combat';
import { dist2 } from '@/core/math';

/** 霜蚀领域：跟随玩家的减速光环，周期性冰晶伤害。进化 -> frost_zero（冻结）。 */
export const frost: WeaponBehavior = {
  cooldown() {
    return 0.5;
  },
  fire() {
    /* 常驻型 */
  },
  update(state: RunState, w: WeaponInstance, stats: Stats, dt: number): void {
    const evolved = w.id === 'frost_zero';
    const radius = (evolved ? 170 : 88 + 12 * w.level) * stats.areaMul;
    const slow = evolved ? 0.6 : 0.28 + 0.04 * w.level;
    const tickDmg = (evolved ? 14 : 4) * (1 + (evolved ? 0 : 0.3 * (w.level - 1))) * stats.damageMul;

    // 单一光环随从
    let aura: Attendant | null = null;
    state.attendants.forEach((a) => {
      if (a.kind === 'aura' && a.ownerWeapon === w.id) aura = a;
    });
    if (!aura) {
      const a = state.attendants.spawn();
      if (!a) return;
      a.kind = 'aura';
      a.ownerWeapon = w.id;
      a.x = state.player.x;
      a.y = state.player.y;
      a.cd = 0;
      a.dmg = tickDmg;
      a.r = radius;
      aura = a;
    }
    const A = aura as Attendant;
    A.x = state.player.x;
    A.y = state.player.y;
    A.r = radius;
    A.dmg = tickDmg;

    A.cd -= dt;
    if (A.cd <= 0) {
      A.cd = 0.5 * stats.cooldownMul;
      const grid = state.gridRef as EnemyGrid | undefined;
      if (!grid) return;
      grid.query(A.x, A.y, radius + 40, (e) => {
        if (e.spawnT > 0) return;
        if (dist2(A.x, A.y, e.x, e.y) <= (radius + e.r) * (radius + e.r)) {
          dealDamageToEnemy(state, e, tickDmg, { noFlash: true });
          e.slow = Math.max(e.slow, slow);
          if (evolved && state.rng.chance(0.15)) {
            e.stun = Math.max(e.stun, 0.8);
            state.events.fx.push({ kind: 'freeze', x: e.x, y: e.y, r: e.r, color: '#bfe8ff' });
          }
        }
      });
    }
  },
};
