/**
 * 升级系统：三选一的候选生成与效果应用。
 * 规则：
 *  - 进化（武器满级 + 对应被动 ≥3 级）优先级最高，出现必为第一项。
 *  - 武器/被动最多各 4 个栏位。
 *  - 候选不足 3 个时用"治疗"补位。
 */
import { BASE_WEAPONS, MAX_PASSIVE_SLOTS, MAX_WEAPON_SLOTS, WEAPON_DATA } from '@/data/weapons.data';
import { PASSIVE_DEFS } from '@/data/passives.data';
import { CHARACTER_DEFS } from '@/data/characters.data';
import type {
  PassiveId, RunState, UpgradeOption, WeaponId,
} from './types';
import { makeStatsForCharacter } from './state';
import { xpToNext } from './balance';

interface WeightedOption {
  opt: UpgradeOption;
  w: number;
}

function weaponInst(state: RunState, id: WeaponId) {
  return state.weapons.find((w) => w.id === id);
}

function passiveInst(state: RunState, id: PassiveId) {
  return state.passives.find((p) => p.id === id);
}

export function isEvolutionEligible(state: RunState, wid: WeaponId): boolean {
  const data = WEAPON_DATA[wid];
  if (!data?.evolution) return false;
  const w = weaponInst(state, wid);
  if (!w || w.level < data.maxLevel) return false;
  if (weaponInst(state, data.evolution.into)) return false;
  const p = passiveInst(state, data.evolution.passive);
  return !!p && p.level >= 3;
}

export function generateChoices(state: RunState): UpgradeOption[] {
  const out: UpgradeOption[] = [];

  // 1) 进化优先（最多占一个槽位，保持选择感）
  for (const wid of state.weapons.map((w) => w.id)) {
    if (isEvolutionEligible(state, wid)) {
      out.push({ kind: 'evolution', id: wid, into: WEAPON_DATA[wid].evolution!.into });
      break;
    }
  }

  // 2) 加权池
  const pool: WeightedOption[] = [];
  const luck = state.stats.luck;

  if (state.weapons.length < MAX_WEAPON_SLOTS) {
    for (const id of BASE_WEAPONS) {
      if (!weaponInst(state, id)) pool.push({ opt: { kind: 'newWeapon', id }, w: 10 + luck });
    }
  }
  for (const w of state.weapons) {
    const data = WEAPON_DATA[w.id];
    if (w.level < data.maxLevel) pool.push({ opt: { kind: 'weaponLevel', id: w.id, toLevel: w.level + 1 }, w: 9 });
  }
  if (state.passives.length < MAX_PASSIVE_SLOTS) {
    for (const id of Object.keys(PASSIVE_DEFS) as PassiveId[]) {
      if (!passiveInst(state, id)) pool.push({ opt: { kind: 'newPassive', id }, w: 8 + luck * 0.5 });
    }
  }
  for (const p of state.passives) {
    const def = PASSIVE_DEFS[p.id];
    if (p.level < def.maxLevel) pool.push({ opt: { kind: 'passiveLevel', id: p.id, toLevel: p.level + 1 }, w: 9 });
  }

  // 抽取去重
  const rng = state.rng;
  const picks: UpgradeOption[] = [...out];
  const used = new Set(picks.map(keyOf));
  while (picks.length < 3 && pool.length > 0) {
    const idx = rng.weighted(pool.map((p) => p.w));
    if (idx < 0) break;
    const chosen = pool.splice(idx, 1)[0]!;
    const k = keyOf(chosen.opt);
    if (used.has(k)) continue;
    used.add(k);
    picks.push(chosen.opt);
  }

  // 补位治疗
  while (picks.length < 3) {
    picks.push({ kind: 'heal', amount: 0.2 });
  }
  return picks;
}

function keyOf(opt: UpgradeOption): string {
  switch (opt.kind) {
    case 'newWeapon': case 'weaponLevel': case 'evolution':
      return `w:${opt.id}`;
    case 'newPassive': case 'passiveLevel':
      return `p:${opt.id}`;
    case 'heal':
      return 'heal';
  }
}

/** 应用升级选项。 */
export function applyOption(state: RunState, opt: UpgradeOption): void {
  switch (opt.kind) {
    case 'newWeapon': {
      state.weapons.push({ id: opt.id, level: 1, cd: 0.15, t: 0 });
      break;
    }
    case 'weaponLevel': {
      const w = weaponInst(state, opt.id);
      if (w) w.level = opt.toLevel;
      break;
    }
    case 'evolution': {
      const w = weaponInst(state, opt.id);
      if (w) w.id = opt.into;
      // 清掉旧武器的常驻随从（否则 orbit/drones/frost 进化后留下永久幽灵）
      state.attendants.forEach((a) => {
        if (a.ownerWeapon === opt.id) state.attendants.despawn(a);
      });
      state.events.sfx.push({ name: 'evolve', v: 1, p: 1 });
      state.events.fx.push({ kind: 'levelUp', x: state.player.x, y: state.player.y, r: 160, color: '#ffd75b' });
      break;
    }
    case 'newPassive': {
      state.passives.push({ id: opt.id, level: 1 });
      recomputeStats(state);
      break;
    }
    case 'passiveLevel': {
      const p = passiveInst(state, opt.id);
      if (p) p.level = opt.toLevel;
      recomputeStats(state);
      break;
    }
    case 'heal': {
      const heal = state.stats.maxHp * opt.amount;
      state.player.hp = Math.min(state.stats.maxHp, state.player.hp + heal);
      state.events.fx.push({ kind: 'levelUp', x: state.player.x, y: state.player.y, r: 60, color: '#8fe86b' });
      break;
    }
  }
}

/**
 * 依据 角色 + 元进度 + 被动 重算 Stats。
 * maxHp 变化时同步调整当前 hp（保留等比例余量感：加差值）。
 */
export function recomputeStats(state: RunState): void {
  const base = state.metaRef ? makeStatsForCharacter(state.characterId, state.metaRef) : null;
  if (!base) return;
  const oldMax = state.stats.maxHp;
  const stats = base;
  for (const p of state.passives) {
    PASSIVE_DEFS[p.id].apply(stats, p.level);
  }
  Object.assign(state.stats, stats);
  const delta = state.stats.maxHp - oldMax;
  if (delta > 0) state.player.hp = Math.min(state.stats.maxHp, state.player.hp + delta);
  state.player.hp = Math.min(state.player.hp, state.stats.maxHp);
  state.xpToNext = xpToNext(state.level);
}

/** 把本局获得的东西写回存档快照（App 层调用）。 */
export function collectRunSummary(state: RunState) {
  return {
    kills: state.kills,
    elitesKilled: state.elitesKilled,
    bossesKilled: state.bossesKilled,
    time: state.time,
    level: state.level,
    damageDealt: Math.round(state.damageDealt),
    cores: state.cores,
    victory: state.over?.victory ?? false,
    seen: [...state.seen],
    weapons: state.weapons.map((w) => w.id),
    passives: state.passives.map((p) => p.id),
    characterId: state.characterId,
  };
}

// characterId/START weapon helper used by app
export function startWeaponOf(charId: keyof typeof CHARACTER_DEFS): WeaponId {
  return CHARACTER_DEFS[charId]!.startWeapon;
}
