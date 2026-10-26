/** 键盘输入 + 动作映射。 */
export type ActionId = 'up' | 'down' | 'left' | 'right' | 'pause' | 'dash' | 'confirm';

const KEYMAP: Record<string, ActionId> = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  Space: 'dash',
  Escape: 'pause',
  KeyP: 'pause',
  Enter: 'confirm',
};

export class Input {
  private down = new Set<ActionId>();
  private pressedFrame = new Set<ActionId>();

  /** 消费式：本帧刚按下 */
  private justPressed = new Set<ActionId>();

  attach(target: Window): void {
    target.addEventListener('keydown', (e) => {
      const a = KEYMAP[e.code];
      if (!a) return;
      // 阻止方向键/空格滚动页面
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
      if (!this.down.has(a)) this.pressedFrame.add(a);
      this.down.add(a);
    });
    target.addEventListener('keyup', (e) => {
      const a = KEYMAP[e.code];
      if (a) this.down.delete(a);
    });
    target.addEventListener('blur', () => this.down.clear());
  }

  /** 每帧末调用 */
  endFrame(): void {
    this.justPressed.clear();
    for (const a of this.pressedFrame) this.justPressed.add(a);
    this.pressedFrame.clear();
  }

  held(a: ActionId): boolean {
    return this.down.has(a);
  }

  pressed(a: ActionId): boolean {
    return this.justPressed.has(a);
  }

  /** 归一化移动向量 */
  moveVec(): { x: number; y: number } {
    let x = 0;
    let y = 0;
    if (this.held('left')) x -= 1;
    if (this.held('right')) x += 1;
    if (this.held('up')) y -= 1;
    if (this.held('down')) y += 1;
    if (x !== 0 && y !== 0) {
      const inv = 1 / Math.SQRT2;
      x *= inv;
      y *= inv;
    }
    return { x, y };
  }
}
