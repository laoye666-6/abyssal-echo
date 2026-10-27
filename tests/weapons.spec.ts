import { describe, it, expect } from 'vitest';
import { makeRunState, makeStatsForCharacter } from '@/game/state';
import { stepSim } from '@/game/sim';
import { defaultMeta } from '@/core/save';
import { EnemyGrid, spawnEnemy } from '@/game/combat';
import type { RunState, WeaponInstance } from '@/game/types';
import { WEAPON_BEHAVIORS } from '@/game/weapons';
import { scythe } from '@/game/weapons/scythe';
import { mines } from '@/game/weapons/mines';
import { WEAPON_DATA } from '@/data/weapons.data';
import { PASSIVE_DEFS } from '@/data/passives.data';
import { META_NODES } from '@/data/meta.data';

const DT = 1 / 60;

function makeState(seed = 7): RunState {
  return makeRunState({ seed, characterId: 'vesper', meta: defaultMeta() });
}

function weapon(id: WeaponInstance['id'], level = 1): WeaponInstance {
  return { id, level, cd: 0, t: 0 };
}

/** 生成已就位（无出生淡入）的敌人。 */
function place(s: RunState, kind: Parameters<typeof spawnEnemy>[1], x: number, y: number) {
  const e = spawnEnemy(s, kind, x, y)!;
  e.spawnT = 0;
  return e;
}

describe('v1.1 新武器', () => {
  it('数据表：scythe/mines 注册且各有进化路径', () => {
    expect(WEAPON_DATA.scythe!.evolution).toEqual({ passive: 'aegis', into: 'scythe_eclipse' });
    expect(WEAPON_DATA.mines!.evolution).toEqual({ passive: 'greed', into: 'mines_bloom' });
    expect(WEAPON_BEHAVIORS.scythe).toBe(scythe);
    expect(WEAPON_BEHAVIORS.mines).toBe(mines);
    expect(WEAPON_BEHAVIORS.scythe_eclipse).toBe(scythe);
    expect(WEAPON_BEHAVIORS.mines_bloom).toBe(mines);
  });

  it('scythe：冷却随等级递减', () => {
    expect(scythe.cooldown(5)).toBeLessThan(scythe.cooldown(1));
  });

  it('scythe：正面锥形内敌人受创，背后敌人不受创', () => {
    const s = makeState();
    s.player.facing = 0; // 面向 +x
    const front = place(s, 'mote', s.player.x + 60, s.player.y)!;
    const behind = place(s, 'mote', s.player.x - 60, s.player.y)!;
    const frontHp = front.hp;
    const behindHp = behind.hp;
    scythe.fire(s, weapon('scythe'), s.stats);
    expect(front.hp).toBeLessThan(frontHp);
    expect(behind.hp).toBe(behindHp);
    // 击退：前方的敌人获得 +x 方向速度（位置积分在 updateEnemy）
    expect(front.vx).toBeGreaterThan(0);
  });

  it('scythe：进化蚀月 360° 全向 + 低血斩杀（Boss 免疫斩杀）', () => {
    const s = makeState();
    const low = place(s, 'mote', s.player.x + 60, s.player.y)!;
    low.hp = Math.max(1, Math.floor(low.maxHp * 0.1)); // <12% 触发斩杀
    const behind = place(s, 'mote', s.player.x - 60, s.player.y)!;
    scythe.fire(s, weapon('scythe_eclipse'), s.stats);
    expect(low.alive).toBe(false);
    // 360°：背后的敌人也受创
    expect(behind.alive).toBe(false);

    // Boss 不被斩杀
    const s2 = makeState();
    const boss = place(s2, 'boss_devourer', s2.player.x + 50, s2.player.y)!;
    boss.hp = Math.max(1, Math.floor(boss.maxHp * 0.05));
    scythe.fire(s2, weapon('scythe_eclipse'), s2.stats);
    expect(boss.alive).toBe(true);
  });

  it('mines：布防期内不引爆，布防完成后敌近起爆（update 自计时布雷）', () => {
    const s = makeState();
    const w = weapon('mines');
    const grid = new EnemyGrid();
    s.gridRef = grid;
    // update 自计时布雷（w.cd 初始 0）
    mines.update!(s, w, s.stats, DT);
    const mine = s.projectiles.items.find((p) => p.alive && p.kind === 'mine');
    expect(mine).toBeTruthy();
    expect(mine!.data0).toBeGreaterThan(0); // 布防倒计时
    expect(w.cd).toBeGreaterThan(0); // 冷却已重置，不会同帧重复布雷
    const target = place(s, 'mote', mine!.x + 20, mine!.y)!;
    grid.insert(target);
    // 布防期内：不爆
    mines.update!(s, w, s.stats, DT);
    expect(target.alive).toBe(true);
    // 推进布防时间后：起爆
    for (let i = 0; i < 30; i++) mines.update!(s, w, s.stats, DT);
    expect(mine!.data0).toBeLessThanOrEqual(0);
    mines.update!(s, w, s.stats, DT);
    expect(target.alive).toBe(false);
  });

  it('mines：mines_bloom 双雷连布，寿命自爆后留下持续伤害区', () => {
    const s = makeState();
    const w = weapon('mines_bloom');
    const grid = new EnemyGrid();
    s.gridRef = grid;
    mines.update!(s, w, s.stats, DT);
    const placed = s.projectiles.items.filter((p) => p.alive && p.kind === 'mine_bloom' && p.data1 === 0);
    expect(placed.length).toBe(2);
    // 越过布防与寿命（6s）→ 自爆（寿命扣减发生在主循环投射物段，这里模拟之）
    for (let i = 0; i < 420; i++) {
      s.projectiles.forEach((p) => { p.life -= DT; });
      mines.update!(s, w, s.stats, DT);
    }
    const fields = s.projectiles.items.filter((p) => p.alive && p.kind === 'mine_bloom' && p.data1 === 1);
    expect(fields.length).toBeGreaterThanOrEqual(1);
    expect(fields[0]!.life).toBeGreaterThan(0);
  });

  it('mines：持续伤害区周期跳伤', () => {
    const s = makeState();
    const w = weapon('mines_bloom');
    const grid = new EnemyGrid();
    s.gridRef = grid;
    const field = s.projectiles.spawn()!;
    field.kind = 'mine_bloom';
    field.data1 = 1;
    field.data0 = 0;
    field.rehit = 0;
    field.r = 100;
    field.dmg = 30;
    field.life = 2.5;
    field.x = s.player.x + 30;
    field.y = s.player.y;
    const target = place(s, 'mote', field.x, field.y)!;
    grid.insert(target);
    const hp0 = target.hp;
    mines.update!(s, w, s.stats, DT);
    expect(target.hp).toBeLessThan(hp0);
  });

  it('新被动 aegis/greed：每级数值生效', () => {
    expect(META_NODES.some((n) => n.id === 'aegis')).toBe(false); // 被动不进星核树
    const s = makeStatsForCharacter('peregrine', defaultMeta());
    const armor0 = s.armor;
    const hp0 = s.maxHp;
    PASSIVE_DEFS.aegis.apply(s, 2);
    expect(s.armor).toBeCloseTo(armor0 + 2.4, 6);
    expect(s.maxHp).toBe(hp0 + 20);

    const s2 = makeStatsForCharacter('peregrine', defaultMeta());
    const xp0 = s2.xpMul;
    PASSIVE_DEFS.greed.apply(s2, 1);
    expect(s2.xpMul).toBeCloseTo(xp0 * 1.15, 6);
    expect(s2.luck).toBeCloseTo(0.6, 6);
  });

  it('vesper：角色数值与初始武器接线', () => {
    const s = makeStatsForCharacter('vesper', defaultMeta());
    expect(s.cooldownMul).toBeCloseTo(0.92, 6);
    expect(s.maxHp).toBe(90);
    expect(s.moveSpeed).toBe(210);
  });
});

