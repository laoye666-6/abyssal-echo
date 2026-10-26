import { describe, it, expect } from 'vitest';
import { Pool, type Pooled } from '@/core/pool';

interface Ent extends Pooled {
  v: number;
}

function makePool(capacity: number): Pool<Ent> {
  return new Pool<Ent>(() => ({ alive: false, id: -1, v: 0 }), capacity);
}

describe('Pool 稠密对象池', () => {
  it('spawn/despawn 计数正确，重复 despawn 安全', () => {
    const p = makePool(4);
    expect(p.live).toBe(0);
    const a = p.spawn();
    const b = p.spawn();
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(p.live).toBe(2);
    expect(a!.alive).toBe(true);

    p.despawn(a!);
    expect(p.live).toBe(1);
    expect(a!.alive).toBe(false);

    p.despawn(a!); // 已死亡的项再次 despawn 不应重复扣减
    expect(p.live).toBe(1);
  });

  it('耗尽后继续 spawn 不崩溃（复用旧槽位），live 不超过容量', () => {
    const p = makePool(3);
    for (let i = 0; i < 10; i++) {
      const e = p.spawn();
      expect(e).not.toBeNull();
      expect(p.live).toBeLessThanOrEqual(3);
    }
    expect(p.live).toBe(3);
  });

  it('despawn 后 spawn 复用同一对象，且 id 稳定', () => {
    const p = makePool(3);
    const a = p.spawn()!;
    const b = p.spawn()!;
    const c = p.spawn()!;
    expect(p.live).toBe(3);
    p.despawn(a);
    const again = p.spawn()!;
    expect(again).toBe(a); // 游标回到 0，取回同一个槽位对象
    expect(again).not.toBe(b);
    expect(again).not.toBe(c);
    expect(again.id).toBe(a.id);
  });

  it('clear 后 live=0、全部标记死亡、可重新 spawn', () => {
    const p = makePool(5);
    for (let i = 0; i < 5; i++) p.spawn();
    expect(p.live).toBe(5);
    p.clear();
    expect(p.live).toBe(0);
    let visited = 0;
    p.forEach(() => visited++);
    expect(visited).toBe(0);
    const e = p.spawn()!;
    expect(e.alive).toBe(true);
    expect(p.live).toBe(1);
  });

  it('forEach 内 despawn 当前元素安全（稠密数组不重排）', () => {
    const p = makePool(6);
    for (let i = 0; i < 4; i++) p.spawn();
    expect(() => p.forEach((e) => p.despawn(e))).not.toThrow();
    expect(p.live).toBe(0);
  });

  it('forEach 只遍历存活项', () => {
    const p = makePool(6);
    const x = p.spawn()!;
    const y = p.spawn()!;
    p.despawn(x);
    const seen: Ent[] = [];
    p.forEach((e) => seen.push(e));
    expect(seen).toEqual([y]);
  });

  it('id 按槽位固定分配（0..capacity-1）', () => {
    const p = makePool(4);
    for (let i = 0; i < 4; i++) {
      const e = p.spawn()!;
      expect(e.id).toBe(i);
    }
  });
});
