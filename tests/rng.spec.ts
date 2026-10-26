import { describe, it, expect } from 'vitest';
import { Rng } from '@/core/rng';

describe('Rng（mulberry32 种子随机）', () => {
  it('同种子产生完全一致的序列', () => {
    const a = new Rng(12345);
    const b = new Rng(12345);
    const sa: number[] = [];
    const sb: number[] = [];
    for (let i = 0; i < 1000; i++) {
      sa.push(a.next());
      sb.push(b.next());
    }
    expect(sa).toEqual(sb);
  });

  it('不同种子产生不同序列', () => {
    const a = new Rng(1);
    const b = new Rng(2);
    let differs = false;
    for (let i = 0; i < 100; i++) {
      if (a.next() !== b.next()) {
        differs = true;
        break;
      }
    }
    expect(differs).toBe(true);
  });

  it('range 落在 [min, max)', () => {
    const r = new Rng(7);
    for (let i = 0; i < 5000; i++) {
      const v = r.range(-2.5, 3.5);
      expect(v).toBeGreaterThanOrEqual(-2.5);
      expect(v).toBeLessThan(3.5);
    }
  });

  it('int 含两端（[2,4] 三 个值都能取到，且恒为整数）', () => {
    const r = new Rng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 5000; i++) {
      const v = r.int(2, 4);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThanOrEqual(4);
      seen.add(v);
    }
    expect([...seen].sort((x, y) => x - y)).toEqual([2, 3, 4]);
  });

  it('int(min, min) 恒等于 min', () => {
    const r = new Rng(9);
    for (let i = 0; i < 100; i++) expect(r.int(5, 5)).toBe(5);
  });

  it('weighted：全 0 / 空数组返回 -1', () => {
    const r = new Rng(11);
    expect(r.weighted([])).toBe(-1);
    expect(r.weighted([0, 0, 0])).toBe(-1);
  });

  it('weighted：正常分布下 1 万次每个正权重索引都被命中', () => {
    const r = new Rng(11);
    const weights = [3, 5, 7, 2];
    const hits = new Set<number>();
    for (let i = 0; i < 10000; i++) {
      const idx = r.weighted(weights);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(weights.length);
      hits.add(idx);
    }
    expect(hits.size).toBe(weights.length);
  });

  it('shuffled 返回新数组、不修改原数组、元素集合不变', () => {
    const r = new Rng(13);
    const src = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = r.shuffled(src);
    expect(out).not.toBe(src);
    expect(src).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...out].sort((a, b) => a - b)).toEqual(src);
  });

  it('chance(0) 恒为 false，chance(1) 恒为 true', () => {
    const r = new Rng(17);
    for (let i = 0; i < 1000; i++) {
      expect(r.chance(0)).toBe(false);
      expect(r.chance(1)).toBe(true);
    }
  });
});
