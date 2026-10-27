/**
 * 成就系统（v1.1）：数据驱动，双通道判定。
 *  - live：局内每秒节流检查（即时 toast）
 *  - afterRun：结算时扫一遍（含元进度类）
 *  - meta：仅依赖元进度（购买强化后也可触发）
 * 解锁写 MetaSnapshot.achievements，由 App 层负责持久化与表现。
 */
import type { MetaSnapshot, RunState } from './types';
import { META_NODES } from '@/data/meta.data';
import { WEAPON_DATA } from '@/data/weapons.data';

/** 结算摘要的最小形状（collectRunSummary 的返回值兼容）。 */
export interface RunSummaryLite {
  kills: number;
  elitesKilled: number;
  bossesKilled: number;
  time: number;
  level: number;
  cores: number;
  victory: boolean;
  evolutions: number;
  mode: string;
  depth: number;
  weapons: string[];
  characterId: string;
}

export interface AchievementDef {
  id: string;
  /** i18n: achv.<id>.name / .desc */
  live?: (state: RunState) => boolean;
  afterRun?: (r: RunSummaryLite, meta: MetaSnapshot) => boolean;
  /** 面板进度 [当前, 目标]；无进度概念返回 null */
  progress?: (meta: MetaSnapshot) => [number, number] | null;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'first_echo',
    afterRun: (_r, meta) => meta.runs >= 1,
    progress: (m) => [Math.min(1, m.runs), 1],
  },
  {
    id: 'century',
    live: (s) => s.kills >= 100,
    afterRun: (r) => r.kills >= 100,
    progress: (m) => [Math.min(m.bestKills, 100), 100],
  },
  {
    id: 'legion',
    live: (s) => s.kills >= 500,
    afterRun: (r) => r.kills >= 500,
    progress: (m) => [Math.min(m.bestKills, 500), 500],
  },
  {
    id: 'five_min',
    live: (s) => s.time >= 300,
    afterRun: (r) => r.time >= 300,
    progress: (m) => [Math.min(Math.floor(m.bestTime), 300), 300],
  },
  {
    id: 'devourer_slayer',
    afterRun: (r) => r.bossesKilled >= 1,
  },
  {
    id: 'eye_slayer',
    afterRun: (r) => r.victory,
  },
  {
    id: 'first_evolution',
    afterRun: (r) => r.evolutions >= 1,
  },
  {
    id: 'triple_evolution',
    live: (s) => s.evolutions >= 3,
    afterRun: (r) => r.evolutions >= 3,
  },
  {
    id: 'flawless',
    live: (s) => s.time >= 300 && s.damageTaken === 0,
  },
  {
    id: 'maxed_weapon',
    live: (s) => s.weapons.some((w) => w.level >= (WEAPON_DATA[w.id]?.maxLevel ?? 99)),
  },
  {
    id: 'elite_hunter',
    live: (s) => s.elitesKilled >= 10,
    afterRun: (r) => r.elitesKilled >= 10,
  },
  {
    id: 'core_mogul',
    afterRun: (_r, meta) => meta.totalCoresEarned >= 1000,
    progress: (m) => [Math.min(m.totalCoresEarned, 1000), 1000],
  },
  {
    id: 'veteran',
    afterRun: (_r, meta) => meta.runs >= 25,
    progress: (m) => [Math.min(m.runs, 25), 25],
  },
  {
    id: 'daily_omen',
    afterRun: (r) => r.mode === 'daily',
  },
  {
    id: 'depth_2',
    live: (s) => s.mode === 'endless' && s.loop >= 1,
    afterRun: (r) => r.mode === 'endless' && r.depth >= 2,
  },
  {
    id: 'depth_5',
    live: (s) => s.mode === 'endless' && s.loop >= 4,
    afterRun: (r) => r.mode === 'endless' && r.depth >= 5,
  },
  {
    id: 'full_arsenal',
    live: (s) => s.weapons.length >= 4,
    afterRun: (r) => r.weapons.length >= 4,
  },
  {
    id: 'forge_master',
    afterRun: (_r, meta) => META_NODES.some((n) => (meta.upgrades[n.id] ?? 0) >= n.maxRank),
  },
  {
    id: 'trifecta',
    afterRun: (_r, meta) => Object.values(meta.charWins).filter((n) => n >= 1).length >= 3,
  },
  {
    id: 'core_harvest',
    afterRun: (r) => r.cores >= 15,
  },
];

/** 局内实时判定：返回本次新解锁的成就 id。 */
export function evaluateLive(state: RunState, meta: MetaSnapshot): string[] {
  const out: string[] = [];
  for (const a of ACHIEVEMENTS) {
    if (meta.achievements[a.id]) continue;
    try {
      if (a.live?.(state)) out.push(a.id);
    } catch {
      /* 判定失败不阻塞 */
    }
  }
  return out;
}

/** 结算判定：返回本次新解锁的成就 id。 */
export function evaluateAfterRun(r: RunSummaryLite, meta: MetaSnapshot): string[] {
  const out: string[] = [];
  for (const a of ACHIEVEMENTS) {
    if (meta.achievements[a.id]) continue;
    try {
      if (a.afterRun?.(r, meta)) out.push(a.id);
    } catch {
      /* 判定失败不阻塞 */
    }
  }
  return out;
}

/** 仅元进度判定（购买强化等时机）。 */
export function evaluateMeta(meta: MetaSnapshot): string[] {
  return evaluateAfterRun({
    kills: 0, elitesKilled: 0, bossesKilled: 0, time: 0, level: 0, cores: 0,
    victory: false, evolutions: 0, mode: 'standard', depth: 0, weapons: [], characterId: 'peregrine',
  }, meta);
}

/** 面板进度（无进度的成就返回 null）。 */
export function achievementProgress(a: AchievementDef, meta: MetaSnapshot): [number, number] | null {
  return a.progress?.(meta) ?? null;
}
