import { describe, it, expect } from 'vitest';
import { makeRunState } from '@/game/state';
import { defaultMeta } from '@/core/save';
import { stepSim } from '@/game/sim';
import { EnemyGrid, spawnEnemy, spawnGem } from '@/game/combat';
import type { RunState } from '@/game/types';
import type { SimControl } from '@/game/sim';

const DT = 1 / 60;
const IDLE: SimControl = { mx: 0, my: 0, dash: false };

function makeState(seed = 7): RunState {
  return makeRunState({ seed, characterId: 'peregrine', meta: defaultMeta() });
}

function run(s: RunState, steps: number, ctrl: SimControl = IDLE): void {
  const grid = new EnemyGrid();
  for (let i = 0; i < steps; i++) stepSim(s, DT, ctrl, grid);
}

describe('sim 模拟主步进', () => {
  it('决定性：同种子两局跑 600 步后关键状态完全一致，且向右移动生效', () => {
    const a = makeState(42);
    const b = makeState(42);
    a.weapons.push({ id: 'pulse', level: 1, cd: 0, t: 0 });
    b.weapons.push({ id: 'pulse', level: 1, cd: 0, t: 0 });
    const ga = new EnemyGrid();
    const gb = new EnemyGrid();
    const ctrl: SimControl = { mx: 1, my: 0, dash: false };
    for (let i = 0; i < 600; i++) {
      stepSim(a, DT, ctrl, ga);
      stepSim(b, DT, ctrl, gb);
    }
    expect(a.time).toBe(b.time);
    expect(a.level).toBe(b.level);
    expect(a.kills).toBe(b.kills);
    expect(a.enemies.live).toBe(b.enemies.live);
    expect(a.player.x).toBe(b.player.x);
    expect(a.player.hp).toBe(b.player.hp);
    // mx=1 持续向右移动 10 秒
    expect(a.player.x).toBeGreaterThan(0);
    expect(a.over).toBeNull();
  });

  it('无敌人时不掉血（前 1 秒导演尚未积累出第一批生成）', () => {
    const s = makeState(7);
    run(s, 60);
    expect(s.enemies.live).toBe(0);
    expect(s.player.hp).toBe(s.stats.maxHp);
  });

  it('接触伤害：mote 紧贴玩家，60 步后 hp 下降', () => {
    const s = makeState(7);
    // 20px：小于接触半径 (10+14)，出生淡入 0.35s 结束后立即持续接触
    spawnEnemy(s, 'mote', s.player.x + 20, s.player.y);
    run(s, 60);
    expect(s.player.hp).toBeLessThan(s.stats.maxHp);
    expect(s.over).toBeNull(); // 100 血不会被 8dps 磨死
  });

  it('死亡路径：maxHp 极小 + 超高接触伤害 -> over.reason === "dead"', () => {
    const s = makeState(7);
    const e = spawnEnemy(s, 'mote', s.player.x, s.player.y)!;
    e.contactDps = 5000;
    s.stats.maxHp = 5;
    s.player.hp = 5;
    const grid = new EnemyGrid();
    let steps = 0;
    while (!s.over && steps < 300) {
      stepSim(s, DT, IDLE, grid);
      steps++;
    }
    expect(s.over).not.toBeNull();
    expect(s.over!.victory).toBe(false);
    expect(s.over!.reason).toBe('dead');
    expect(s.player.hp).toBeLessThanOrEqual(0);
  });

  it('经验升级：拾取大经验宝石后 pendingLevelUps > 0 且 level 增加', () => {
    const s = makeState(7);
    spawnGem(s, s.player.x, s.player.y, 100); // xpToNext(1)=15，100 点够升数级
    run(s, 60);
    expect(s.pendingLevelUps).toBeGreaterThan(0);
    expect(s.level).toBeGreaterThan(1);
    expect(s.xp).toBeLessThan(s.xpToNext);
  });

  it('投射物命中：右侧 100px 的 mote 在 120 步内被 pulse 击杀', () => {
    const s = makeState(123);
    s.weapons.push({ id: 'pulse', level: 1, cd: 0, t: 0 });
    spawnEnemy(s, 'mote', s.player.x + 100, s.player.y);
    run(s, 120);
    expect(s.kills).toBeGreaterThanOrEqual(1);
  });
});
