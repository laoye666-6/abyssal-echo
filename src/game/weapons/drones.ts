import type { Attendant, RunState, Stats, WeaponBehavior, WeaponInstance } from '@/game/types';
import { dealDamageToEnemy, nearestEnemy } from '@/game/combat';
import { levelMul } from './helpers';

/** 蜂群无人机：自主索敌的常驻随从，接触后短暂冷却。进化 -> drones_hive。 */
export const drones: WeaponBehavior = {
  cooldown() {
    return 1;
  },
  fire() {
    /* 常驻型 */
  },
  update(state: RunState, w: WeaponInstance, stats: Stats, dt: number): void {
    const evolved = w.id === 'drones_hive';
    const want = evolved ? 8 : 1 + w.level;
    const dmg = (evolved ? 12 : 8) * levelMul(evolved ? 5 : w.level, 0.16) * stats.damageMul;
    const speed = (evolved ? 300 : 270) * stats.projSpeedMul;

    const mine: Attendant[] = [];
    state.attendants.forEach((a) => {
      if (a.kind === 'drone' && a.ownerWeapon === w.id) mine.push(a);
    });
    while (mine.length > want) {
      const a = mine.pop()!;
      state.attendants.despawn(a);
    }
    while (mine.length < want) {
      const a = state.attendants.spawn();
      if (!a) break;
      a.kind = 'drone';
      a.ownerWeapon = w.id;
      a.x = state.player.x + state.rng.range(-30, 30);
      a.y = state.player.y + state.rng.range(-30, 30);
      a.angle = state.rng.next() * Math.PI * 2;
      a.cd = 0;
      a.dmg = dmg;
      a.r = 7;
      a.data0 = 0;
      mine.push(a);
    }

    for (const d of mine) {
      d.dmg = dmg; // 伤害随属性实时更新
      d.cd -= dt;
      // 目标缓存失效或超时则重找
      const target = nearestEnemy(state, d.x, d.y, 520);
      if (target) {
        const dx = target.x - d.x;
        const dy = target.y - d.y;
        const l = Math.hypot(dx, dy) || 1;
        d.angle = Math.atan2(dy, dx);
        d.x += (dx / l) * speed * dt;
        d.y += (dy / l) * speed * dt;
        if (l < target.r + d.r + 4 && d.cd <= 0) {
          dealDamageToEnemy(state, target, d.dmg, { knockback: 20, fromX: d.x, fromY: d.y });
          d.cd = (evolved ? 0.4 : 0.55) * stats.cooldownMul;
          // 命中后反弹一点，避免贴脸抖动
          d.x -= (dx / l) * 26;
          d.y -= (dy / l) * 26;
        }
      } else {
        // 无目标时环绕玩家
        const p = state.player;
        d.angle += dt * 2.4;
        const tx = p.x + Math.cos(d.angle + d.id) * 46;
        const ty = p.y + Math.sin(d.angle + d.id) * 46;
        d.x += (tx - d.x) * Math.min(1, dt * 5);
        d.y += (ty - d.y) * Math.min(1, dt * 5);
      }
    }
  },
};
