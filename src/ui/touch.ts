import type { Input } from '@/core/input';

/**
 * 移动端触屏控制：左半屏任意位置按住出现虚拟摇杆，右下角冲刺键。
 * 仅在粗指针设备（手机/平板）上启用；桌面零干扰。
 * 依附 .ui-root 之下的专用层，pointer-events 只在激活时接管。
 */
export class TouchControls {
  private root: HTMLDivElement | null = null;
  private base: HTMLDivElement | null = null;
  private knob: HTMLDivElement | null = null;
  private dashBtn: HTMLDivElement | null = null;
  private pauseBtn: HTMLDivElement | null = null;
  private pointerId: number | null = null;
  private originX = 0;
  private originY = 0;
  private active = false;

  private static readonly RADIUS = 56;

  constructor(
    private readonly input: Input,
    private readonly host: HTMLElement,
    private readonly onPause: () => void,
  ) {
    const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
    const hasTouch = typeof window !== 'undefined' && 'ontouchstart' in window;
    const force = typeof location !== 'undefined' && location.search.includes('touch=1');
    if (!coarse && !hasTouch && !force) return;
    this.build();
  }

  get enabled(): boolean {
    return this.active;
  }

  private build(): void {
    this.active = true;
    const root = document.createElement('div');
    root.className = 'touch-root';
    root.innerHTML = '';
    // 触摸层：接管触摸，但让 click 穿透到 UI（仅在无菜单时激活）
    // pointer-events 常开：菜单层(.screen, z-index 10)在其上不受影响；
    // 空白区域（仅画布）由本层接管触摸
    root.style.cssText = `
      position: absolute; inset: 0; touch-action: none; z-index: 5;
      pointer-events: auto;
    `;
    this.host.appendChild(root);
    this.root = root;

    // 摇杆（动态定位）
    const base = document.createElement('div');
    base.className = 'touch-stick-base';
    base.style.cssText = `
      position: absolute; width: 132px; height: 132px; border-radius: 50%;
      border: 2px solid rgba(91,231,255,0.35); background: rgba(12,20,34,0.35);
      display: none; transform: translate(-50%, -50%); pointer-events: none;
      backdrop-filter: blur(2px);
    `;
    const knob = document.createElement('div');
    knob.className = 'touch-stick-knob';
    knob.style.cssText = `
      position: absolute; width: 56px; height: 56px; border-radius: 50%;
      background: radial-gradient(circle at 35% 30%, rgba(190,240,255,0.9), rgba(91,231,255,0.5));
      box-shadow: 0 0 18px rgba(91,231,255,0.5);
      display: none; transform: translate(-50%, -50%); pointer-events: none;
    `;
    base.appendChild(knob);
    root.appendChild(base);
    this.base = base;
    this.knob = knob;

    // 冲刺键
    const dash = document.createElement('div');
    dash.className = 'touch-dash';
    dash.textContent = '⇢';
    dash.style.cssText = `
      position: absolute; right: 26px; bottom: 40px; width: 84px; height: 84px;
      border-radius: 50%; border: 2px solid rgba(91,231,255,0.5);
      background: rgba(20,40,60,0.5); color: #bfeaff;
      display: flex; align-items: center; justify-content: center;
      font-size: 34px; font-weight: 800; pointer-events: auto;
      user-select: none; -webkit-user-select: none;
    `;
    root.appendChild(dash);
    this.dashBtn = dash;

    // 暂停键
    const pause = document.createElement('div');
    pause.className = 'touch-pause';
    pause.textContent = '❚❚';
    pause.style.cssText = `
      position: absolute; right: 20px; top: 20px; width: 52px; height: 52px;
      border-radius: 12px; border: 1px solid rgba(91,231,255,0.35);
      background: rgba(12,20,34,0.55); color: #bfeaff;
      display: flex; align-items: center; justify-content: center;
      font-size: 16px; pointer-events: auto; user-select: none; -webkit-user-select: none;
    `;
    root.appendChild(pause);
    this.pauseBtn = pause;

    // 事件
    root.addEventListener('pointerdown', (e) => this.onDown(e));
    root.addEventListener('pointermove', (e) => this.onMove(e));
    root.addEventListener('pointerup', (e) => this.onUp(e));
    root.addEventListener('pointercancel', (e) => this.onUp(e));
    dash.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      dash.style.transform = 'scale(0.92)';
      this.input.virtualPress('dash');
    });
    dash.addEventListener('pointerup', () => { dash.style.transform = ''; });
    pause.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.onPause();
    });
  }

  private onDown(e: PointerEvent): void {
    if (!this.root || this.pointerId !== null) return;
    const target = e.target as HTMLElement;
    if (target === this.dashBtn || target === this.pauseBtn) return;
    // 菜单打开时（screen 存在）不抢摇杆
    if (document.querySelector('.screen')) return;
    this.pointerId = e.pointerId;
    this.originX = e.clientX;
    this.originY = e.clientY;
    if (this.base) {
      this.base.style.display = 'block';
      this.base.style.left = `${e.clientX}px`;
      this.base.style.top = `${e.clientY}px`;
    }
    this.knob?.style.setProperty('display', 'block');
    this.knob?.style.setProperty('left', '50%');
    this.knob?.style.setProperty('top', '50%');
  }

  private onMove(e: PointerEvent): void {
    if (e.pointerId !== this.pointerId || !this.knob || !this.base) return;
    const dx = e.clientX - this.originX;
    const dy = e.clientY - this.originY;
    const l = Math.hypot(dx, dy);
    const max = TouchControls.RADIUS;
    const cl = Math.min(l, max);
    const nx = l === 0 ? 0 : (dx / l) * cl;
    const ny = l === 0 ? 0 : (dy / l) * cl;
    this.knob.style.left = `calc(50% + ${nx}px)`;
    this.knob.style.top = `calc(50% + ${ny}px)`;
    // 死区 8px；归一化输出
    if (cl < 8) {
      this.input.setVirtualMove(0, 0);
    } else {
      this.input.setVirtualMove(nx / max, ny / max);
    }
  }

  private onUp(e: PointerEvent): void {
    if (e.pointerId !== this.pointerId) return;
    this.pointerId = null;
    this.input.setVirtualMove(0, 0);
    if (this.base) this.base.style.display = 'none';
    if (this.knob) this.knob.style.display = 'none';
  }
}
