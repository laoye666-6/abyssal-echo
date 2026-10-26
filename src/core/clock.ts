/**
 * 固定步长游戏时钟：渲染帧率无关，模拟恒定 60Hz。
 * rAF 驱动，帧间隔上限钳制（切后台回来不会狂追帧）。
 */
export const SIM_STEP = 1 / 60;
/** 每帧最多补步数（防止死亡螺旋） */
const MAX_CATCHUP = 4;

export class Clock {
  private acc = 0;
  private last = 0;
  private running = false;
  private raf = 0;

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
    const tick = (now: number) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(tick);
      let frameDt = (now - this.last) / 1000;
      this.last = now;
      if (frameDt > 0.25) frameDt = 0.25; // 后台切回
      this.acc += frameDt;
      let steps = 0;
      while (this.acc >= SIM_STEP && steps < MAX_CATCHUP) {
        this.acc -= SIM_STEP;
        this.simTime += SIM_STEP;
        this.stepFn(SIM_STEP);
        steps++;
      }
      if (steps === MAX_CATCHUP && this.acc > SIM_STEP) this.acc = 0;
      this.renderFn(frameDt);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }
}
