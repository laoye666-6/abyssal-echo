import type { TimelineEvent, WavePhase } from '@/game/types';

/** 相位推进表：密度爬升 + 敌人构成。 */
export const WAVE_PHASES: WavePhase[] = [
  { at: 0,   startRate: 0.9, endRate: 1.7, pool: [{ id: 'mote', w: 90 }, { id: 'dart', w: 10 }], intensity: 0.25 },
  { at: 60,  startRate: 1.7, endRate: 2.4, pool: [{ id: 'mote', w: 55 }, { id: 'dart', w: 35 }, { id: 'stinger', w: 18 }], intensity: 0.35 },
  { at: 120, startRate: 2.4, endRate: 3.2, pool: [{ id: 'mote', w: 40 }, { id: 'dart', w: 30 }, { id: 'stinger', w: 22 }, { id: 'shardling', w: 18 }], intensity: 0.45 },
  { at: 180, startRate: 3.2, endRate: 3.9, pool: [{ id: 'dart', w: 30 }, { id: 'stinger', w: 24 }, { id: 'shardling', w: 22 }, { id: 'warden', w: 14 }, { id: 'mote', w: 30 }], intensity: 0.55 },
  { at: 240, startRate: 2.4, endRate: 4.4, pool: [{ id: 'mote', w: 36 }, { id: 'dart', w: 28 }, { id: 'stinger', w: 20 }, { id: 'shardling', w: 18 }, { id: 'warden', w: 12 }, { id: 'phase', w: 8 }], intensity: 0.6 },
  { at: 300, startRate: 4.4, endRate: 5.2, pool: [{ id: 'stinger', w: 22 }, { id: 'shardling', w: 20 }, { id: 'warden', w: 14 }, { id: 'phase', w: 12 }, { id: 'splitter', w: 10 }, { id: 'mote', w: 26 }], intensity: 0.7 },
  { at: 360, startRate: 5.2, endRate: 6.0, pool: [{ id: 'stinger', w: 18 }, { id: 'shardling', w: 18 }, { id: 'warden', w: 14 }, { id: 'phase', w: 12 }, { id: 'splitter', w: 14 }, { id: 'bulwark', w: 8 }, { id: 'mote', w: 20 }], intensity: 0.8 },
  { at: 420, startRate: 6.0, endRate: 6.9, pool: [{ id: 'shardling', w: 18 }, { id: 'warden', w: 14 }, { id: 'phase', w: 14 }, { id: 'splitter', w: 16 }, { id: 'bulwark', w: 12 }, { id: 'mote', w: 16 }], intensity: 0.9 },
  { at: 480, startRate: 6.9, endRate: 7.8, pool: [{ id: 'shardling', w: 16 }, { id: 'warden', w: 14 }, { id: 'phase', w: 16 }, { id: 'splitter', w: 18 }, { id: 'bulwark', w: 16 }], intensity: 1.0 },
];

/** 时间轴事件：精英、虫潮、Boss、补给。 */
export const TIMELINE: TimelineEvent[] = [
  { at: 75,  kind: { type: 'warning', key: 'warning.elite' } },
  { at: 90,  kind: { type: 'elite', id: 'elite_haste' } },
  { at: 150, kind: { type: 'swarm', id: 'mote', count: 26 } },
  { at: 165, kind: { type: 'warning', key: 'warning.elite' } },
  { at: 180, kind: { type: 'elite', id: 'elite_shield' } },
  { at: 210, kind: { type: 'pickupDrop', kind: 'heal' } },
  { at: 228, kind: { type: 'warning', key: 'warning.boss' } },
  { at: 240, kind: { type: 'boss', id: 'boss_devourer' } },
  { at: 270, kind: { type: 'swarm', id: 'dart', count: 22 } },
  { at: 295, kind: { type: 'warning', key: 'warning.elite' } },
  { at: 300, kind: { type: 'elite', id: 'elite_mother' } },
  { at: 330, kind: { type: 'pickupDrop', kind: 'heal' } },
  { at: 350, kind: { type: 'warning', key: 'warning.elite' } },
  { at: 360, kind: { type: 'elite', id: 'elite_shield' } },
  { at: 390, kind: { type: 'elite', id: 'elite_haste' } },
  { at: 420, kind: { type: 'swarm', id: 'stinger', count: 18 } },
  { at: 440, kind: { type: 'pickupDrop', kind: 'heal' } },
  { at: 450, kind: { type: 'elite', id: 'elite_mother' } },
  { at: 470, kind: { type: 'elite', id: 'elite_haste' } },
  { at: 500, kind: { type: 'elite', id: 'elite_echo' } },
  { at: 520, kind: { type: 'warning', key: 'warning.finalboss' } },
  { at: 540, kind: { type: 'boss', id: 'boss_eye' } },
];
