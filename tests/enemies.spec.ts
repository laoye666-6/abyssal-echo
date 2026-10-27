import { describe, it, expect } from 'vitest';
import { makeRunState } from '@/game/state';
import { defaultMeta } from '@/core/save';
import { stepSim } from '@/game/sim';
import { EnemyGrid, spawnEnemy } from '@/game/combat';
import type { RunState } from '@/game/types';

const DT = 1 / 60;

function makeState(seed = 7): RunState {
  return makeRunState({ seed, characterId: 'peregrine', meta: defaultMeta() });
}

describe('v1.1 回响体 dasher 行为', () => {
  it('蓄力后真实突进：20s 内 e.t 置位且位移速度远超常速', () => {
    const s = makeState();
    const grid = new EnemyGrid();
    // 回响体生成在玩家旁 200px（跳过时间轴）
    const e = spawnEnemy(s, 'elite_echo', s.player.x + 200, s.player.y)!;
    e.spawnT = 0;
    let maxDashT = 0;
    let maxSpeed = 0;
    for (let i = 0; i < 60 * 20; i++) {
      s.enemies.forEach((en) => grid.insert(en));
      stepSim(s, DT, { mx: 0, my: 0, dash: false }, grid);
      if (e.alive) {
        maxDashT = Math.max(maxDashT, e.t);
        maxSpeed = Math.max(maxSpeed, Math.hypot(e.vx, e.vy));
      } else break;
    }
    expect(maxDashT).toBeGreaterThan(0);       // 突进分支真实可达
    expect(maxSpeed).toBeGreaterThan(150);     // 70 × 3.2 = 224（远超常速 70）
  });

  it('突进后进入冷却，不会连续突进', () => {
    const s = makeState();
    const grid = new EnemyGrid();
    const e = spawnEnemy(s, 'elite_echo', s.player.x + 200, s.player.y)!;
    e.spawnT = 0;
    let dashCount = 0;
    let wasDashing = false;
    for (let i = 0; i < 60 * 12; i++) {
      s.enemies.forEach((en) => grid.insert(en));
      stepSim(s, DT, { mx: 0, my: 0, dash: false }, grid);
      if (!e.alive) break;
      const dashing = e.t > 0;
      if (dashing && !wasDashing) dashCount++;
      wasDashing = dashing;
    }
    // 12s 内：初始 0.8s 蓄力 + 3.2s 冷却 → 约 3 次突进（不会每帧都算新的）
    expect(dashCount).toBeGreaterThanOrEqual(2);
    expect(dashCount).toBeLessThanOrEqual(4);
  });
});
