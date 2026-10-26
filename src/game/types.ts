/**
 * ============================================================
 *  ABYSSAL ECHO — 全局类型契约（单一事实来源）
 * ------------------------------------------------------------
 *  原则：
 *   1. 模拟层（sim）与表现层（render/audio/ui）只通过本文件的
 *      类型 + RunState.events 通信，禁止反向依赖。
 *   2. 所有数值内容放 src/data/*.ts（纯数据），行为放 weapons/、
 *      enemies/（纯函数），两者都用这里的接口。
 *   3. 模拟使用固定步长 1/60s，所有计时以"秒"为单位。
 * ============================================================
 */

// ---------------- 基础几何 ----------------

export interface Circle {
  x: number;
  y: number;
  r: number;
}

// ---------------- 玩家数值面板 ----------------

/** 聚合后的玩家属性：基础值 + 角色修正 + 元进度 + 被动，全部折算到这里。 */
export interface Stats {
  maxHp: number;
  /** 每秒回复 */
  regen: number;
  /** 像素/秒 */
  moveSpeed: number;
  /** 全局伤害倍率 */
  damageMul: number;
  /** 全局冷却倍率（<1 = 更快） */
  cooldownMul: number;
  /** 全局范围/尺寸倍率 */
  areaMul: number;
  /** 投射物速度倍率 */
  projSpeedMul: number;
  /** 额外投射物数量（整数） */
  projCountBonus: number;
  /** 磁吸拾取半径（像素） */
  pickupRadius: number;
  /** 经验倍率 */
  xpMul: number;
  /** 0..1 */
  critChance: number;
  /** 暴击倍率（1.5 = 150%） */
  critMul: number;
  /** 固定减伤 */
  armor: number;
  /** 影响升级选项权重与掉率，0 = 普通 */
  luck: number;
  /** 本局可用复活次数 */
  revives: number;
}

export function makeStats(): Stats {
  return {
    maxHp: 100,
    regen: 0,
    moveSpeed: 200,
    damageMul: 1,
    cooldownMul: 1,
    areaMul: 1,
    projSpeedMul: 1,
    projCountBonus: 0,
    pickupRadius: 90,
    xpMul: 1,
    critChance: 0.05,
    critMul: 2,
    armor: 0,
    luck: 0,
    revives: 0,
  };
}

// ---------------- 武器 ----------------

export type WeaponId =
  | 'pulse' | 'orbit' | 'nova' | 'arc'
  | 'lance' | 'drones' | 'frost' | 'shard'
  // 进化形态
  | 'pulse_supernova' | 'orbit_corona' | 'nova_collapse' | 'arc_tempest'
  | 'lance_singularity' | 'drones_hive' | 'frost_zero' | 'shard_mirror';

export type PassiveId =
  | 'overdrive' | 'tempo' | 'aero' | 'vessel'
  | 'magnet' | 'optics' | 'cortex' | 'plating';

export interface WeaponInstance {
  id: WeaponId;
  level: number;
  /** 冷却剩余秒数 */
  cd: number;
  /** 武器私有计时（连射间隔等） */
  t: number;
}

export interface PassiveInstance {
  id: PassiveId;
  level: number;
}

/** 每把武器在合成后的独立实现。fire 在冷却归零时被调用。 */
export interface WeaponBehavior {
  /** 基础冷却（秒），实际 = cooldown * stats.cooldownMul */
  cooldown(level: number): number;
  /** 触发开火。可向 state 生成投射物/ attended/ fx 事件。 */
  fire(state: RunState, w: WeaponInstance, stats: Stats): void;
  /** 常驻型武器（orbit/drones/frost）每步更新；返回 true 表示存在。 */
  update?(state: RunState, w: WeaponInstance, stats: Stats, dt: number): void;
}

export interface WeaponDef {
  id: WeaponId;
  /** i18n key 后缀：weapon.<id>.name / .desc / .evoName / .evoDesc */
  maxLevel: number;
  /** 进化所需被动与进化目标；无进化则 undefined */
  evolution?: { passive: PassiveId; into: WeaponId };
  behavior: WeaponBehavior;
}

// ---------------- 被动 ----------------

/** 把被动等级折算进 Stats —— 纯函数，便于测试。 */
export type PassiveApply = (stats: Stats, level: number) => void;

export interface PassiveDef {
  id: PassiveId;
  maxLevel: number;
  /** 每级数值增量描述（供 UI 展示，如 "+8% 伤害"），i18n key: passive.<id>.perLevel */
  apply: PassiveApply;
}

// ---------------- 敌人 ----------------

export type EnemyKindId =
  | 'mote' | 'dart' | 'shardling' | 'stinger' | 'warden'
  | 'splitter' | 'bulwark' | 'phase'
  | 'elite_haste' | 'elite_shield' | 'elite_mother'
  | 'boss_devourer' | 'boss_eye';

