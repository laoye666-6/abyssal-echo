# 星渊回响 · 设计文档（DESIGN.md）

面向设计者与平衡调参者。所有数值均从代码/数据文件提取，标注 `文件:行号`；文中"约"字标注的数值为按公式换算的结果。
配套阅读：`docs/ARCHITECTURE.md`（实现结构）、`src/game/types.ts`（类型契约）。

---

## 1. 核心循环设计意图

### 1.1 循环骨架

```
移动躲避 → 自动击杀 → 拾取经验 → 升级三选一 → 构筑成型 → 进化质变 → 波次压力升级 → Boss 战 → 结算星核 → 跨局强化 → 更远的下一局
```

### 1.2 为什么是"三选一"

- **选择的代价可计算**：候选池按权重抽取（`src/game/upgrades.ts:55-72`）——新武器 10+luck、武器升级 9、新被动 8+luck×0.5、被动升级 9。玩家可以感知到"满级推进"比"开新坑"略优先，但幸运会轻微拉高新内容的出现率，形成"想开荒就点幸运"的隐性决策。
- **栏位制造张力**：武器/被动各限 4 栏（`src/data/weapons.data.ts:36-37`）。8 选 4 的武器、8 选 4 的被动意味着每局必然放弃一半 arsenal——三选一不再是"全都要"的流水账，而是持续取舍。
- **兜底不挫败**：候选不足 3 个时用"治疗"补位（固定回复 20% 最大生命，`src/game/upgrades.ts:99-101`），升级界面永远可选"跳过（回复 15% 生命）"（`src/ui/ui.ts:292-295`）。 <!-- v1.1 校对 -->
- **进化必现**：满足进化条件时必占第一格（每帧最多提示一个，保持仪式感，`src/game/upgrades.ts:44-49`）。

### 1.3 为什么进化绑被动

每把武器绑定一条**功能上互补**的被动（`src/data/weapons.data.ts:11-18`）：

| 武器 | 绑定被动 | 设计逻辑 |
| --- | --- | --- |
| pulse 脉冲星尘 | optics 聚焦棱镜（暴击） | 追踪弹主打稳定覆盖，暴击给它上限 |
| orbit 星环刃 | plating 蜂甲镀层（护甲） | 贴身武器 → 玩它的人本来就要堆生存 |
| nova 新星爆发 | vessel 生体舱壁（生命/回复） | "被围时的救命弹幕"奖励偏肉build |
| arc 链式电弧 | tempo 共振齿轮（冷却） | 跳数有限 → 频率就是输出 |
| lance 贯穿射线 | overdrive 过载核心（伤害） | 窄而深的波，纯数值放大最爽 |
| drones 蜂群无人机 | cortex 学者回路（经验） | 自主清杂 → 经验机器 |
| frost 霜蚀领域 | aero 气垫阵列（移速） | 减速控场 + 自己跑得快 = 风筝 |
| shard 回响晶刃 | magnet 引力锚（拾取） | 弹射杀远处的怪 → 拾取半径决定经验回收 |

这个绑定的作用：**进化不是一个孤立的满级节点，而是一个构筑宣言**——玩家必须围绕武器吞下一条"不直接加伤害"的被动，付出 3 个升级位（武器 4 级 + 被动 2 级）作为门票。进化条件判定：武器满 5 级 + 被动 ≥3 级 + 尚无进化形态（`src/game/upgrades.ts:30-38`）。

### 1.4 压力曲线如何设计

三层曲线叠加，见第 5 节的相位表与时间轴表：

1. **密度线**（每秒生成速率）：0.9 → 7.8 个/秒，9 个相位逐级抬升，其中 4:00 相位刻意回落起点（2.4 起）给 Boss 战让路；
2. **质量线**（单敌强度）：血量按超线性曲线成长（10 分钟约 10.5 倍），伤害线性成长（每分钟 +16%），敌人池逐相位引入更"重"的行为（shooter → splitter → tank）；
3. **事件线**（时间轴）：75 秒预告首个精英，150 秒虫潮，4:00/9:00 两次 Boss。事件线负责"记忆点"，前两条线负责"底噪"。

最终目标锁定 9:00 击杀深渊之眼（`src/game/balance.ts:9`），11:00 硬超时判负（`balance.ts:11`），避免无限拖延。

---

## 2. 数值框架

### 2.1 玩家基础面板（`src/game/types.ts:57-75`）

生命 100 · 回复 0 · 移速 200 · 伤害 ×1 · 冷却 ×1 · 范围 ×1 · 弹速 ×1 · 追加弹 0 · 拾取半径 90 · 经验 ×1 · 暴击 5%/×2 · 护甲 0 · 幸运 0 · 复活 0。

角色在此基础上绝对覆盖部分字段（`src/game/state.ts:11-26`），星核节点与被动再叠乘/叠加。暴击判定上限 95%（`src/game/balance.ts:33-35`）。

### 2.2 经验曲线

```ts
// src/game/balance.ts:14-16
xpToNext(level) = round(4 + level*5 + level^1.6 * 1.5) <!-- v1.1 校对 -->
```

| 等级 | 1 | 5 | 10 | 20 | 30 |
| --- | --- | --- | --- | --- | --- |
| 升级所需 XP | 11 | 49 | 114 | 285 | 500 | <!-- v1.1 校对 -->

线性项 `5×level` 保证前期每 10~20 秒一次升级（正反馈密）；`level^1.6` 项让后期升级间隔自然拉长，把决策重心从"频繁三选一"过渡到"波次与走位"。经验宝石基础值 = 敌人 xp 字段（1~120，见 `enemies.data.ts`），乘以 `stats.xpMul`。防挫败三件套（`src/game/sim.ts:197-237`）： <!-- v1.1 校对 -->

- 3 倍拾取半径内宝石自动吸附（出生 0.25 秒后）；
- 落地 15 秒后的宝石以最高 70px/s 向玩家漂移——远处击杀的经验不会永久滞留；
- 已吸附宝石以 560+t×300 的速度冲向玩家。

