/** 稠密对象池：entity.alive 为开关，遍历永远 O(capacity) 且无 GC 抖动。 */
export interface Pooled {
  alive: boolean;
  id: number;
}

export class Pool<T extends Pooled> {
  readonly items: T[] = [];
  private cursor = 0;
  /** 存活数量缓存 */
  live = 0;

  constructor(
    make: () => T,
    capacity: number,
  ) {
    for (let i = 0; i < capacity; i++) {
      const item = make();
      item.id = i;
      item.alive = false;
      this.items.push(item);
    }
  }

  /** 取一个空闲槽位；池满时复用游标处最旧的（保底不崩溃）。 */
  spawn(): T | null {
    const n = this.items.length;
    for (let i = 0; i < n; i++) {
      const idx = (this.cursor + i) % n;
      const item = this.items[idx]!;
      if (!item.alive) {
        this.cursor = (idx + 1) % n;
        item.alive = true;
        this.live++;
        return item;
      }
    }
    // 池满：覆盖游标处
    const item = this.items[this.cursor]!;
    this.cursor = (this.cursor + 1) % n;
    return item;
  }

  despawn(item: T): void {
    if (item.alive) {
      item.alive = false;
      this.live--;
    }
  }

  clear(): void {
    for (const it of this.items) it.alive = false;
    this.live = 0;
    this.cursor = 0;
  }

  /** 遍历存活项；回调内可安全 despawn 当前项。 */
  forEach(fn: (item: T) => void): void {
    const items = this.items;
    for (let i = 0; i < items.length; i++) {
      const it = items[i]!;
      if (it.alive) fn(it);
    }
  }
}
