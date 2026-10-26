import type { SaveData, Settings, MetaSnapshot } from '@/game/types';

const KEY = 'abyssal-echo.save.v1';
const VERSION = 1;

export function defaultSettings(): Settings {
  return {
    lang: 'zh',
    sfxVolume: 0.8,
    musicVolume: 0.55,
    screenShake: 1,
    showDamageNumbers: true,
  };
}

export function defaultMeta(): MetaSnapshot {
  return {
    cores: 0,
    upgrades: {},
    unlocked: ['peregrine'],
    bestiary: {},
    lifetimeKills: 0,
    bestTime: 0,
    victories: 0,
    runs: 0,
  };
}

export function defaultSave(): SaveData {
  return { version: VERSION, settings: defaultSettings(), meta: defaultMeta() };
}

/** 深合并防御：任何字段缺失/类型错误都回落默认，保证永远可玩。 */
function mergeMeta(raw: unknown, base: MetaSnapshot): MetaSnapshot {
  const out = base;
  if (raw && typeof raw === 'object') {
    const r = raw as Partial<MetaSnapshot>;
    if (typeof r.cores === 'number' && Number.isFinite(r.cores)) out.cores = Math.max(0, Math.floor(r.cores));
    if (r.upgrades && typeof r.upgrades === 'object') {
      for (const [k, v] of Object.entries(r.upgrades)) {
        if (typeof v === 'number' && Number.isFinite(v)) out.upgrades[k] = Math.max(0, Math.floor(v));
      }
    }
    if (Array.isArray(r.unlocked)) {
      for (const c of r.unlocked) {
        if (c === 'peregrine' || c === 'bastion' || c === 'astraeus') {
          if (!out.unlocked.includes(c)) out.unlocked.push(c);
        }
      }
    }
    if (r.bestiary && typeof r.bestiary === 'object') out.bestiary = { ...r.bestiary };
    if (typeof r.lifetimeKills === 'number') out.lifetimeKills = Math.max(0, Math.floor(r.lifetimeKills));
    if (typeof r.bestTime === 'number') out.bestTime = Math.max(0, r.bestTime);
    if (typeof r.victories === 'number') out.victories = Math.max(0, Math.floor(r.victories));
    if (typeof r.runs === 'number') out.runs = Math.max(0, Math.floor(r.runs));
  }
  return out;
}

export function loadSave(): SaveData {
  const base = defaultSave();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return base;
    const obj = parsed as Record<string, unknown>;
    if (obj.version !== VERSION) return migrate(obj, base);
    if (obj.settings && typeof obj.settings === 'object') {
      const s = obj.settings as Partial<Settings>;
      if (s.lang === 'zh' || s.lang === 'en') base.settings.lang = s.lang;
      if (typeof s.sfxVolume === 'number') base.settings.sfxVolume = clamp01(s.sfxVolume);
      if (typeof s.musicVolume === 'number') base.settings.musicVolume = clamp01(s.musicVolume);
      if (typeof s.screenShake === 'number') base.settings.screenShake = clamp01(s.screenShake);
      if (typeof s.showDamageNumbers === 'boolean') base.settings.showDamageNumbers = s.showDamageNumbers;
    }
    base.meta = mergeMeta(obj.meta, base.meta);
    return base;
  } catch {
    return base;
  }
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function migrate(_old: Record<string, unknown>, base: SaveData): SaveData {
  // 目前只有一个版本；未来版本在此逐级迁移。
  return base;
}

export function persistSave(data: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // 隐私模式/配额满：静默降级为不保存
  }
}

export function wipeSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* noop */
  }
}