### 2.3 敌人成长公式

```ts
// src/game/balance.ts:19-25
enemyHpScale(t)  = 1 + (t/60)^1.42 * 0.42
enemyDmgScale(t) = 1 + t/60 * 0.16
```

| 时间 | 0 | 60s | 120s | 240s | 360s | 480s | 540s | 780s |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 血量倍率 | 1.00 | 1.42 | 2.12 | 4.01 | 6.35 | 9.05 | ≈10.5 | ≈13.7 |
| 伤害倍率 | 1.00 | 1.16 | 1.32 | 1.64 | 1.96 | 2.28 | 2.44 | 2.76 |

- 血量指数取 **1.42**：略高于线性的超线性，让"前期的神装"在后期仍需要进化与星核加持，但不会陡到劝退。
- 伤害只取 **线性 +16%/分钟**：死亡惩罚主要来自"被围住"（多源叠加），而不是单次接触惩罚，鼓励走位而非恐吓。
- 接触伤害以 **0.3 秒窗口聚合**后一次性结算（护甲按窗口折算 ×0.3，附 0.12 秒无敌帧），防止贴脸每帧掉血刷屏（`src/game/sim.ts:83-104`）；弹丸类伤害独立结算，0.35 秒无敌帧（`src/game/combat.ts:243-256`）。
- 护甲为**固定减伤**，下限 1（`balance.ts:28-30`）——对高频低伤的接触流收益极高，这正是 orbit/frost 玩家的成长通道。

Boss 额外乘 **1.8**（`balance.ts:49-51`），且按生成时刻换算：泯灭者 4:00 登场约 1.6 万有效血（2200 × 4.01 × 1.8），深渊之眼 9:00 登场约 5.7 万（3000 × 10.5 × 1.8）。 <!-- v1.1 校对 -->

### 2.4 密度上限

```ts
// src/game/balance.ts:38-40
maxEnemiesAt(t) = round(clamp(90 + t*0.5, 90, 300)) <!-- v1.1 校对 -->
```

约在 **7:00** 触顶 300。它是渲染性能与画面可读性的总闸，同时约束导演的 while 生成循环与 swarm 事件（swarm 允许超上限 40，`src/game/director.ts:111`）。 <!-- v1.1 校对 -->

### 2.5 星核经济（跨局货币）

```ts
// src/game/balance.ts:48-51
coresEarned = floor(kills/45) + elites*3 + bosses*12 + floor(time/30) (+25 if victory)
```

局内即时入账：精英击杀 +2（35% 掉治疗，`src/game/combat.ts:177-181`）、Boss 击杀 +10（掉治疗+炸弹，`combat.ts:183-189`）、金色核心拾取物 +5（`src/game/sim.ts:257-259`）。结算时局内核与公式核合并写入 `meta.cores`（`src/app.ts:207-217`）。

**经济定位**：以一局 9 分钟胜利局（按 900 击杀、5 精英、2 Boss 计）为例：公式产出 = 20(击杀) + 15(精英) + 24(Boss) + 18(时间) + 25(胜利) ≈ **102 星核**，另有局内即时入账（精英 +2×5、Boss +10×2、金色核心若干）合计约 **130 星核**。首件强化（15 核）1 局可得，复活（380 核）是终极储蓄目标，全树 2415 核约 20~30 局（视存活时长）。时间项 `floor(time/30)` 保证"死得早也有分红"——3 分钟死亡局也有约 30 核入账，符合 roguelite"失败也变强"的底线。

### 2.6 幸运（luck）的杠杆点

幸运只动三处：升级池新武器权重 +1/点、新被动权重 +0.5/点（`upgrades.ts:57,66`）、普通敌人掉落判定 +0.4%/点（`combat.ts:198`，配合 3% 基础率触发击杀音效层）。它是"改变手感而不破坏数值"的软强化。

---

## 3. 武器设计表

全部行为实现位于 `src/game/weapons/`；等级系数 `levelMul(lv, per) = 1 + per*(lv-1)`（`helpers.ts:63-65`）。下表"满级"指 5 级数值，含全局 `stats.damageMul` 之前的基础值。8 把武器刻意覆盖四种"索敌方式 × 伤害形状"，保证任意 4 栏组合都有输出重叠区。 <!-- v1.1 校对 -->

