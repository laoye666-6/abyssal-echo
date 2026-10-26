import type { RunState, Stats, WeaponBehavior, WeaponInstance } from '@/game/types';
import { dealDamageToEnemy, type EnemyGrid } from '@/game/combat';
import { levelMul } from './helpers';

/** 贯穿射线：瞬时线段判定，穿透一切。进化 -> lance_singularity。 */
export const lance: WeaponBehavior = {
  cooldown(level) {
    return 1.8 - 0.1 * (level - 1);
  },
  fire(state: RunState, w: WeaponInstance, stats: Stats): void {
    const evolved = w.id === 'lance_singularity';
    const lv = evolved ? 5 : w.level;
    const dmg = (evolved ? 44 : 20) * levelMul(lv, 0.2) * stats.damageMul;
    const length = (evolved ? 720 : 400 + 30 * lv) * stats.areaMul;
    const width = (evolved ? 30 : 9 + 2.5 * lv) * stats.areaMul;

    // 朝向：优先最近敌人（拉近索敌范围），否则玩家朝向
    let best: { x: number; y: number } | null = null;
    let bestD = 520 * 520;
    state.enemies.forEach((e) => {
      if (e.spawnT > 0) return;
      const d2 = (e.x - state.player.x) ** 2 + (e.y - state.player.y) ** 2;
      if (d2 < bestD) {
        bestD = d2;
        best = { x: e.x, y: e.y };
      }
    });
    let a: number;
    if (best) {
      const b = best as { x: number; y: number };
      a = Math.atan2(b.y - state.player.y, b.x - state.player.x);
    } else {
      a = state.player.facing;
    }

    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const x2 = state.player.x + dx * length;
    const y2 = state.player.y + dy * length;

    // 线段-圆判定：把敌人投影到射线上
    const grid = state.gridRef as EnemyGrid | undefined;
    const tryHit = (e: { x: number; y: number; r: number }) => {
      const relX = e.x - state.player.x;
      const relY = e.y - state.player.y;
      const t = relX * dx + relY * dy;
      if (t < -e.r || t > length + e.r) return false;
      const px = state.player.x + dx * Math.max(0, Math.min(length, t));
      const py = state.player.y + dy * Math.max(0, Math.min(length, t));
      const distToLine = Math.hypot(e.x - px, e.y - py);
      return distToLine <= width / 2 + e.r;
    };

    const hitIds = new Set<number>();
    if (grid) {
      // 沿线段取采样网格查询（粗粒度即可，线段很长）
      const steps = Math.ceil(length / 120);
      for (let i = 0; i <= steps; i++) {
        const sx = state.player.x + dx * (length * i) / steps;
        const sy = state.player.y + dy * (length * i) / steps;
        grid.query(sx, sy, 140, (e) => {
          if (hitIds.has(e.id) || e.spawnT > 0) return;
          if (tryHit(e)) {
            hitIds.add(e.id);
            dealDamageToEnemy(state, e, dmg, { knockback: evolved ? 140 : 90, fromX: state.player.x, fromY: state.player.y });
          }
        });
      }
    }

    state.events.fx.push({
      kind: 'beam', x: state.player.x, y: state.player.y, x2, y2, r: width,
      color: evolved ? '#ffffff' : '#8bfff0',
    });
    state.events.sfx.push({ name: 'shoot', v: 0.5, p: 0.55 });
  },
};
