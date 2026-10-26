/**
 * 模拟主步进：固定 1/60s。表现层完全通过 events 观察这里。
 * 调用方保证：over == null 时才调用。
 */
import type { RunState } from './types';
import { EnemyGrid, damagePlayer, dealDamageToEnemy, explode, tryRevive } from './combat';
import { updateEnemy } from './enemies';
import { WEAPON_BEHAVIORS } from './weapons';
import { stepDirector, leashEnemies } from './director';
import { RUN_HARD_CAP, xpToNext } from './balance';
import { damp, dist2 } from '@/core/math';

export interface SimControl {
  /** 归一化移动输入 */
  mx: number;
  my: number;
  dash: boolean;
}

export function stepSim(state: RunState, dt: number, ctrl: SimControl, grid: EnemyGrid): void {
  if (state.over) return;
  state.time += dt;
  state.gridRef = grid;
  const p = state.player;
  const stats = state.stats;

  // ---------- 玩家 ----------
  p.dashCd -= dt;
  p.dashT -= dt;
  p.iframe -= dt;
  if (ctrl.dash && p.dashCd <= 0) {
    p.dashCd = 6;
    p.dashT = 0.18;
    p.iframe = Math.max(p.iframe, 0.35);
    const dirX = ctrl.mx !== 0 || ctrl.my !== 0 ? ctrl.mx : Math.cos(p.facing);
    const dirY = ctrl.mx !== 0 || ctrl.my !== 0 ? ctrl.my : Math.sin(p.facing);
    const l = Math.hypot(dirX, dirY) || 1;
    p.vx = (dirX / l) * stats.moveSpeed * 3.1;
    p.vy = (dirY / l) * stats.moveSpeed * 3.1;
    state.events.sfx.push({ name: 'dash', v: 0.6, p: 1 });
  }

  if (p.dashT <= 0) {
    p.vx = damp(p.vx, ctrl.mx * stats.moveSpeed, 14, dt);
    p.vy = damp(p.vy, ctrl.my * stats.moveSpeed, 14, dt);
  }
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  const sp = Math.hypot(p.vx, p.vy);
  if (sp > 12) p.facing = Math.atan2(p.vy, p.vx);

  if (stats.regen > 0 && p.hp > 0) {
    p.hp = Math.min(stats.maxHp, p.hp + stats.regen * dt);
  }

  // ---------- 空间网格 ----------
  grid.clear();
  state.enemies.forEach((e) => grid.insert(e));

  // ---------- 导演 ----------
  stepDirector(state, dt);
  state.director.leashT -= dt;
  if (state.director.leashT <= 0) {
    state.director.leashT = 0.5;
    leashEnemies(state);
  }

  // ---------- 武器 ----------
  for (const w of state.weapons) {
    const behavior = WEAPON_BEHAVIORS[w.id];
    if (!behavior) continue;
    w.cd -= dt;
    if (w.cd <= 0 && !behavior.update) {
      behavior.fire(state, w, stats);
      w.cd = behavior.cooldown(w.level) * stats.cooldownMul;
    }
    behavior.update?.(state, w, stats, dt);
  }

  // ---------- 敌人 ----------
  state.enemies.forEach((e) => updateEnemy(state, e, dt));

  // 接触伤害：以 0.3s 窗口聚合（防伤害数字刷屏），护甲按窗口折算
  p.contactT -= dt;
  state.enemies.forEach((e) => {
    if (e.spawnT > 0) return;
    const rr = (e.r + 14) * (e.r + 14);
    if (dist2(e.x, e.y, p.x, p.y) <= rr) {
      p.contactAcc += e.contactDps * dt;
    }
  });
  if (p.contactT <= 0) {
    p.contactT = 0.3;
    if (p.contactAcc > 0 && !state.over) {
      const chunk = Math.max(1, p.contactAcc - stats.armor * 0.3);
      p.hp -= chunk;
      state.damageTaken += chunk;
      state.events.damage.push({ x: p.x, y: p.y - 20, amount: Math.round(chunk), crit: false, toPlayer: true, killed: false });
      state.events.sfx.push({ name: 'hurt', v: 0.8, p: 1 });
      p.contactAcc = 0;
      p.iframe = Math.max(p.iframe, 0.12);
      if (p.hp <= 0) tryRevive(state);
    }
  }

  // ---------- 投射物 ----------
  state.projectiles.forEach((pr) => {
    if (pr.homing > 0) {
      const t = nearestTo(grid, pr.x, pr.y, 300, pr.hitIds);
      if (t) {
        const dx = t.x - pr.x;
        const dy = t.y - pr.y;
        const l = Math.hypot(dx, dy) || 1;
        const curSpeed = Math.hypot(pr.vx, pr.vy) || 1;
        const k = Math.min(1, pr.homing * dt * 8);
        pr.vx += ((dx / l) * curSpeed - pr.vx) * k;
        pr.vy += ((dy / l) * curSpeed - pr.vy) * k;
      }
    }
    pr.x += pr.vx * dt;
    pr.y += pr.vy * dt;
    pr.life -= dt;

    if (pr.life <= 0) {
      if (pr.kind === 'nova_collapse') {
        explode(state, pr.x, pr.y, 130 * state.stats.areaMul, pr.dmg * 1.1, '#ff8b5b', grid, 120);
      }
      state.projectiles.despawn(pr);
      return;
    }

    // 碰撞
    let consumed = false;
    grid.query(pr.x, pr.y, pr.r + 40, (e) => {
      if (consumed || !e.alive || e.spawnT > 0) return;
      if (pr.hitIds?.has(e.id)) return;
      const rr = (pr.r + e.r) * (pr.r + e.r);
      if (dist2(pr.x, pr.y, e.x, e.y) > rr) return;

      dealDamageToEnemy(state, e, pr.dmg, { knockback: 70, fromX: pr.x - pr.vx * 0.02, fromY: pr.y - pr.vy * 0.02 });
      state.events.fx.push({ kind: 'shieldHit', x: pr.x, y: pr.y, r: pr.r * 1.4, color: pr.color });

      // 超新星：命中迸裂
      if (pr.kind === 'pulse_supernova' && pr.data0 > 0) {
        explode(state, e.x, e.y, 60 * state.stats.areaMul, pr.data0, '#ffe45b', grid, 50);
      }

      if (pr.pierce > 0) {
        pr.pierce--;
        pr.hitIds?.add(e.id);
        return;
      }
      if (pr.bounce > 0) {
        pr.bounce--;
        pr.hitIds?.add(e.id);
        const next = nearestTo(grid, pr.x, pr.y, 240, pr.hitIds);
        if (next) {
          const dx = next.x - pr.x;
          const dy = next.y - pr.y;
          const l = Math.hypot(dx, dy) || 1;
          const spd = Math.hypot(pr.vx, pr.vy) || 1;
          pr.vx = (dx / l) * spd;
          pr.vy = (dy / l) * spd;
          pr.life = Math.max(pr.life, 1.2);
        } else {
          consumed = true;
        }
        return;
      }
      consumed = true;
    });
    if (consumed) state.projectiles.despawn(pr);
  });

  // ---------- 敌方子弹 ----------
  state.ebullets.forEach((b) => {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0) {
      state.ebullets.despawn(b);
      return;
    }
    if (dist2(b.x, b.y, p.x, p.y) < (b.r + 12) * (b.r + 12)) {
      if (p.iframe <= 0 && !state.over) {
        damagePlayer(state, b.dmg);
        state.ebullets.despawn(b);
      }
      return;
    }
    if (dist2(b.x, b.y, p.x, p.y) > 1400 * 1400) state.ebullets.despawn(b);
  });

  // ---------- 经验宝石 ----------
  state.sfxThrottle -= dt;
  const prR = stats.pickupRadius;
  state.gems.forEach((g) => {
    g.t += dt;
    if (!g.pulled) {
      const d2 = dist2(g.x, g.y, p.x, p.y);
      // 硬拾取 + 软磁吸（3 倍半径内自动吸附，覆盖常规击杀距离）
      if (d2 <= prR * prR || (g.t > 0.25 && d2 <= (prR * 3) * (prR * 3))) {
        g.pulled = true;
      } else if (g.t > 15) {
        // 久置宝石缓慢漂向玩家（防挫败：远处击杀的经验不会永久滞留）
        const dx = p.x - g.x;
        const dy = p.y - g.y;
        const l = Math.hypot(dx, dy) || 1;
        const drift = Math.min(70, (g.t - 15) * 6);
        g.x += (dx / l) * drift * dt;
        g.y += (dy / l) * drift * dt;
      }
      return;
    }
    const dx = p.x - g.x;
    const dy = p.y - g.y;
    const l = Math.hypot(dx, dy) || 1;
    const speed = 560 + g.t * 300;
    g.x += (dx / l) * speed * dt;
    g.y += (dy / l) * speed * dt;
    if (l < 18) {
      state.gems.despawn(g);
      state.xp += g.value * stats.xpMul;
      if (state.sfxThrottle <= 0) {
        state.sfxThrottle = 0.06;
        state.events.sfx.push({ name: 'pickup', v: 0.3, p: 1 + Math.min(1, state.xp / state.xpToNext) * 0.4 });
      }
      while (state.xp >= state.xpToNext) {
        state.xp -= state.xpToNext;
        state.level++;
        state.xpToNext = xpToNext(state.level);
        state.pendingLevelUps++;
        state.events.sfx.push({ name: 'levelup', v: 1, p: 1 });
        state.events.fx.push({ kind: 'levelUp', x: p.x, y: p.y, r: 90, color: '#5be7ff' });
      }
    }
  });

  // ---------- 功能拾取 ----------
  state.pickups.forEach((pk) => {
    pk.t += dt;
    if (dist2(pk.x, pk.y, p.x, p.y) > (prR * 1.5) * (prR * 1.5)) return;
    state.pickups.despawn(pk);
    switch (pk.kind) {
      case 'heal': {
        p.hp = Math.min(stats.maxHp, p.hp + stats.maxHp * 0.3);
        state.events.fx.push({ kind: 'levelUp', x: p.x, y: p.y, r: 70, color: '#8fe86b' });
        state.events.sfx.push({ name: 'pickup', v: 1, p: 0.6 });
        break;
      }
      case 'bomb': {
        explode(state, p.x, p.y, 340, 320 * (1 + state.time / 240), '#ffd75b', grid, 260);
        state.events.sfx.push({ name: 'bomb', v: 1, p: 1 });
        state.events.fx.push({ kind: 'ring', x: p.x, y: p.y, r: 340, color: '#ffd75b' });
        break;
      }
      case 'core':
        state.cores += 5;
        state.events.sfx.push({ name: 'pickup', v: 1, p: 1.5 });
        break;
    }
  });

  // ---------- 结束判定 ----------
  if (!state.over && state.time > RUN_HARD_CAP) {
    state.over = { victory: false, reason: 'timeUp' };
  }

  // ---------- 事件护栏（挂起/看门狗模式下表现层可能长时间不消费） ----------
  if (state.events.damage.length > 300) state.events.damage.splice(0, state.events.damage.length - 300);
  if (state.events.fx.length > 200) state.events.fx.splice(0, state.events.fx.length - 200);
  if (state.events.sfx.length > 24) state.events.sfx.splice(0, state.events.sfx.length - 24);
}

/** 网格内最近敌人（排除已命中集合）。 */
function nearestTo(grid: EnemyGrid, x: number, y: number, maxDist: number, exclude: Set<number> | null): { x: number; y: number } | null {
  let best: { x: number; y: number; d: number } | null = null;
  grid.query(x, y, maxDist, (e) => {
    if (!e.alive || e.spawnT > 0) return;
    if (exclude?.has(e.id)) return;
    const dx = e.x - x;
    const dy = e.y - y;
    const d = dx * dx + dy * dy;
    const md = maxDist * maxDist;
    if (d <= md && (!best || d < best.d)) best = { x: e.x, y: e.y, d };
  });
  return best;
}