| 武器 | 冷却（1→5 级） | 伤害（1 级→满级） | 形状与手感 | 关键参数 | 进化后（按 5 级系数结算） |
| --- | --- | --- | --- | --- | --- |
| **脉冲星尘** pulse | 0.85s→0.65s（-0.05/级） | 10 → 10×1.6=16 | 单发追踪弹，永远有产出 | 弹速 430、存活 2.2s、追踪 0.55；3 级 +1 发、5 级再 +1 发 | **超新星脉冲**：3 发、伤害 18、半径 8、追踪 0.7；命中迸裂小爆炸（半径 60×area，伤害 10×damageMul×areaMul，击退 50，`sim.ts:144-146`） |
| **星环刃** orbit | 常驻（update 型） | 13 → 13×1.72≈22.4/刀 | 环体贴身保险，无操作输出 | 刃数 1+等级（2→6）、半径 58+8×等级、角速 2.2+0.15×等级、单体重伤间隔 0.45s | **冕环之环**：8 刃、半径 105×area、伤害 26、角速 3.0、重伤间隔 0.3s |
| **新星爆发** nova | 2.7s→2.22s（-0.12/级） | 11 → 11×1.64≈18/瓣 | 环形弹幕，被围时全方位救场 | 瓣数 6+2×等级（8→16）、弹速 300、存活 0.8s、穿透 1 | **引力坍缩**：18 瓣、伤害 30、穿透 2；发射瞬间把 180×area 内敌人向内牵引 200×(1-击退抗性)（`nova.ts:32-45`）；弹消失时爆出 130×area 大爆炸（伤害×1.1，击退 120，`sim.ts:124-127`） |
| **链式电弧** arc | 2.0s→1.6s（-0.1/级） | 13 → 13×1.6≈20.8 首跳 | 闪电在敌人间跳跃，逐跳衰减 ×0.78 | 链数 2+等级（3→7）、主索敌半径 260×area、跳距 150×area | **天穹之怒**：9 跳、首跳 15、命中附带 0.35s 眩晕（`arc.ts:36`） |
| **贯穿射线** lance | 1.8s→1.4s（-0.1/级） | 20 → 20×1.8=36 | 瞬时线段判定，穿透一切，对轴爆发 | 长度 400+30×等级、宽 9+2.5×等级、击退 90；优先瞄准 520px 内最近敌人 | **奇点光矛**：伤害 44、长 720、宽 30、击退 140 |
| **蜂群无人机** drones | 常驻（update 型） | 8 → 8×1.64≈13.1/啄 | 自主索敌（520px），命中后回弹防抖 | 机数 1+等级（2→6）、速 270×projSpeed、单机命中冷却 0.55s | **星群蜂巢**：8 机、伤害 12、速 300、命中冷却 0.4s |
| **霜蚀领域** frost | 常驻光环（0.5s/跳） | 4 → 4×2.2=8.8/跳 | 跟随减速光环，控场保命，DoT 不触发受击闪白 | 半径 88+12×等级、减速 28%+4%/级 | **绝对零度**：半径 130×area、减速 60%、每跳 10、12% 概率冻结 0.8s（`frost.ts:52-55`） |
| **回响晶刃** shard | 1.6s→1.28s（-0.08/级） | 11 → 11×1.72≈18.9 | 弹射晶刃在敌群间折射 | 刃数 2（4 级 +1）、弹射 2+等级（3→7）、弹速 350、存活 4s、轻追踪 0.25 | **万象镜厅**：5 刃、弹射 14、穿透 1、伤害 17 |

**手感差异速览**：pulse=挂机覆盖、orbit=贴身保险、nova=解围爆发、arc=智能清杂、lance=对轴核弹、drones=自动猎杀、frost=控场减速、shard=折射追杀。索敌方式涵盖 追踪/环绕/环身/链式/线段/自主/光环/弹射，任意武器组合都不会完全功能重复。

---

## 4. 敌人行为设计

实现位于 `src/game/enemies/index.ts`（行为表）与 `boss.ts`（Boss 状态机）。所有行为共享：击退速度积分 + 指数衰减（`enemies/index.ts:149-153`）、缓速统一系数 0.55、眩晕归零速度（`speedFactor`，`enemies/index.ts:9-12`）、出生淡入（普通 0.35s / 精英·Boss 0.8s，`combat.ts:108`）。

| 行为 | 代表敌人 | 设计意图 |
| --- | --- | --- |
| **chaser** 追击 | 尘埃 mote、飞镖 dart、疾影精英 | 基础威胁。平滑转向（dt×6）保留击退惯性——玩家能用冲刺"甩尾"制造群体拉直，形成最优走位（"拉怪收线"）。mote 批量 5 只出生（`batch` 字段），强调"从不单独出现"。 |
| **weaver** 织行 | 刺蜂 stinger | 在 chaser 上叠加垂直正弦摆动（振幅 46、频率 3.2，`enemies/index.ts:29-46`）。直线弹幕打不中它，逼迫玩家改变预判，是速度型敌人之后的第二个教学关。 |
| **shooter** 远程 | 看守者 warden | 在 240px 距离带徘徊（±40 缓冲），带内环绕，每 2.4s 发射 130 弹速、12 伤害的光弹（`enemies/index.ts:75-115`）。首个"必须主动接近"的敌人，打破纯风筝打法。 |
| **splitter** 分裂 | 碎片兽 shardling（死→2 尘埃）、分裂体 splitter（死→3 尘埃）、母巢精英（死→4） | 死亡不是结束而是二次威胁，惩罚"无脑站桩输出"。子体以 60% 血量、0.1s 快速淡出生成（`combat.ts:203-214`）；母巢精英还在存活期每 4s 产 2 只尘埃（`enemies/index.ts:60-73`）。 |
| **tank** 重装 | 巨垒 bulwark、偏导精英 | 转向迟钝（dt×1.6）、速度 0.9 系数、击退抗性 0.85（精英 0.95）。它是"移动墙"，负责在密集弹幕里制造掩体与堵路，逼玩家交冲刺或调整路线。 |
| **phaser** 相移 | 相影 phase | 每 5s 瞬移到玩家 220px 随机角（`enemies/index.ts:117-131`）。惩罚"背身站立"，让玩家必须定期环顾四周——纯粹的信息压力而非数值压力。 |
| **精英三词缀** | 疾影（速 158）/ 偏导（抗 0.95）/ 母巢（产卵） | 精英不引入新机制，而是把三种已有恐惧**放大到极致**：速度、不可推动、指数增员。金色光环 + 横幅 + 警报音三重出场仪式（`director.ts:88-94`）。 |
| **Boss 二模式** | 泯灭者 / 深渊之眼 | 见下。 |

### Boss 状态机

**泯灭者 boss_devourer（4:00，`boss.ts:38-79`）**——三态循环：

| 态 | 行为 | 参数 |
| --- | --- | --- |
| 0 追击 | 缓慢逼近 + 每 3.2s 一轮 16 发环形弹（速 120、伤 14） | 距玩家 120~420 时切入蓄力 |
| 1 蓄力 | 停止移动，0.8s 锁定冲锋方向，红色 telegraph 光环 | — |
| 2 冲锋 | 以 620 速度直线突进 0.9s，期间高频喷 3 发小环（速 90，概率 dt×14） | 结束后冷却 5s 回到态 0 |

**深渊之眼 boss_eye（9:00，`boss.ts:82-114`）**——持续压力型：

