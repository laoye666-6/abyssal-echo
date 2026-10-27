import type { Enemy, RunState } from '@/game/types';
import { normX, normY } from '@/core/math';
import { spawnEnemy } from '@/game/combat';
import { bossUpdate } from './boss';
import { ENEMY_DEFS } from '@/data/enemies.data';

export type EnemyUpdateFn = (state: RunState, e: Enemy, dt: number) => void;

/** 缓速/眩晕统一结算，返回有效速度系数。 */
export function speedFactor(e: Enemy): number {
  if (e.stun > 0 && e.tier !== 'boss') return 0; // Boss 免疫眩晕（弹幕不受影响）
  return e.slow > 0 ? 0.55 : 1;
}

const behaviors: Record<string, EnemyUpdateFn> = {
  chaser(state, e, dt) {
    const p = state.player;
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const f = speedFactor(e);
    const sp = e.speed * f;
    // 平滑转向（保留击退惯性）
    const tvx = normX(dx, dy) * sp;
    const tvy = normY(dx, dy) * sp;
    const k = Math.min(1, dt * 6);
    e.vx += (tvx - e.vx) * k;
    e.vy += (tvy - e.vy) * k;
  },

  weaver(state, e, dt) {
    const p = state.player;
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const f = speedFactor(e);
    e.t += dt;
    const def = ENEMY_DEFS[e.kind];
    const amp = def.params?.weaveAmp ?? 46;
    const freq = def.params?.weaveFreq ?? 3.2;
    const nx = normX(dx, dy);
    const ny = normY(dx, dy);
    // 垂直方向正弦摆动
    const wob = Math.sin(e.t * freq) * amp;
    const tvx = nx * e.speed * f + -ny * wob * f;
    const tvy = ny * e.speed * f + nx * wob * f;
    const k = Math.min(1, dt * 5);
    e.vx += (tvx - e.vx) * k;
    e.vy += (tvy - e.vy) * k;
  },

  tank(state, e, dt) {
    behaviors.chaser!(state, e, dt);
    // 坦克转向更迟钝
    const p = state.player;
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const f = speedFactor(e) * 0.9;
    const k = Math.min(1, dt * 1.6);
    e.vx += (normX(dx, dy) * e.speed * f - e.vx) * k;
    e.vy += (normY(dx, dy) * e.speed * f - e.vy) * k;
  },

  splitter(state, e, dt) {
    behaviors.chaser!(state, e, dt);
    // 母巢精英：周期性产卵
    if (e.kind === 'elite_mother') {
      e.phase -= dt;
      if (e.phase <= 0) {
        e.phase = 4;
        for (let i = 0; i < 2; i++) {
          const a = state.rng.next() * Math.PI * 2;
          spawnEnemy(state, 'mote', e.x + Math.cos(a) * 20, e.y + Math.sin(a) * 20);
        }
      }
    }
  },

  shooter(state, e, dt) {
    const p = state.player;
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    const f = speedFactor(e);
    const keep = 240;
    let tvx = 0;
    let tvy = 0;
    if (d > keep + 40) {
      tvx = (dx / d) * e.speed * f;
      tvy = (dy / d) * e.speed * f;
    } else if (d < keep - 40) {
      tvx = (-dx / d) * e.speed * f;
      tvy = (-dy / d) * e.speed * f;
    } else {
      // 环绕
      tvx = (-dy / d) * e.speed * 0.6 * f;
      tvy = (dx / d) * e.speed * 0.6 * f;
    }
    const k = Math.min(1, dt * 4);
    e.vx += (tvx - e.vx) * k;
    e.vy += (tvy - e.vy) * k;

    // 开火
    const wdef = ENEMY_DEFS[e.kind];
    e.phase -= dt;
    if (e.phase <= 0 && f > 0) {
      e.phase = wdef.params?.fireCd ?? 2.4;
      const b = state.ebullets.spawn();
      if (b) {
        const bs = wdef.params?.bulletSpeed ?? 130;
        b.x = e.x;
        b.y = e.y;
        b.vx = (dx / d) * bs;
        b.vy = (dy / d) * bs;
        b.r = 6;
        b.dmg = wdef.params?.bulletDmg ?? 12;
        b.life = 5;
      }
    }
  },

  phaser(state, e, dt) {
    const wdef = ENEMY_DEFS[e.kind];
    e.phase -= dt;
    if (e.phase <= 0) {
      e.phase = wdef.params?.tpCd ?? 5;
      // 瞬移到玩家附近随机角
      const a = state.rng.next() * Math.PI * 2;
      const r = wdef.params?.tpDist ?? 220;
      e.x = state.player.x + Math.cos(a) * r;
      e.y = state.player.y + Math.sin(a) * r;
      e.vx = 0;
      e.vy = 0;
      state.events.fx.push({ kind: 'enemySpawn', x: e.x, y: e.y, r: e.r, color: '#b45bff' });
    }
    behaviors.chaser!(state, e, dt);
  },

  // v1.1：回响体——接近 → 蓄力 telegraph → 高速突进。e.t>0 = 突进中。
  dasher(state, e, dt) {
    const def = ENEMY_DEFS[e.kind];
    const f = speedFactor(e);

    if (e.t > 0) {
      // 突进中：沿锁定方向全速（每帧重写速度，绕过阻尼）
      e.t -= dt;
      const sp = e.speed * (def.params?.dashMul ?? 3.2);
      const l = Math.hypot(e.tx, e.ty) || 1;
      e.vx = (e.tx / l) * sp;
      e.vy = (e.ty / l) * sp;
      return;
    }

    e.phase -= dt;
    if (e.phase <= 0 && e.phase > -(def.params?.telegraph ?? 0.8)) {
      // 蓄力：急停 + telegraph 特效（此区间 phase 为负计数）
      e.vx *= Math.pow(0.0005, dt);
      e.vy *= Math.pow(0.0005, dt);
      if (state.rng.chance(dt * 8)) {
        state.events.fx.push({ kind: 'telegraph', x: e.x, y: e.y, r: e.r * 2.2, color: def.color });
      }
      if (e.phase <= -(def.params?.telegraph ?? 0.8)) {
        // 蓄力完毕：锁定玩家当前位置方向开始突进
        const dx = state.player.x - e.x;
        const dy = state.player.y - e.y;
        e.tx = dx;
        e.ty = dy;
        e.t = def.params?.dashTime ?? 0.5;
        e.phase = def.params?.dashCd ?? 3.2;
        state.events.sfx.push({ name: 'warning', v: 0.5, p: 1.6 });
      }
      return;
    }

    // 常规接近
    const p = state.player;
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const tvx = normX(dx, dy) * e.speed * f;
    const tvy = normY(dx, dy) * e.speed * f;
    const k = Math.min(1, dt * 6);
    e.vx += (tvx - e.vx) * k;
    e.vy += (tvy - e.vy) * k;
  },
};

export function updateEnemy(state: RunState, e: Enemy, dt: number): void {
  if (e.spawnT > 0) {
    e.spawnT -= dt;
    return;
  }
  e.flash = Math.max(0, e.flash - dt);
  e.slow = Math.max(0, e.slow - dt);
  e.stun = Math.max(0, e.stun - dt);
  if (e.tier === 'boss') {
    bossUpdate(state, e, dt);
  } else {
    const fn = behaviors[enemyBehaviorIdOf(e.kind)];
    if (fn) fn(state, e, dt);
  }
  // 击退/速度积分 + 阻尼
  e.x += e.vx * dt;
  e.y += e.vy * dt;
  // 泯灭者冲锋期间不衰减（否则 620px/s 的冲锋被击退阻尼吃成 72px）
  const charging = e.kind === 'boss_devourer' && e.phase === 2;
  if (!charging) {
    const damp = Math.pow(0.0001, dt); // 击退速度快速衰减（steering 型行为每帧重建速度）
    e.vx *= damp;
    e.vy *= damp;
  }
}


function enemyBehaviorIdOf(kind: Enemy['kind']): string {
  return ENEMY_DEFS[kind].behavior;
}
