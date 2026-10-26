import type { RunState, Stats, WeaponBehavior, WeaponInstance } from '@/game/types';
import { fireProjectile, levelMul } from './helpers';

/** 新星爆发：环形弹幕。进化 -> nova_collapse（先牵引后爆发）。 */
export const nova: WeaponBehavior = {
  cooldown(level) {
    return 2.7 - 0.12 * (level - 1);
  },
  fire(state: RunState, w: WeaponInstance, stats: Stats): void {
    const evolved = w.id === 'nova_collapse';
    const lv = evolved ? 5 : w.level;
    const rays = evolved ? 18 : 6 + 2 * lv + stats.projCountBonus;
    const dmg = (evolved ? 30 : 11) * levelMul(lv, 0.16) * stats.damageMul;
    const speed = 300 * stats.projSpeedMul;
    const baseA = state.rng.next() * Math.PI * 2;
    for (let i = 0; i < rays; i++) {
      const a = baseA + (i / rays) * Math.PI * 2;
      fireProjectile(state, {
        kind: evolved ? 'nova_collapse' : 'nova',
        x: state.player.x + Math.cos(a) * 12,
        y: state.player.y + Math.sin(a) * 12,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        dmg,
        r: 6 * stats.areaMul,
        life: 0.8,
        pierce: evolved ? 2 : 1,
        color: evolved ? '#ff8b5b' : '#ffb45b',
      });
    }
    state.events.sfx.push({ name: 'shoot', v: 0.4, p: 0.8 });
    if (evolved) {
      // 引力坍缩：牵引周围敌人
      state.enemies.forEach((e) => {
        const dx = state.player.x - e.x;
        const dy = state.player.y - e.y;
        const d = Math.hypot(dx, dy);
        if (d < 180 * stats.areaMul && d > 1 && e.knockbackResist < 1) {
          const pull = 200 * (1 - e.knockbackResist);
          e.vx += (dx / d) * pull;
          e.vy += (dy / d) * pull;
        }
      });
      state.events.fx.push({ kind: 'ring', x: state.player.x, y: state.player.y, r: 180 * stats.areaMul, color: '#ff8b5b' });
    }
  },
};