describe('v1.1 地雷 × 主循环集成（stepSim 真实分发）', () => {
  it('伤害区不被主循环碰撞一帧吃掉：持续 DoT 跳伤后自然消散', () => {
    const s = makeState();
    const grid = new EnemyGrid();
    s.gridRef = grid;
    // 只留一把冷却中的 mines_bloom（不再布雷），手动放置伤害区
    s.weapons.push({ id: 'mines_bloom', level: 1, cd: 999, t: 0 });
    const field = s.projectiles.spawn()!;
    field.kind = 'mine_bloom';
    field.data1 = 1;
    field.data0 = 0;
    field.rehit = 0;
    field.r = 100;
    field.dmg = 30;
    field.life = 2.5;
    field.x = s.player.x + 30;
    field.y = s.player.y;
    const target = place(s, 'mote', field.x, field.y)!;
    grid.insert(target);
    const hp0 = target.hp;
    // 30 步（0.5s）：伤害区必须还活着（旧 bug：首帧被全额伤害吃掉）
    for (let i = 0; i < 30; i++) stepSim(s, DT, { mx: 0, my: 0, dash: false }, grid);
    expect(field.alive).toBe(true);
    const tickDmg = hp0 - target.hp;
    expect(tickDmg).toBeGreaterThan(0);
    expect(tickDmg).toBeLessThan(field.dmg); // 跳伤 0.35×，不是全额
    // 2.5s 后自然消散
    for (let i = 0; i < 150; i++) stepSim(s, DT, { mx: 0, my: 0, dash: false }, grid);
    expect(field.alive).toBe(false);
  });

  it('布防期地雷不被碰撞提前引爆', () => {
    const s = makeState();
    const grid = new EnemyGrid();
    s.gridRef = grid;
    s.weapons.push({ id: 'mines', level: 1, cd: 999, t: 0 });
    const mine = s.projectiles.spawn()!;
    mine.kind = 'mine';
    mine.data1 = 0;
    mine.data0 = 0.4; // 布防中
    mine.rehit = 0;
    mine.r = 7;
    mine.dmg = 15;
    mine.life = 6;
    mine.x = s.player.x + 10;
    mine.y = s.player.y;
    const target = place(s, 'mote', mine.x, mine.y)!;
    grid.insert(target);
    const hp0 = target.hp;
    for (let i = 0; i < 10; i++) stepSim(s, DT, { mx: 0, my: 0, dash: false }, grid);
    expect(mine.alive).toBe(true); // 没有被碰撞引爆/吃掉
    expect(target.hp).toBe(hp0);
  });
});