export type EnemyBehaviorId =
  | 'chaser' | 'weaver' | 'charger' | 'shooter' | 'orbiter'
  | 'splitter' | 'tank' | 'phaser';

export interface EnemyDef {
  id: EnemyKindId;
  behavior: EnemyBehaviorId;
  hp: number;
  speed: number;
  /** 接触伤害/秒 */
  contactDps: number;
  radius: number;
  xp: number;
  /** 出生权重（director 按阶段选用） */
  weight: number;
  /** 群体生成时的最小同批数量 */
  batch: number;
  /** 击退抗性 0..1 */
  knockbackResist: number;
  /** 精英/Boss 标记 */
  tier: 'normal' | 'elite' | 'boss';
  /** 命名色（渲染层查表） */
  color: string;
  /** 行为微调参数 */
  params?: Record<string, number>;
}

export interface Enemy {
  id: number;
  alive: boolean;
  kind: EnemyKindId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  r: number;
  speed: number;
  contactDps: number;
  xp: number;
  tier: 'normal' | 'elite' | 'boss';
  knockbackResist: number;
  /** 行为私有计时 */
  t: number;
  /** 受击白闪剩余 */
  flash: number;
  /** 缓速剩余秒 */
  slow: number;
  /** 眩晕剩余秒 */
  stun: number;
  /** 行为阶段状态机 */
  phase: number;
  /** 行为目标缓存 */
  tx: number;
  ty: number;
  /** 出生淡入 */
  spawnT: number;
}

// ---------------- 投射物 ----------------

export type ProjectileKind =
  | 'pulse' | 'nova' | 'lance' | 'drone' | 'shard'
  | 'orbit' | 'pulse_supernova' | 'orbit_corona' | 'nova_collapse'
  | 'arc_tempest' | 'lance_singularity' | 'drones_hive' | 'shard_mirror';

export interface Projectile {
  id: number;
  alive: boolean;
  kind: ProjectileKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  dmg: number;
  /** 剩余存在秒数 */
  life: number;
  /** 剩余穿透数 */
  pierce: number;
  /** 弹射剩余次数（shard） */
  bounce: number;
  /** 追踪强度 0..1 */
  homing: number;
  /** 已命中过的敌人（防重复伤害），仅弹射/穿透用 */
  hitIds: Set<number> | null;
  /** 每个目标的重伤间隔 */
  rehit: number;
  /** 命中特效色 */
  color: string;
  /** 自定义数据（drone 目标等） */
  data0: number;
  data1: number;
}

/** 敌方子弹 */
export interface EBullet {
  id: number;
  alive: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  dmg: number;
  life: number;
}

// ---------------- 拾取物 ----------------

export type PickupKind = 'heal' | 'bomb' | 'core';

export interface Gem {
  id: number;
  alive: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  value: number;
  /** 正在被磁吸 */
  pulled: boolean;
  t: number;
}

export interface Pickup {
  id: number;
  alive: boolean;
  kind: PickupKind;
  x: number;
  y: number;
  t: number;
}

// ---------------- 常驻随从（orbit / drones / aura） ----------------

export type AttendantKind = 'orbit' | 'drone' | 'aura';

export interface Attendant {
  id: number;
  alive: boolean;
  kind: AttendantKind;
  ownerWeapon: WeaponId;
  x: number;
  y: number;
  /** 轨道角/朝向 */
  angle: number;
  r: number;
  /** 伤害或每跳伤害 */
  dmg: number;
  /** 独立冷却/计时 */
  cd: number;
  data0: number;
}

// ---------------- 事件（模拟 -> 表现层） ----------------

export interface DamageEvent {
  x: number;
  y: number;
  amount: number;
  crit: boolean;
  /** 打在玩家身上 */
  toPlayer: boolean;
  killed: boolean;
}

export type FxKind =
  | 'explosion' | 'beam' | 'chain' | 'ring' | 'telegraph'
  | 'enemySpawn' | 'enemyDie' | 'levelUp' | 'core' | 'shieldHit' | 'freeze';

export interface FxEvent {
  kind: FxKind;
  x: number;
  y: number;
  x2?: number;
  y2?: number;
  r?: number;
  color: string;
  /** chain 的折线点 */
  points?: number[];
}

export type SfxName =
  | 'shoot' | 'hit' | 'kill' | 'pickup' | 'levelup' | 'hurt'
  | 'enemyDie' | 'boss' | 'ui' | 'evolve' | 'bomb' | 'revive' | 'warning' | 'dash';

export interface SfxEvent {
  name: SfxName;
  /** 音量/音高微调 */
  v: number;
  p: number;
}

// ---------------- 升级选项 ----------------

export type UpgradeOption =
  | { kind: 'newWeapon'; id: WeaponId }
  | { kind: 'weaponLevel'; id: WeaponId; toLevel: number }
  | { kind: 'evolution'; id: WeaponId; into: WeaponId }
  | { kind: 'newPassive'; id: PassiveId }
  | { kind: 'passiveLevel'; id: PassiveId; toLevel: number }
  | { kind: 'heal'; amount: number };