- 双臂螺旋弹幕：每 0.12s 两发（相隔 π，速 150、伤 16、存活 6s），发射角每轮 +0.5 rad，形成旋转双螺旋；
- 每 6s 召唤 10 只尘埃（300px 环上）+ 粉色冲击环——弹幕缝隙里长出小怪，考验"边走位边清场"。

**Boss 击杀奖励**：全场非 Boss 敌人直接湮灭（9999 伤害的"爽点"清屏，`combat.ts:193-196`）、掉治疗+炸弹、+10 星核；深渊之眼死亡即胜利（`combat.ts:190-192`）。Boss 免疫击退（knockbackResist=1）。

---

## 5. 波次导演

实现 `src/game/director.ts`；数据 `src/data/waves.data.ts`。三个机制：

- **生成环**：敌人出生在玩家 520~680px 的视野外环上（`RING_MIN/MAX`，`director.ts:12-13`），按敌人池权重抽取、按 `batch` 成批撒布；
- **预算器**：每帧累计 `rate×dt`（Boss 存活时 ×0.35 压低常规生成，`director.ts:50-51`），预算上限 4，防帧率抖动导致的爆发式生成；
- **拉回（leash）**：每 0.5s 把距玩家超过 1500px 的普通敌人传送回生成环（`director.ts:133-149`）——玩家不能靠逃跑清空威胁，密度始终在线。

### 5.1 相位密度爬升表（9 相位）

| 相位 | 起点 | 速率（起→末，个/秒） | 敌人池（权重） | 音乐强度 |
| --- | --- | --- | --- | --- |
| 1 | 0:00 | 0.9 → 1.7 | 尘埃 90 · 飞镖 10 | 0.25 |
| 2 | 1:00 | 1.7 → 2.7 | 尘埃 55 · 飞镖 35 · 刺蜂 18 | 0.35 |
| 3 | 2:00 | 2.7 → 3.6 | 尘埃 40 · 飞镖 30 · 刺蜂 22 · 碎片兽 18 | 0.45 |
| 4 | 3:00 | 3.6 → 4.2 | 飞镖 30 · 刺蜂 24 · 碎片兽 22 · 看守者 14 · 尘埃 30 | 0.55 |
| 5 | 4:00 | **2.4** → 4.4 | 尘埃 36 · 飞镖 28 · 刺蜂 20 · 碎片兽 18 · 看守者 12 · 相影 8 | 0.6 |
| 6 | 5:00 | 4.4 → 5.2 | 刺蜂 22 · 碎片兽 20 · 看守者 14 · 相影 12 · 分裂体 10 · 尘埃 26 | 0.7 |
| 7 | 6:00 | 5.2 → 6.0 | 刺蜂 18 · 碎片兽 18 · 看守者 14 · 相影 12 · 分裂体 14 · 巨垒 8 · 尘埃 20 | 0.8 |
| 8 | 7:00 | 6.0 → 6.9 | 碎片兽 18 · 看守者 14 · 相影 14 · 分裂体 16 · 巨垒 12 · 尘埃 16 | 0.9 |
| 9 | 8:00 | 6.9 → 7.8 | 碎片兽 16 · 看守者 14 · 相影 16 · 分裂体 18 · 巨垒 16 | 1.0 |

注意两个刻意设计：**相位 5 起点回落**（4.2→2.4），给泯灭者 Boss 战腾出可读空间；尘埃权重逐相位衰减（90→0），后期"低价值杂鱼"退场，场上都是有效威胁。音乐强度驱动自适应配乐的分层渐入（>0.35 琶音层、>0.7 打击层，`src/audio/music.ts:227-241`）。

### 5.2 时间轴事件表（`TIMELINE`，22 条） <!-- v1.1 校对 -->

| 时间 | 事件 | 内容 |
| --- | --- | --- |
| 1:15 | warning | "侦测到高能信号"横幅（首个精英预告） |
| 1:30 | elite | 疾影精英 |
| 2:30 | swarm | 尘埃虫潮 ×26（环形合围） |
| 2:45 | warning | 精英预告 |
| 3:00 | elite | 偏导精英 |
| 3:30 | pickupDrop | 治疗补给（玩家 180px 外随机角） |
| 3:48 | warning | "渊底之物正在上浮"（Boss 预告） |
| **4:00** | **boss** | **泯灭者** |
| 4:30 | swarm | 飞镖虫潮 ×22 |
| 4:55 | warning | 精英预告 |
| 5:00 | elite | 母巢精英 |
| 5:30 | pickupDrop | 治疗补给 |
| 5:50 | warning | 精英预告 |
| 6:00 | elite | 偏导精英 |
| 6:30 | elite | 疾影精英 |
| 7:00 | swarm | 刺蜂虫潮 ×18 |
| 7:20 | pickupDrop | 治疗补给 |
| 7:30 | elite | 母巢精英 |
| 7:50 | elite | 疾影精英 |
| 8:20 | elite | 回响体 elite_echo（v1.1：蓄力突进，必掉星核） |
| 8:40 | warning | "最终回响已到来" |
| **9:00** | **boss** | **深渊之眼**（击杀即胜） |

节奏骨架：**1:30 首精英**（第一次紧张）→ **2:30 虫潮**（第一次爽）→ **4:00 Boss I**（第一次考试）→ **5:00 起精英双倍频**（构筑成型的验证期）→ **9:00 终局**。治疗补给固定在 Boss 战前与长精英间隙，作为"节拍器"给玩家喘息。

---

## 6. 平衡调参指南

> 原则（`src/game/balance.ts` 头注释）：调平衡只改 `src/game/balance.ts` 与 `src/data/*`，行为代码里不允许内联魔法数。改完跑 `npm test`（balance 曲线有单调性/边界测试，`tests/balance.spec.ts`）。

