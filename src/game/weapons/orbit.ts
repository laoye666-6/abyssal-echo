import type { Attendant, RunState, Stats, WeaponBehavior, WeaponInstance } from '@/game/types';
import { dist2 } from '@/core/math';
import { dealDamageToEnemy, type EnemyGrid } from '@/game/combat';

/**
 * 星环刃：环绕玩家的常驻刀刃，接触伤害 + 单体重伤间隔。
 * 进化 -> orbit_corona：更大更快，附带灼烧。
 */
function bladeCount(id: string, level: number): number {
  if (id === 'orbit_corona') return 8;
  return 1 + level; // 2..6
}

function orbitRadius(id: string, level: number, areaMul: number): number {
  if (id === 'orbit_corona') return 105 * areaMul;
  return (58 + 8 * level) * areaMul;
}

function bladeDmg(id: string, level: number, damageMul: number): number {
  if (id === 'orbit_corona') return 26 * damageMul;
  return 13 * (1 + 0.18 * (level - 1)) * damageMul;
}

function rehitOf(id: string): number {
  return id === 'orbit_corona' ? 0.3 : 0.45;
}

function angSpeed(id: string, level: number): number {
  if (id === 'orbit_corona') return 3.0;
  return 2.2 + 0.15 * (level - 1);
}

export const orbit: WeaponBehavior = {
  cooldown() {
    return 1;
  },
  fire() {
    /* 常驻型：无开火 */
  },
  update(state: RunState, w: WeaponInstance, stats: Stats, dt: number): void {
    const want = bladeCount(w.id, w.level);
    // 同步随从数量
    const mine: Attendant[] = [];
    state.attendants.forEach((a) => {
      if (a.kind === 'orbit' && (a.ownerWeapon === w.id || a.ownerWeapon === 'orbit' || a.ownerWeapon === 'orbit_corona')) mine.push(a);
    });
    // 去重：只保留本武器实例的（进化时 ownerWeapon 已更换）
    while (mine.length > want) {
      const a = mine.pop()!;
      state.attendants.despawn(a);
    }
    while (mine.length < want) {
      const a = state.attendants.spawn();
      if (!a) break;
      a.kind = 'orbit';
      a.ownerWeapon = w.id;
      a.angle = (mine.length / want) * Math.PI * 2;
      a.cd = 0;
      a.dmg = bladeDmg(w.id, w.level, stats.damageMul);
      a.r = 9 * Math.max(1, stats.areaMul * 0.9);
      mine.push(a);
    }

    const baseA = (w.t += angSpeed(w.id, w.level) * dt);
    const R = orbitRadius(w.id, w.level, stats.areaMul);
    const rehit = rehitOf(w.id);
    const grid = state.gridRef as EnemyGrid | undefined;
    const p = state.player;

    for (let i = 0; i < mine.length; i++) {
      const a = mine[i]!;
      a.angle = baseA + (i / mine.length) * Math.PI * 2;
      a.x = p.x + Math.cos(a.angle) * R;
      a.y = p.y + Math.sin(a.angle) * R;
      a.cd -= dt;
      if (a.cd <= 0 && grid) {
        let hit = false;
        grid.query(a.x, a.y, a.r + 30, (e) => {
          if (hit) return;
          if (dist2(a.x, a.y, e.x, e.y) <= (a.r + e.r) * (a.r + e.r)) {
            dealDamageToEnemy(state, e, a.dmg, { knockback: 40, fromX: p.x, fromY: p.y });
            a.cd = rehit * stats.cooldownMul;
            hit = true;
          }
        });
      }
    }
  },
};
