import type { RunState } from '@/game/types';
import { formatCompact, formatTime, clamp } from '@/core/math';
import { t } from '@/core/i18n';
import type { Renderer } from './renderer';
import type { Camera } from './camera';

/** Canvas HUD：XP 条、计时、等级/击杀、Boss 血条、横幅、教学提示、冲刺冷却。 */
export class Hud {
  private bannerText = '';
  private bannerT = 0;

  constructor(
    private readonly renderer: Renderer,
    private readonly camera: Camera,
  ) {}

  draw(state: RunState, frameDt: number, phaseLabel: string): void {
    const ctx = this.renderer.context;
    const w = this.renderer.width;
    const h = this.renderer.height;
    const p = state.player;
    const ox = this.camera.ox;
    const oy = this.camera.oy;

    ctx.save();
    ctx.textBaseline = 'alphabetic';

    // ---- XP 条（顶部全宽） ----
    const xpFrac = clamp(state.xp / state.xpToNext, 0, 1);
    ctx.fillStyle = 'rgba(10,16,28,0.75)';
    ctx.fillRect(0, 0, w, 7);
    const grad = ctx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, '#2fa8c8');
    grad.addColorStop(1, '#5be7ff');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w * xpFrac, 7);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(0, 6, w, 1);

    // ---- 计时（顶部中央） ----
    ctx.textAlign = 'center';
    ctx.font = '700 30px ui-monospace, Consolas, monospace';
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillText(formatTime(state.time), w / 2 + 1.5, 47.5);
    ctx.fillStyle = '#dff2ff';
    ctx.fillText(formatTime(state.time), w / 2, 46);
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(150,190,220,0.8)';
    ctx.fillText(phaseLabel, w / 2, 64);

    // ---- 左上：等级 / 击杀 ----
    ctx.textAlign = 'left';
    ctx.font = '700 15px ui-monospace, Consolas, monospace';
    ctx.fillStyle = '#5be7ff';
    ctx.fillText(`${t('hud.level')} ${state.level}`, 16, 34);
    ctx.font = '600 13px ui-monospace, Consolas, monospace';
    ctx.fillStyle = 'rgba(220,235,255,0.85)';
    ctx.fillText(`✦ ${formatCompact(state.kills)}`, 16, 54);

    // ---- 右上：星核 ----
    ctx.textAlign = 'right';
    ctx.font = '700 15px ui-monospace, Consolas, monospace';
    ctx.fillStyle = '#ffc45b';
    ctx.fillText(`◆ ${state.cores}`, w - 16, 34);

    // ---- 玩家血条（跟随玩家） ----
    const hpFrac = clamp(p.hp / state.stats.maxHp, 0, 1);
    const bw = 44;
    const bx = p.x - ox - bw / 2;
    const by = p.y - oy + 26;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(bx - 1, by - 1, bw + 2, 6);
    ctx.fillStyle = hpFrac > 0.3 ? '#8fe86b' : '#ff5b5b';
    ctx.fillRect(bx, by, bw * hpFrac, 4);

    // ---- 冲刺指示（玩家下方） ----
    if (p.dashCd > 0) {
      const frac = 1 - p.dashCd / 6;
      ctx.strokeStyle = 'rgba(91,231,255,0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x - ox, p.y - oy + 40, 5, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.fillStyle = 'rgba(91,231,255,0.9)';
      ctx.beginPath();
      ctx.arc(p.x - ox, p.y - oy + 40, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }

    // ---- Boss 血条 ----
    let bossHp = 0;
    let bossMax = 0;
    let bossName = '';
    state.enemies.forEach((e) => {
      if (e.tier === 'boss') {
        bossHp = e.hp;
        bossMax = e.maxHp;
        bossName = t(`enemy.${e.kind}.name`);
      }
    });
    if (bossMax > 0) {
      const bw2 = Math.min(560, w * 0.6);
      const bx2 = (w - bw2) / 2;
      const by2 = h - 46;
      ctx.fillStyle = 'rgba(8,10,18,0.8)';
      ctx.fillRect(bx2 - 3, by2 - 3, bw2 + 6, 16);
      const g2 = ctx.createLinearGradient(bx2, 0, bx2 + bw2, 0);
      g2.addColorStop(0, '#ff4bd8');
      g2.addColorStop(1, '#ff5b5b');
      ctx.fillStyle = g2;
      ctx.fillRect(bx2, by2, bw2 * clamp(bossHp / bossMax, 0, 1), 10);
      ctx.font = '700 13px system-ui, sans-serif';
      ctx.fillStyle = '#ffd6f4';
      ctx.textAlign = 'center';
      ctx.fillText(bossName.toUpperCase(), w / 2, by2 - 8);
    }

    // ---- 横幅 ----
    if (state.banner) {
      this.bannerText = t(state.banner.key);
      this.bannerT = 0.2;
    }
    if (this.bannerT > 0 && this.bannerText) {
      this.bannerT -= frameDt;
      const a = clamp(this.bannerT / 0.2, 0, 1);
      ctx.textAlign = 'center';
      ctx.font = '700 22px system-ui, sans-serif';
      ctx.fillStyle = `rgba(30,10,14,${(a * 0.9).toFixed(2)})`;
      ctx.fillText(this.bannerText, w / 2 + 1, h * 0.24 + 1);
      ctx.fillStyle = `rgba(255,190,190,${(a * 0.98).toFixed(2)})`;
      ctx.fillText(this.bannerText, w / 2, h * 0.24);
    }

    // ---- 教学提示（开局 13 秒淡出） ----
    if (state.time < 13) {
      const a = 1 - clamp((state.time - 10) / 3, 0, 1);
      if (a > 0) {
        ctx.textAlign = 'center';
        ctx.font = '600 14px system-ui, sans-serif';
        ctx.fillStyle = `rgba(200,225,250,${(a * 0.85).toFixed(2)})`;
        ctx.fillText(t('tut.move'), w / 2, h - 92);
        ctx.fillText(t('tut.auto'), w / 2, h - 70);
        ctx.fillText(t('tut.dash'), w / 2, h - 48);
      }
    }

    ctx.restore();
  }
}