| 想调什么 | 改哪里 | 预期影响 |
| --- | --- | --- |
| 一局总长 / 超时 | `src/game/balance.ts:9-11` `RUN_GOAL_TIME`(540) / `RUN_HARD_CAP(780s)`(780) | 同时要改 `waves.data.ts` 最后两条 timeline 的 Boss 时间，否则 9:00 不出最终 Boss |
| 升级节奏 | `balance.ts:14-16` `xpToNext` 线性项 5 / 幂项 1.6、1.5 | 线性项↑=前期升级更密；幂项↑=后期断崖更陡 | <!-- v1.1 校对 -->
| 敌人强度成长 | `balance.ts:19-25` 指数 1.42 / 系数 0.42 / 伤害 0.16 | 0.42↑=后期血墙更硬；1.42 降为 1.0 即变线性成长 |
| 同屏密度 | `balance.ts:38-40` `maxEnemiesAt`（90 基数 / 0.5 斜率 / 300 上限） | 直接影响同屏敌人上限与性能压力；300 是性能保险丝，勿轻易上调 | <!-- v1.1 校对 -->
| 星核产出 | `balance.ts:48-51` `coresEarned`（/45、×3、×12、/30、+25） | 全局经济膨胀/紧缩的总阀门；局内掉落另改 `combat.ts:180,184` 与 `sim.ts:258` |
| Boss 血量 | `balance.ts:49-51` `bossHpScale` 乘数 1.8 | 只影响 Boss 相对普通敌人的倍率；基础值在 `enemies.data.ts:92-103` | <!-- v1.1 校对 -->
| 生成节奏 | `src/data/waves.data.ts` 各相位 `startRate/endRate` | 每相位内的线性爬升；相位 5 起点回落是 Boss 战的可读性设计，动前想清楚 |
| 敌人构成 | `waves.data.ts` 各相位 `pool` 权重 | 权重是相对值；新敌人加入池即可投入战斗 |
| 事件节拍 | `waves.data.ts` `TIMELINE` 的 `at` 字段 | 精英/Boss/虫潮/补给的时刻表；warning 条目要提前 ~15s 放 |
| 单敌数值 | `src/data/enemies.data.ts`（hp/speed/contactDps/xp/batch/knockbackResist/params） | `tier` 与 `behavior` 决定成长与行为管线，不要随手改 |
| 武器数值 | `src/game/weapons/*.ts` 各文件的 cooldown/dmg/count 常量 | 每文件一个武器，表内数值见第 3 节；改完建议用 `tests/sim.spec.ts` 的决定性测试回归 |
| 进化绑定 | `src/data/weapons.data.ts:11-18` `evolution.passive/into` | 改绑定即改变构筑路线图；被动门槛 3 级在 `upgrades.ts:37` |
| 被动每级效果 | `src/data/passives.data.ts` 各 `apply` | tempo 有 0.4 的冷却下限保护，注意别移除 |
| 星核强化树 | `src/data/meta.data.ts`（maxRank/costs/apply） | costs 数组长度必须等于 maxRank（类型约束） |
| 角色强度 | `src/data/characters.data.ts` 覆盖字段 | 数值为"绝对覆盖"而非叠加（`state.ts:17-19`） |
| 冲刺手感 | `src/game/sim.ts:31-40`（6s 冷却 / 0.18s 时长 / ×3.1 速度 / 0.35s 无敌） | 全角色共享；角色差异化请走 Stats 字段 |
| 拾取手感 | `src/game/sim.ts:197-237`（3 倍磁吸 / 15s 漂移 / 560+t×300 吸附速度） | 磁吸倍率影响"远程击杀经验是否回手"的体验 |
| 伤害数字可读性 | `src/game/sim.ts:83-104` 聚合窗口 0.3s | 窗口↑=数字更少更厚；护甲折算同步 ×窗口 |
| 升级池权重 | `src/game/upgrades.ts:55-72` | 新武器 10+/武器升级 9/新被动 8+/被动升级 9；luck 加成也在这 |

**调参工作流建议**：改 `data/` → `npm test`（曲线单调性/池边界）→ `npm run dev` 用 `?seed=`（尚未接线）或反复开局观察 → 数值确认后 `npm test` + `npm run lint` 再提交。波次/成长类改动优先跑一局到 4:00 看 Boss I 是否"打得动、打不死人"。

---

## 7. v1.1 附录：运行模式、新内容与成就

> 本节覆盖 v1.1 新增的三种运行模式、两把武器、两条被动、一名角色与成就系统。所有数值从当前代码提取，行号以 v1.1 代码为准。

### 7.1 运行模式（standard / endless / daily）

模式枚举 `RunMode = 'standard' | 'endless' | 'daily'`（`src/game/types.ts:412`），经 `RunConfig.mode / dailyDate` 注入（`types.ts:406-408`）。RunState 新增字段：`mode / loop / loopStart / evolutions / dailyDate / dailyModifier / enemySpeedMul / enemyHpMul / bossHpMul`（`types.ts:426-439`），默认值 `mode='standard'`、`loop=0`、`loopStart=0`、三个生成乘数 =1（`src/game/state.ts:33-41`）。

#### 7.1.1 无尽模式（endless）

