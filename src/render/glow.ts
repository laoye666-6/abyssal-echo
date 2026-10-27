/**
 * 预渲染辉光缓存。
 * 同一颜色 + 尺寸档位的径向渐变只在首次绘制时生成一次，
 * 之后每帧只是一次 drawImage —— 消除每帧上百次 createRadialGradient 的热点。
 * color 必须是 #rrggbb 十六进制；透明度由调用方的 globalAlpha 控制。
 */
export class GlowCache {
  private cache = new Map<string, HTMLCanvasElement>();

  get(color: string, radiusPx: number): HTMLCanvasElement {
    const size = Math.max(24, Math.min(384, Math.ceil((radiusPx * 2) / 24) * 24));
    const key = color + '|' + size;
    let c = this.cache.get(key);
    if (!c) {
      c = document.createElement('canvas');
      c.width = size;
      c.height = size;
      const g = c.getContext('2d')!;
      const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      grad.addColorStop(0, color);
      grad.addColorStop(0.45, this.rgba(color, 0.5));
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, size, size);
      this.cache.set(key, c);
    }
    return c;
  }

  private rgba(hex: string, a: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${a})`;
  }
}
