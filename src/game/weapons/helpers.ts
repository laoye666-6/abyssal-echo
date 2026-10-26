import type { Projectile, ProjectileKind, RunState } from '@/game/types';

export interface FireOpts {
  kind: ProjectileKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  dmg: number;
  r?: number;
  life?: number;
  pierce?: number;
  bounce?: number;
  homing?: number;
  color?: string;
  rehit?: number;
  data0?: number;
  data1?: number;
}

export function fireProjectile(state: RunState, o: FireOpts): Projectile | null {
  const p = state.projectiles.spawn();
  if (!p) return null;
  p.kind = o.kind;
  p.x = o.x;
  p.y = o.y;
  p.vx = o.vx;
  p.vy = o.vy;
  p.dmg = o.dmg;
  p.r = o.r ?? 5;
  p.life = o.life ?? 2;
  p.pierce = o.pierce ?? 0;
  p.bounce = o.bounce ?? 0;
  p.homing = o.homing ?? 0;
  p.hitIds = (o.pierce ?? 0) > 0 || (o.bounce ?? 0) > 0 ? new Set<number>() : null;
  p.rehit = o.rehit ?? 0;
  p.color = o.color ?? '#5be7ff';
  p.data0 = o.data0 ?? 0;
  p.data1 = o.data1 ?? 0;
  return p;
}

/** 玩家朝向最近敌人的方向；无敌人时返回玩家朝向。默认距离收紧到拾取半径量级，保证击杀经验可被拾取。 */
export function aimNearest(state: RunState, maxDist = 460): { x: number; y: number; found: boolean } {
  let best: { d2: number; x: number; y: number } | null = null;
  const p = state.player;
  state.enemies.forEach((e) => {
    if (e.spawnT > 0) return;
    const dx = e.x - p.x;
    const dy = e.y - p.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < maxDist * maxDist && (!best || d2 < best.d2)) best = { d2, x: e.x, y: e.y };
  });
  if (!best) {
    return { x: Math.cos(p.facing), y: Math.sin(p.facing), found: false };
  }
  const b = best as { d2: number; x: number; y: number };
  const l = Math.sqrt(b.d2) || 1;
  return { x: (b.x - p.x) / l, y: (b.y - p.y) / l, found: true };
}

/** 等级伤害系数：1 级为基准。 */
export function levelMul(level: number, per = 0.16): number {
  return 1 + per * (level - 1);
}

export function weaponColorOf(kind: ProjectileKind): string {
  const table: Partial<Record<ProjectileKind, string>> = {
    pulse: '#5be7ff',
    pulse_supernova: '#ffe45b',
    nova: '#ffb45b',
    nova_collapse: '#ff8b5b',
    shard: '#b4e0ff',
    shard_mirror: '#e0c8ff',
    lance: '#8bfff0',
    lance_singularity: '#ffffff',
  };
  return table[kind] ?? '#5be7ff';
}