- **解锁**：`endlessUnlocked = meta.victories > 0`（`src/ui/ui.ts:232`），未解锁时按钮 disabled（`ui.ts:241`）——至少赢一局标准/每日模式。
- **循环时间轴重放**：导演以循环相对时间驱动，`t = state.time - state.loopStart`（仅 endless，`src/game/director.ts:30`）。相位推进（`director.ts:33-46`）、密度上限 `maxEnemiesAt(t)`（`director.ts:53`）、时间轴事件游标（`director.ts:85`）全部使用该 t——每层循环从相位 1 与完整时间轴重新开始，包括 4:00 泯灭者与 9:00 深渊之眼；密度曲线随之回到起点。Boss 存活压制（×0.35）与 leash 拉回机制跨循环不变（`director.ts:51`、`140-156`）。
- **循环推进点**：只有击杀深渊之眼（boss_eye）才推进。mode='endless' 时：`loop++`、`loopStart = state.time`、`timelineIdx = 0`、`phaseIndex = 0`、`bossDone = false`，横幅 `warning.endless` 持续 3.2s + evolve 音效（`src/game/combat.ts:196-205`）；否则结算胜利（`combat.ts:206-208`）。泯灭者击杀在无尽中只走普通 Boss 结算（`combat.ts:188-195`），不推进循环。
- **敌人血量**：`loopHpMul(loop) = 1.12^loop`（`src/game/balance.ts:56-58`），生成侧叠加且**只作用于非 Boss**（`combat.ts:87`），完整公式 `hp = def.hp × enemyHpScale(state.time) × hpMul × state.enemyHpMul × loopMul`（`combat.ts:88`）。两个刻意的"不重置"：`enemyHpScale` 仍按**绝对时间**成长（跨循环累加，超线性不回头）；Boss 按 `bossHpScale(state.time)` 生成（`director.ts:104`）且不吃循环乘数——无尽越深，Boss 相对越"便宜"，杂兵相对越"硬"。
- **敌人伤害**：`contactDps × enemyDmgScale(state.time)`（`combat.ts:98`）——同样按绝对时间，接触压力逐层上升。
- **经验补偿**：`loopXpMul(loop) = 1 + 0.15 × loop`（`balance.ts:61-63`），作用点在击杀掉落的宝石：`e.xp × loopXpMul`（`combat.ts:177`）。
- **无硬上限**：超时判负仅在非 endless 生效——`state.mode !== 'endless' && state.time > RUN_HARD_CAP`（`src/game/sim.ts:265-268`；RUN_HARD_CAP=780，`balance.ts:11`）。
- **深度语义**：深度 = `loop + 1`（"当前所处回廊"），结算（`src/app.ts:258-259`）、摘要（`src/game/upgrades.ts:196-197`）与 HUD（`app.ts:388`，`深度 N · 倒计时`）三处一致；成就判定同样按该语义（见 7.3 的 depth_2/depth_5）。

#### 7.1.2 每日挑战（daily）

- **种子**：`dailySeed(date) = fnv1a('abyssal-daily-' + date)`（`balance.ts:78-80`），fnv1a 为 FNV-1a 32 位哈希（`balance.ts:68-75`）。同一天恒定，可跨设备对比。
- **角色轮换**：`dailyCharacter(date, roster) = fnv1a('abyssal-daily-char-' + date) % roster.length`（`balance.ts:83-86`）；名单固定 4 人且**不受解锁限制**（`src/data/daily.data.ts:5`、`app.ts:27`）——每日即试用日。
- **修正器抽取**：`dailyModifierFor(date) = DAILY_MODIFIERS[dailySeed(date) % 6]`（`daily.data.ts:63-66`）。
- **开局管道**：seed 取 dailySeed（`app.ts:148`）、角色取轮换（`app.ts:149-151`）、makeRunState 注入 mode/dailyDate（`app.ts:152-158`）、push 初始武器之后 `mod.apply(state)`（`app.ts:159-164`）——修正器直接改写 state（stats / 生成乘数 / 初始武器等级），非 Stats 声明式覆盖。
- **计分**：`dailyScore = kills + floor(survivedSec)×2 + level×20 + (victory ? 500 : 0)`（`balance.ts:89-91`）。每日模式沿用标准局结构（9:00 终局 Boss、780s 超时判负，`sim.ts:266` 只豁免 endless）。
- **当日最佳**：`meta.dailyBest = { date, score }`（`types.ts:526`）；date 不同直接覆盖、同 date 取更高分（`app.ts:268-274`），`state.dailyDate ?? todayStr()` 为基准（`app.ts:266`）。
- **日期边界**：`todayStr()` 取本地时区 YYYY-MM-DD（`balance.ts:94-99`）——每日翻转跟随本地时钟而非 UTC。

**6 修正器**（`daily.data.ts:11-60`；中文描述 `src/core/i18n.ts:226-231`）：

| id | 效果（代码值） | 行号 |
| --- | --- | --- |
| swift_swarm 疾风群 | 敌速 ×1.15，经验 ×1.2 | daily.data.ts:16-17 |
| magnet_storm 磁暴 | 拾取半径 ×2 | daily.data.ts:24 |
| frail_giants 脆巨兽 | Boss 生命 ×0.7 | daily.data.ts:31 |
| thick_hide 厚甲 | 敌人生命 ×1.2，玩家伤害 ×1.15 | daily.data.ts:38-39 |
| head_start 先发 | 初始武器直接 ≥2 级 | daily.data.ts:48 |
| glass_cannon 玻璃炮 | 暴击 +10%（钳 0.95 上限），最大生命 ×0.85（下限 40）并同步当前 hp | daily.data.ts:55-57 |

### 7.2 v1.1 新内容数值表

数值口径沿用第 3 节：基础值（未乘全局 `stats.damageMul`），等级系数 `levelMul(lv, per) = 1 + per×(lv-1)`（`src/game/weapons/helpers.ts:63-65`）。数据绑定：scythe→aegis→scythe_eclipse、mines→greed→mines_bloom（`src/data/weapons.data.ts:19-20`），两者进入 BASE_WEAPONS 抽取池（`weapons.data.ts:35-38`）。

**虚空收割 scythe**（`src/game/weapons/scythe.ts`）——朝向锥形挥砍，无弹道直接结算：

| 参数 | 数值 | 行号 |
| --- | --- | --- |
| 冷却 | `1.7 − 0.12×(lv−1)` → 1.7 / 1.58 / 1.46 / 1.34 / 1.22s | scythe.ts:18-20 |
| 伤害 | 16 × levelMul(lv, 0.18) → 5 级 16×1.72 ≈ 27.5 | scythe.ts:26 |
| 半径 | `95 + 6×lv`（95→119）× areaMul | scythe.ts:24 |
| 形状 | 朝向锥形 120°（arc = 2π/3），角平分线 = player.facing | scythe.ts:25,31,39 |
| 击退 | 170 | scythe.ts:27 |
| 表现 | `slash` fx（弧线起止角写入 points）+ 低音 shoot | scythe.ts:48-56；FxKind 见 types.ts:326 |

