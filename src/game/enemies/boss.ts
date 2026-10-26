import type { Enemy, RunState } from '@/game/types';
import { normX, normY } from '@/core/math';
import { spawnEnemy } from '@/game/combat';
import { speedFactor } from './index';

/**
 * Boss 行为。
 * 泯灭者 (boss_devourer)：环形弹幕 + 蓄力冲锋。
 * 深渊之眼 (boss_eye)：旋转弹幕螺旋 + 召唤尘埃风暴。
 */
export function bossUpdate(state: RunState, e: Enemy, dt: number): void {
  switch (e.kind) {
    case 'boss_devourer':
      devourerUpdate(state, e, dt);
      break;
    case 'boss_eye':
      eyeUpdate(state, e, dt);
      break;
    default:
      chase(state, e, dt);
  }
}

function chase(state: RunState, e: Enemy, dt: number): void {
  const p = state.player;
  const dx = p.x - e.x;
  const dy = p.y - e.y;
  const f = speedFactor(e);
  const k = Math.min(1, dt * 3);
  e.vx += (normX(dx, dy) * e.speed * f - e.vx) * k;
  e.vy += (normY(dx, dy) * e.speed * f - e.vy) * k;
}

/**
 * 泯灭者状态机：phase 0=追击（周期环弹） 1=蓄力 2=冲锋。
 * tx=计时/角度复用，ty=冲锋冷却。
 */
function devourerUpdate(state: RunState, e: Enemy, dt: number): void {
  const p = state.player;
  e.t += dt;

  if (e.phase === 0) {
    chase(state, e, dt);
    e.tx -= dt;
    if (e.tx <= 0) {
      e.tx = 3.2;
      fireRing(state, e, 16, 120);
      state.events.sfx.push({ name: 'boss', v: 0.7, p: 1.3 });
    }
    const d = Math.hypot(p.x - e.x, p.y - e.y);
    e.ty -= dt;
    if (e.ty <= 0 && d < 420 && d > 120) {
      e.phase = 1;
      e.t = 0;
      e.vx = 0;
      e.vy = 0;
      state.events.fx.push({ kind: 'telegraph', x: e.x, y: e.y, r: e.r + 10, color: '#ff5b5b' });
    }
  } else if (e.phase === 1) {
    // 蓄力 0.8s，锁定冲锋方向
    e.tx = Math.atan2(p.y - e.y, p.x - e.x);
    if (e.t > 0.8) {
      e.phase = 2;
      e.t = 0;
      e.vx = Math.cos(e.tx) * 620;
      e.vy = Math.sin(e.tx) * 620;
      state.events.sfx.push({ name: 'warning', v: 1, p: 0.7 });
    }
  } else {
    if (e.t > 0.9) {
      e.phase = 0;
      e.ty = 5;
      e.tx = 1;
    }
    if (state.rng.chance(dt * 14)) {
      fireRing(state, e, 3, 90, state.rng.next() * Math.PI * 2);
    }
  }
}

/** 深渊之眼：追击 + 双臂螺旋弹幕 + 周期召唤。 */
function eyeUpdate(state: RunState, e: Enemy, dt: number): void {
  e.t += dt;
  chase(state, e, dt);

  e.tx -= dt;
  if (e.tx <= 0) {
    e.tx = 0.12;
    e.ty += 0.5;
    const a = e.ty;
    for (const off of [0, Math.PI]) {
      const b = state.ebullets.spawn();
      if (b) {
        b.x = e.x;
        b.y = e.y;
        b.vx = Math.cos(a + off) * 150;
        b.vy = Math.sin(a + off) * 150;
        b.r = 7;
        b.dmg = 16;
        b.life = 6;
      }
    }
  }

  e.phase -= dt;
  if (e.phase <= 0) {
    e.phase = 6;
    for (let i = 0; i < 10; i++) {
      const ang = (i / 10) * Math.PI * 2;
      spawnEnemy(state, 'mote', e.x + Math.cos(ang) * 300, e.y + Math.sin(ang) * 300);
    }
    state.events.fx.push({ kind: 'ring', x: e.x, y: e.y, r: 320, color: '#ff4bd8' });
  }
}

function fireRing(state: RunState, e: Enemy, count: number, speed: number, offset = 0): void {
  for (let i = 0; i < count; i++) {
    const a = offset + (i / count) * Math.PI * 2;
    const b = state.ebullets.spawn();
    if (!b) return;
    b.x = e.x;
    b.y = e.y;
    b.vx = Math.cos(a) * speed;
    b.vy = Math.sin(a) * speed;
    b.r = 7;
    b.dmg = 14;
    b.life = 6;
  }
}
