import type { RunState, Stats, WeaponBehavior, WeaponInstance } from '@/game/types';
import { explode, dealDamageToEnemy, type EnemyGrid } from '@/game/combat';
import { dist2 } from '@/core/math';
import { levelMul } from './helpers';

/**
 * 星棘雷：周期布设感应地雷。敌近即爆或 6s 后自爆（AoE）。
 * 进化 -> mines_bloom 星棘花海：双雷连布，爆炸留下 2.5s 持续伤害区。
 * 实现：地雷/伤害区都是 Projectile（kind mine/mine_bloom），由本武器 update 驱动。
 *   mine:       data0 = 布防倒计时
 *   mine_bloom: data1 = 1 表示伤害区（data0 = 跳伤计时，用 rehit 承载）
 */
const MINE_LIFE = 6;
const ARM_TIME = 0.4;
const TRIGGER_DIST = 70;
const FIELD_LIFE = 2.5;
const FIELD_REHIT = 0.5;

function mineDmg(w: WeaponInstance, stats: Stats): number {
  const evolved = w.id === 'mines_bloom';
  const lv = evolved ? 5 : w.level;
  return (evolved ? 26 : 15) * levelMul(lv, 0.17) * stats.damageMul;
}

function spawnMine(state: RunState, kind: 'mine' | 'mine_bloom', dmg: number, areaMul: number): void {
  const p = state.projectiles.spawn();
  if (!p) return;
  const a = state.rng.next() * Math.PI * 2;
  const r = state.rng.range(10, 55) * areaMul;
  p.kind = kind;
  p.x = state.player.x + Math.cos(a) * r;
  p.y = state.player.y + Math.sin(a) * r;
  p.vx = 0;
  p.vy = 0;
  p.dmg = dmg;
  p.r = 7 * areaMul;
  p.life = MINE_LIFE;
  p.pierce = 0;
  p.bounce = 0;
  p.homing = 0;
  p.hitIds = null;
  p.rehit = 0;
  p.color = kind === 'mine_bloom' ? '#7affd0' : '#a8f4ff';
  p.data0 = ARM_TIME;
  p.data1 = 0;
}

function spawnField(state: RunState, x: number, y: number, radius: number, dmg: number): void {
  const f = state.projectiles.spawn();
  if (!f) return;
  f.kind = 'mine_bloom';
  f.x = x;
  f.y = y;
  f.vx = 0;
  f.vy = 0;
  f.dmg = dmg;
  f.r = radius;
  f.life = FIELD_LIFE;
  f.pierce = 0;
  f.bounce = 0;
  f.homing = 0;
  f.hitIds = null;
  f.rehit = FIELD_REHIT;
  f.color = '#7affd0';
  f.data0 = 0;
  f.data1 = 1;
}

function detonate(
  state: RunState,
  x: number,
  y: number,
  bloom: boolean,
  dmg: number,
  areaMul: number,
  grid: EnemyGrid | undefined,
): void {
  const radius = (bloom ? 125 : 105) * areaMul;
  if (grid) explode(state, x, y, radius, dmg, bloom ? '#7affd0' : '#a8f4ff', grid, 110);
  if (bloom) spawnField(state, x, y, radius * 0.85, dmg);
}

export const mines: WeaponBehavior = {
  cooldown(level) {
    return Math.max(1.1, 2.4 - 0.14 * (level - 1));
  },
  fire(state: RunState, w: WeaponInstance, stats: Stats): void {
    const evolved = w.id === 'mines_bloom';
    const count = evolved ? 2 : 1 + (w.level >= 4 ? 1 : 0);
    const dmg = mineDmg(w, stats);
    for (let i = 0; i < count; i++) {
      spawnMine(state, evolved ? 'mine_bloom' : 'mine', dmg, stats.areaMul);
    }
    state.events.sfx.push({ name: 'shoot', v: 0.2, p: 0.5 });
  },
  update(state: RunState, _w: WeaponInstance, stats: Stats, dt: number): void {
    const grid = state.gridRef as EnemyGrid | undefined;
    const areaMul = stats.areaMul;
    state.projectiles.forEach((pr) => {
      if (!pr.alive) return;
      if (pr.kind !== 'mine' && pr.kind !== 'mine_bloom') return;

      if (pr.data1 === 1) {
        // 伤害区：周期跳伤
        pr.rehit -= dt;
        if (pr.rehit <= 0 && grid) {
          pr.rehit = FIELD_REHIT;
          grid.query(pr.x, pr.y, pr.r + 40, (e) => {
            if (e.spawnT > 0) return;
            if (dist2(pr.x, pr.y, e.x, e.y) <= (pr.r + e.r) * (pr.r + e.r)) {
              dealDamageToEnemy(state, e, pr.dmg * 0.35, { noFlash: true, knockback: 0 });
            }
          });
        }
        return;
      }

      // 地雷：布防 → 感应起爆（寿命耗尽也起爆）
      if (pr.data0 > 0) {
        pr.data0 -= dt;
        return;
      }
      let trigger = false;
      if (grid) {
        const reach = TRIGGER_DIST * areaMul;
        grid.query(pr.x, pr.y, reach + 40, (e) => {
          if (trigger || e.spawnT > 0) return;
          const rr = (reach + e.r) * (reach + e.r);
          if (dist2(pr.x, pr.y, e.x, e.y) <= rr) trigger = true;
        });
      }
      if (trigger || pr.life <= dt) {
        detonate(state, pr.x, pr.y, pr.kind === 'mine_bloom', pr.dmg, areaMul, grid);
        state.projectiles.despawn(pr);
      }
    });
  },
};