**进化·蚀月 scythe_eclipse**（按 5 级系数结算，`scythe.ts:22-23`）：

| 参数 | 数值 | 行号 |
| --- | --- | --- |
| 半径 | 150 × areaMul | scythe.ts:24 |
| 形状 | 360° 环斩（arc = 2π） | scythe.ts:25 |
| 伤害 | 30 × levelMul(5, 0.18) = 51.6 | scythe.ts:26 |
| 击退 | 240 | scythe.ts:27 |
| 斩杀线 | 12%：非 Boss 且 `hp < maxHp×0.12` 直接 9999 伤害 | scythe.ts:28,41-44 |

**星棘雷 mines**（`src/game/weapons/mines.ts`）——周期布设感应地雷。常量：布防 0.4s、感应距离 70、雷寿命 6s、伤害区寿命 2.5s、伤害区跳伤间隔 0.5s（`mines.ts:13-17`）：

| 参数 | 数值 | 行号 |
| --- | --- | --- |
| 冷却 | `max(1.1, 2.4 − 0.14×(lv−1))` → 2.4 / 2.26 / 2.12 / 1.98 / 1.84s | mines.ts:84-86 |
| 单次布设数 | 1（4 级起 2）→ 进化恒 2 | mines.ts:94 |
| 单雷伤害 | 15 × levelMul(lv, 0.17) → 5 级 15×1.68 = 25.2 | mines.ts:19-23 |
| 布设位置 | 玩家周身 10~55 × areaMul 随机角 | mines.ts:28-32 |
| 地雷本体 | r = 7×areaMul；布防 0.4s 后感应（半径 70×areaMul）或 6s 寿命耗尽即起爆 | mines.ts:36,44,125-141 |
| 起爆 AoE | 半径 105×areaMul，击退 110 | mines.ts:78-79 |

**进化·星棘花海 mines_bloom**（5 级系数，`mines.ts:20-22`）：

| 参数 | 数值 | 行号 |
| --- | --- | --- |
| 单雷伤害 | 26 × 1.68 ≈ 43.7 | mines.ts:22 |
| 布设 | 双雷连布 | mines.ts:94 |
| 起爆 AoE | 半径 125×areaMul，击退 110 | mines.ts:78-79 |
| 持续伤害区 | 半径 = 起爆半径 × 0.85；寿命 2.5s；每 0.5s 一跳，每跳 = 单雷伤害 × 0.35（无击退、不触发白闪） | mines.ts:80,58,113,117 |

**新被动**（`src/data/passives.data.ts`，均为乘算/加算纯函数）：

| 被动 | 每级 | 5 级累计 | 行号 |
| --- | --- | --- | --- |
| aegis 回响护盾 | 护甲 +1.2，最大生命 +10 | 护甲 +6 / 生命 +50 | passives.data.ts:46-50 |
| greed 贪婪协议 | 经验 ×(1+0.15lv)，幸运 +0.6 | 经验 ×1.75 / 幸运 +3 | passives.data.ts:51-55 |

**新角色 vesper 织夜者**（`src/data/characters.data.ts:19-23`）：生命 90、冷却 ×0.92、移速 210（绝对覆盖，`state.ts:17-19`），初始武器 scythe。解锁条件：单局完成 ≥1 次进化（`app.ts:305`）。

**新敌人 elite_echo 回响体**（`src/data/enemies.data.ts:83-89`）：

- 面板：hp 640 · speed 70 · contactDps 26 · radius 22 · xp 45 · knockbackResist 0.55 · tier=elite · weight=0（仅时间轴投放，`src/data/waves.data.ts:37`，8:20 登场，无前置 warning 条目）。xp 45 为当前精英最高（对照 `enemies.data.ts:71,77`）。
- 行为 **dasher**（v1.1 新行为枚举 `types.ts:154`；实现 `src/game/enemies/index.ts:138-182`）三阶段：
  1. 常规接近：dt×6 平滑转向（`enemies/index.ts:174-181`）；
  2. 蓄力：`phase` 归零后急停（速度按 `0.0005^dt` 衰减，`155-156`），持续 0.8s，期间以 dt×8 概率闪 telegraph 特效（r×2.2，`157-159`）；
  3. 突进：锁定蓄力结束瞬间玩家方向（`160-167`），速度 ×3.2 持续 0.5s（每帧重写速度绕过击退阻尼，`142-150`），随后进入 3.2s 冷却（`167`）；起跳音效 warning v=0.5 p=1.6（`168`）。
- 行为参数全部读自 `def.params`：`{dashCd: 3.2, telegraph: 0.8, dashMul: 3.2, dashTime: 0.5}`（`enemies.data.ts:88`；dasher 是真实读取 params 的行为，区别于第 4 节所述 v1.0 遗留的硬编码行为）。
- 击杀奖励：精英常规 +2 星核（`combat.ts:180`）+ **必掉星核拾取物**（+5，`combat.ts:182-184`；其他精英是 35% 掉治疗，`combat.ts:185-187`）。

### 7.3 成就清单（20 项）

判定分三通道（`src/game/achievements.ts`）：

- **live**：局内每秒节流判定（`app.ts:204-209`，节流计时器 `app.ts:73`），达成即时 toast；
- **afterRun**：finishRun 结算时扫描（`app.ts:308`）；
- **meta**：`evaluateMeta` 以全零 RunSummaryLite 复用 afterRun 谓词（`achievements.ts:163-168`），在星核商店购买后调用（`app.ts:434-436`）——只有只读 meta 参数的判定会在该通道解锁。

中文名出自 i18n `achv.<id>.name`（`src/core/i18n.ts:241-280`）。