// ---------------- 局内状态 ----------------

export interface DirectorState {
  phaseIndex: number;
  /** 本阶段已流逝秒 */
  phaseT: number;
  /** 当前生成压力累积器 */
  spawnBudget: number;
  /** 已生成敌人总数 */
  spawned: number;
  /** 事件时间轴游标 */
  timelineIdx: number;
  intensity: number;
  bossAlive: boolean;
  bossSpawned: boolean;
  /** boss 是否已结束（死或超时） */
  bossDone: boolean;
  /** 拉回超距敌人的计时 */
  leashT: number;
}

export interface Player {
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  /** 无敌剩余秒 */
  iframe: number;
  /** 朝向弧度 */
  facing: number;
  /** 冲刺冷却（角色技能） */
  dashCd: number;
  dashT: number;
  reviveUsed: number;
  /** 接触伤害累计器（聚合为低频伤害数字） */
  contactAcc: number;
  contactT: number;
}

export interface RunConfig {
  seed: number;
  characterId: CharacterId;
  meta: MetaSnapshot;
}

export interface RunState {
  time: number;
  rng: import('@/core/rng').Rng;
  player: Player;
  stats: Stats;
  enemies: import('@/core/pool').Pool<Enemy>;
  projectiles: import('@/core/pool').Pool<Projectile>;
  ebullets: import('@/core/pool').Pool<EBullet>;
  gems: import('@/core/pool').Pool<Gem>;
  pickups: import('@/core/pool').Pool<Pickup>;
  attendants: import('@/core/pool').Pool<Attendant>;
  weapons: WeaponInstance[];
  passives: PassiveInstance[];
  level: number;
  xp: number;
  xpToNext: number;
  /** 未处理的升级选择次数 */
  pendingLevelUps: number;
  kills: number;
  elitesKilled: number;
  bossesKilled: number;
  damageDealt: number;
  damageTaken: number;
  cores: number;
  director: DirectorState;
  events: {
    damage: DamageEvent[];
    fx: FxEvent[];
    sfx: SfxEvent[];
  };
  /** 局面结束：null = 进行中 */
  over: null | { victory: boolean; reason: 'dead' | 'bossDown' | 'timeUp' };
  /** 下一帧需要暂停升级（表现层读 pendingLevelUps） */
  characterId: CharacterId;
  /** 局内触发的图鉴记录 */
  seen: Set<string>;
  /** 当前 UI 横幅（警告等），t 为剩余秒 */
  banner: { key: string; t: number } | null;
  /** sfx 节流计时（拾取音等高频事件） */
  sfxThrottle: number;
  /** 本局的元进度快照（重算 Stats 用），App 层注入 */
  metaRef?: MetaSnapshot | null;
  /** 当前帧的空间网格（模拟层每步注入，武器随从查询用） */
  gridRef?: unknown;
}

// ---------------- 角色 ----------------

export type CharacterId = 'peregrine' | 'bastion' | 'astraeus';

export interface CharacterDef {
  id: CharacterId;
  stats: Partial<Stats>;
  startWeapon: WeaponId;
  /** 技能描述（i18n key: char.<id>.perk） */
  unlock?: { descKey: string };
}

// ---------------- 元进度（跨局持久化） ----------------

export interface MetaUpgradeNode {
  id: string;
  maxRank: number;
  /** 每级花费，长度 = maxRank */
  costs: number[];
  apply: (stats: Stats, rank: number) => void;
}

export interface MetaSnapshot {
  cores: number;
  upgrades: Record<string, number>;
  unlocked: CharacterId[];
  bestiary: Record<string, number>;
  lifetimeKills: number;
  bestTime: number;
  victories: number;
  runs: number;
}

export interface Settings {
  lang: 'zh' | 'en';
  sfxVolume: number;
  musicVolume: number;
  screenShake: number;
  showDamageNumbers: boolean;
}

export interface SaveData {
  version: number;
  settings: Settings;
  meta: MetaSnapshot;
}

// ---------------- 波次/导演数据 ----------------

export interface WavePhase {
  /** 阶段开始时间（秒） */
  at: number;
  /** 每秒生成配额（个/秒，随时间线性升到 endRate） */
  startRate: number;
  endRate: number;
  /** 该阶段可选敌人 id + 权重 */
  pool: { id: EnemyKindId; w: number }[];
  /** 音乐强度 0..1 */
  intensity: number;
}

export interface TimelineEvent {
  at: number;
  kind:
    | { type: 'elite'; id: EnemyKindId }
    | { type: 'boss'; id: EnemyKindId }
    | { type: 'swarm'; id: EnemyKindId; count: number }
    | { type: 'pickupDrop'; kind: PickupKind }
    | { type: 'warning'; key: string };
}
