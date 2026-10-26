import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  defaultMeta,
  defaultSave,
  defaultSettings,
  loadSave,
  persistSave,
  wipeSave,
} from '@/core/save';

interface StorageLike {
  getItem: (k: string) => string | null;
  setItem: (k: string, v: string) => void;
  removeItem: (k: string) => void;
}

function stubStorage(getItem: (k: string) => string | null): void {
  const storage: StorageLike = { getItem, setItem: () => {}, removeItem: () => {} };
  vi.stubGlobal('localStorage', storage);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('save 存档', () => {
  it('defaultSave 结构完整', () => {
    const s = defaultSave();
    expect(s.version).toBe(1);
    expect(s.settings).toEqual(defaultSettings());
    expect(s.settings).toMatchObject({
      lang: 'zh',
      sfxVolume: 0.8,
      musicVolume: 0.55,
      screenShake: 1,
      showDamageNumbers: true,
    });
    expect(s.meta).toEqual(defaultMeta());
    expect(s.meta.unlocked).toEqual(['peregrine']);
    expect(s.meta.cores).toBe(0);
    expect(s.meta.upgrades).toEqual({});
    expect(s.meta).toMatchObject({
      lifetimeKills: 0,
      bestTime: 0,
      victories: 0,
      runs: 0,
    });
  });

  it('localStorage 为空时 loadSave 返回默认存档且不抛异常', () => {
    stubStorage(() => null);
    let save: ReturnType<typeof loadSave> | null = null;
    expect(() => {
      save = loadSave();
    }).not.toThrow();
    expect(save).toEqual(defaultSave());
  });

  it('损坏 JSON 返回默认存档（防御式回落）', () => {
    stubStorage(() => 'not json{{');
    let save: ReturnType<typeof loadSave> | null = null;
    expect(() => {
      save = loadSave();
    }).not.toThrow();
    expect(save).toEqual(defaultSave());
  });

  it('mergeMeta：非法角色被过滤、负数 cores 被钳制、非法升级被过滤', () => {
    const payload = {
      version: 1,
      settings: {
        lang: 'en',
        sfxVolume: 2, // 超界 -> clamp01 -> 1
        musicVolume: -1, // 超界 -> 0
        screenShake: 0.5,
        showDamageNumbers: false,
      },
      meta: {
        cores: -50,
        upgrades: { vit: 2, junk: 'nope', neg: -3 },
        unlocked: ['bastion', 'astraeus', 'hacker', 'peregrine'],
        bestiary: { mote: 12 },
        lifetimeKills: -10,
        bestTime: 123.7,
        victories: 3,
        runs: 5,
      },
    };
    stubStorage(() => JSON.stringify(payload));
    const s = loadSave();

    expect(s.settings.lang).toBe('en');
    expect(s.settings.sfxVolume).toBe(1);
    expect(s.settings.musicVolume).toBe(0);
    expect(s.settings.screenShake).toBe(0.5);
    expect(s.settings.showDamageNumbers).toBe(false);

    expect(s.meta.cores).toBe(0); // 负数钳 0
    // 非数值升级被过滤；负数等级钳 0
    expect(s.meta.upgrades).toEqual({ vit: 2, neg: 0 });
    // 非法 id 'hacker' 被过滤，'peregrine' 不重复
    expect(s.meta.unlocked).toEqual(['peregrine', 'bastion', 'astraeus']);
    expect(s.meta.bestiary).toEqual({ mote: 12 });
    expect(s.meta.lifetimeKills).toBe(0);
    expect(s.meta.bestTime).toBe(123.7);
    expect(s.meta.victories).toBe(3);
    expect(s.meta.runs).toBe(5);
  });

  it('版本号不匹配时回落默认存档', () => {
    stubStorage(() => JSON.stringify({ version: 99, meta: { cores: 999 } }));
    expect(loadSave()).toEqual(defaultSave());
  });

  it('persistSave / wipeSave 在 stub 的 localStorage 下不抛异常', () => {
    stubStorage(() => null);
    expect(() => persistSave(defaultSave())).not.toThrow();
    expect(() => wipeSave()).not.toThrow();
  });
});