| # | id | 中文名 | 触发条件 | 通道 | 定义 |
| --- | --- | --- | --- | --- | --- |
| 1 | first_echo | 初次回响 | 完成 1 局（meta.runs ≥1） | afterRun | achievements.ts:38-42 |
| 2 | century | 百人斩 | 单局击杀 ≥100 | live + afterRun | achievements.ts:43-48 |
| 3 | legion | 千军破 | 单局击杀 ≥500 | live + afterRun | achievements.ts:49-54 |
| 4 | five_min | 五分钟灯塔 | 单局存活 ≥300s | live + afterRun | achievements.ts:55-60 |
| 5 | devourer_slayer | 弑渊者·序 | 单局击杀任意 Boss ≥1 | afterRun | achievements.ts:61-64 |
| 6 | eye_slayer | 弑渊者 | 单局胜利（击败深渊之眼） | afterRun | achievements.ts:65-68 |
| 7 | first_evolution | 进化论 | 单局进化 ≥1 | afterRun | achievements.ts:69-72 |
| 8 | triple_evolution | 三重回响 | 单局进化 ≥3 | live + afterRun | achievements.ts:73-77 |
| 9 | flawless | 无瑕回响 | 存活满 300s 且累计受伤为 0（达成瞬间解锁） | live | achievements.ts:78-81 |
| 10 | maxed_weapon | 圆满 | 任一武器等级达其 maxLevel（进化形态 maxLevel=1 亦算） | live | achievements.ts:82-85 |
| 11 | elite_hunter | 精英猎人 | 单局击杀精英 ≥10 | live + afterRun | achievements.ts:86-90 |
| 12 | core_mogul | 星核富豪 | 生涯累计获得 ≥1000 星核 | afterRun + meta | achievements.ts:91-95 |
| 13 | veteran | 深渊老兵 | 生涯完成 ≥25 局 | afterRun + meta | achievements.ts:96-100 |
| 14 | daily_omen | 每日回响 | 完成一局每日挑战 | afterRun | achievements.ts:101-104 |
| 15 | depth_2 | 回廊行者 | 无尽到达深度 2（live: `loop≥1`；afterRun: `depth≥2`） | live + afterRun | achievements.ts:105-109 |
| 16 | depth_5 | 深渊泳者 | 无尽到达深度 5（live: `loop≥4`；afterRun: `depth≥5`） | live + afterRun | achievements.ts:110-114 |
| 17 | full_arsenal | 满载而归 | 单局持有 4 把武器 | live + afterRun | achievements.ts:115-119 |
| 18 | forge_master | 锻造大师 | 任一星核强化线升满（读 META_NODES） | afterRun + meta | achievements.ts:120-123 |
| 19 | trifecta | 三面守望 | 3 名不同角色各取得 ≥1 次胜利（meta.charWins） | afterRun + meta | achievements.ts:124-127 |
| 20 | core_harvest | 星核丰收 | 单局局内星核入账 ≥15（精英/Boss/金色核心即时入账之和） | afterRun | achievements.ts:128-131 |

其中 6 项有进度条定义（first_echo / century / legion / five_min / core_mogul / veteran），经 `achievementProgress` 输出 `[当前, 目标]`（`achievements.ts:171-173`）。

**角色解锁条件总表**（判定集中在 `app.ts:303-305`，写入 `meta.unlocked` 并 toast，`app.ts:296-302`）：

| 角色 | 条件 | 依据 |
| --- | --- | --- |
| peregrine | 默认解锁（新档初始项） | `src/core/save.ts:22` |
| bastion | 生涯单局存活 ≥240s（`meta.bestTime ≥ 240`） | app.ts:303 |
| astraeus | 单局击杀任意 Boss ≥1 | app.ts:304 |
| vesper | 单局完成 ≥1 次进化 | app.ts:305 |

### 7.4 调参表（v1.1 增补）

原则同第 6 节：只改 `src/game/balance.ts` 与 `src/data/*`。

| 想调什么 | 改哪里 | 注意 |
| --- | --- | --- |
| 无尽敌人血量 | `src/game/balance.ts:56-58` `loopHpMul` 底数 1.12 | 只作用于非 Boss（`combat.ts:87`）；绝对时间成长照常叠加，两层压力独立 |
| 无尽经验补偿 | `balance.ts:61-63` `loopXpMul` 系数 0.15 | 生效点 `combat.ts:177`（宝石值）；建议与底数联动调整保持成长/压力比 |
| 循环切换规则 | `src/game/combat.ts:196-205` | 只由 boss_eye 击杀触发；重置 timelineIdx/phaseIndex 即"时间轴重放" |
| 无尽是否封顶 | `src/game/sim.ts:265-268` 的 `mode !== 'endless'` 排除项 | 恢复硬上限即删掉该排除；RUN_HARD_CAP 在 `balance.ts:11` |
| 循环重放基准 | `src/game/director.ts:30` | 改回绝对时间 = 取消循环重放（同时影响密度上限计算，`director.ts:53`） |
| 每日修正器池 | `src/data/daily.data.ts:11-60` `DAILY_MODIFIERS` | 新条目自动进入抽取池（`63-66` 取模），须同步加 i18n `daily.mod.<id>`（现有 6 条见 `i18n.ts:226-231`） |
| 每日计分 | `src/game/balance.ts:89-91` `dailyScore` | 改公式会使 dailyBest 历史分数不可比 |
| 每日种子/轮换盐 | `balance.ts:79,84` 的字符串常量 | 改动等同"全员换日" |
| elite_echo 数值 | `src/data/enemies.data.ts:83-89`（含 params 四项） | dasher 真实读取 params（`enemies/index.ts:145,153,160,166-167`），改了即生效 |
| elite_echo 投放时刻 | `src/data/waves.data.ts:37` | 当前无前置 warning，需要预告自行插入（提前 ~15s，同第 6 节惯例） |
| 成就阈值 | `src/game/achievements.ts:37-132` 各条目谓词 | 阈值内联在谓词中（100/500/300s/240s/1000/25/15 等）；改后跑 `tests/achievements.spec.ts` 与 `tests/modes.spec.ts` |
| 解锁门槛 | 角色 `app.ts:303-305`；无尽 `src/ui/ui.ts:232` | victories > 0 是无尽唯一门槛 |
