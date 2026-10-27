import type { GameApp } from '@/app';

/**
 * 移动端体验加固：
 *  - 竖屏持机时显示"请横屏"遮罩（游戏为横屏设计）
 *  - 禁用长按菜单/双指缩放误触
 * 桌面端零干扰。
 */
export class MobileGuard {
  private overlay: HTMLDivElement | null = null;

  constructor(private readonly app: GameApp) {
    const coarse = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    if (!coarse) return;

    // 竖屏遮罩
    this.overlay = document.createElement('div');
    this.overlay.className = 'rotate-hint';
    this.overlay.innerHTML = `
      <div class="rotate-icon">
        <svg viewBox="0 0 64 64" width="72" height="72">
          <rect x="14" y="6" width="36" height="52" rx="6" fill="none" stroke="#5be7ff" stroke-width="3"/>
          <path d="M50 32 A18 18 0 0 1 32 50" fill="none" stroke="#5be7ff" stroke-width="3" stroke-dasharray="4 4"/>
          <path d="M46 56 L52 50 L56 57 Z" fill="#5be7ff"/>
        </svg>
      </div>
      <div class="rotate-text">请横持设备</div>
      <div class="rotate-sub">ROTATE YOUR DEVICE</div>
    `;
    document.getElementById('app')!.appendChild(this.overlay);
    const update = () => {
      const portrait = window.innerHeight > window.innerWidth;
      this.overlay!.style.display = portrait ? 'flex' : 'none';
      // 竖屏时暂停对局（避免看不见战场）
      if (portrait && this.app.mode === 'running') this.app.pause();
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', () => setTimeout(update, 120));

    // 禁长按菜单
    window.addEventListener('contextmenu', (e) => e.preventDefault());
  }
}
