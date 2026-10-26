/**
 * 固定步长游戏时钟：渲染帧率无关，模拟恒定 60Hz。
 * rAF 驱动；当页面被遮挡导致 rAF 挂起时（document.hidden、窗口最小化、
 * 嵌入式面板被覆盖），自动降级为定时器驱动 —— 模拟不中断，恢复后切回。
 */
export const SIM_STEP = 1 / 60;
/** 每帧最多补步数（防止死亡螺旋） */
const MAX_CATCHUP = 4;
/** rAF 静默超过该时长视为挂起（ms） */
const RAF_STARVE_MS = 220;

export class Clock {
  private acc = 0;
  private last = 0;
  private running = false;
  private raf = 0;
  private watchdog = 0;
  private lastRafAt = 0;
  private starved = false;

  /** 模拟累计时间（秒） */
  simTime = 0;

  constructor(
    private readonly stepFn: (dt: number) => void,
    private readonly renderFn: (frameDt: number) => void,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.lastRafAt = this.last;
    this.tick();
    // 看门狗：rAF 挂起时以定时器维持模拟
    let lastStarvedRender = 0;
    this.watchdog = window.setInterval(() => {
      if (!this.running) return;
      const now = performance.now();
      if (now - this.lastRafAt > RAF_STARVE_MS) {
        if (!this.starved) {
          this.starved = true;
          cancelAnimationFrame(this.raf);
        }
        this.pump(now);
        // 挂起期间低频渲染（供截图/画面不完全冻结）
        if (now - lastStarvedRender > 500) {
          lastStarvedRender = now;
          this.renderFn(0.016);
        }
      }
    }, 16);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    clearInterval(this.watchdog);
  }

  private tick = (): void => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.tick);
    const now = performance.now();
    this.lastRafAt = now;
    if (this.starved) {
      // 刚从挂起恢复：重置累加器防跳帧，交还 rAF
      this.starved = false;
      this.acc = 0;
      this.last = now;
    }
    this.pump(now);
    this.renderFn(Math.min(0.25, (now - this.last) / 1000) || 0.016);
    this.last = now;
  };

  /** 推进模拟（rAF 与看门狗共用） */
  private pump(now: number): void {
    let frameDt = (now - this.last) / 1000;
    this.last = now;
    if (frameDt > 0.25) frameDt = 0.25;
    this.acc += frameDt;
    let steps = 0;
    while (this.acc >= SIM_STEP && steps < MAX_CATCHUP) {
      this.acc -= SIM_STEP;
      this.simTime += SIM_STEP;
      this.stepFn(SIM_STEP);
      steps++;
    }
    if (steps === MAX_CATCHUP && this.acc > SIM_STEP) this.acc = 0;
  }
}
