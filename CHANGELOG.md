# 更新日志 · CHANGELOG

本项目遵循 [语义化版本（SemVer）](https://semver.org/lang/zh-CN/) 与 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 格式。

## [1.1.0] - 2026-10-28

「无尽回廊」内容版本：两种新玩法模式、成就系统、2 把新武器（含进化）、2 条新被动、第 4 位角色与 1 种新精英。对应提交：`5365b29`（v1.1 核心）→ `be7b46f`（27 个新单测）→ `874eace`（浏览器实测修复与截图）。

### Added

**运行模式（`src/game/types.ts` `RunMode`）**

- 无尽模式「深渊回廊」：9:00 击杀深渊之眼不再结算，进入下一循环——导演时间轴以循环起点重放（`src/game/director.ts`），敌人 HP 叠乘 `1.12^loop`、经验乘 `1+0.15·loop`（`src/game/balance.ts` `loopHpMul/loopXpMul`），无 11:00 硬上限（`src/game/sim.ts`）；深度语义 = 所处回廊序号 = 已清循环 +1，HUD 顶栏与结算屏一致；击败任意 Boss 后解锁
- 每日挑战：`fnv1a("abyssal-daily-" + 日期)` 决定性种子，全日期玩家同一开局；角色按日期轮换（可试用未解锁角色，`src/data/daily.data.ts` `DAILY_ROSTER`）；6 选 1 修正器（敌群提速/磁吸风暴/巨人脆化/厚甲/先手/玻璃大炮，种子抽取）；计分 = 击杀 + 存活秒×2 + 等级×20 + 胜利 500，当日最佳持久化（`meta.dailyBest`）
- 角色选择屏新增模式切换（标准/无尽），锁定态显示解锁条件；标题菜单新增「每日挑战」独立面板（日期/当日角色/修正器/最佳）与「成就」入口

**成就系统（`src/game/achievements.ts`）**

- 20 个成就，三通道判定：局内实时（`evaluateLive`，1s 节流）、结算扫（`evaluateAfterRun`）、元进度（`evaluateMeta`，购买强化后即检）；解锁即时持久化 + 全局 DOM toast（不随屏幕重建消失）
- 成就面板：解锁金标 / 锁定灰态 + 可量化进度（如生涯星核 688/1000）
- 新角色解锁：织夜者 = 完成一次武器进化

**新内容**

- 武器「虚空收割」：朝向 120° 锥形挥砍（半径 95+6·lv、强击退 170），无弹道直接结算（`src/game/weapons/scythe.ts`）；进化「蚀月」：360° 环斩 + 斩杀 12% 以下非 Boss（`scythe_eclipse`）
- 武器「星棘雷」：布设感应地雷（0.4s 布防、敌近 70px 或 6s 自爆、AoE 105px）；进化「星棘花海」：双雷连布 + 爆炸留下 2.5s 持续伤害区（`src/game/weapons/mines.ts`，用 Projectile data0/data1 承载布防与伤害区）
- 被动「回响护盾 aegis」（护甲 +1.2、生命 +10 / 级）与「贪婪协议 greed」（经验 +15%、幸运 +0.6 / 级），各 5 级（`src/data/passives.data.ts`）
- 第 4 位角色「织夜者 vesper」：冷却 −8%、HP 90、速度 210，初始武器虚空收割（`src/data/characters.data.ts`）
- 新精英「回响体 elite_echo」：dasher 行为——接近、0.8s 蓄力预警、3.2× 速度突进 0.5s；击杀必掉星核拾取物（`src/game/enemies/index.ts`、`src/data/enemies.data.ts`）；加入标准时间轴 8:20 与无尽循环时间轴
- 新特效：弧形斩击 `slash`（带起止角）、地雷与伤害区绘制（`src/render/renderer.ts`）、图集新增 5 个程序化精灵（mine/bloom/elite_echo/scythe 图标/mines 图标）

**元进度与统计**

- 存档 v2（`abyssal-echo.save.v1` 结构不变，`SAVE_VERSION = 2`）：新增 achievements / totalCoresEarned / bestKills / bestLevel / totalPlaySeconds / endlessBestDepth / dailyBest / charWins；v1 旧档无缝迁移（同解析路径 + 新字段补默认）
- 档案馆统计页新增 7 项生涯数据；结算屏按模式展示（无尽深度 / 每日得分与当日纪录 / 进化次数）
- 设置新增「低闪模式」（抑制低血红晕脉冲，光敏友好）

### Changed

- 经验宝石价值在无尽循环中随 `loopXpMul` 提升（`src/game/combat.ts`）
- 精英击杀掉落分支化：回响体必掉星核，其余精英维持 35% 治疗掉率

### Fixed

- 存档角色白名单缺 `vesper`，解锁后无法持久化（浏览器实测发现，`src/core/save.ts`）
- 回廊深度语义不一致：HUD 显示 loop+1 而结算写 loop → 统一为 loop+1（`src/app.ts`、`src/game/upgrades.ts`）

### Tests

- 47 → 74 个单元测试：新增 modes（无尽循环/缩放/硬上限豁免/每日种子与计分）、achievements（20 定义与三通道判定）、weapons（锥形命中/斩杀/布防起爆/伤害区/被动数值）、存档 v1→v2 迁移共 27 例
- 浏览器实测：无尽模式端到端（机器人 21:30 完成第一循环，横幅/深度/不误判胜利全验证）、每日修正器与计分、成就实时解锁 12/20、图鉴 14/14、新武器实战与特效渲染

## [1.0.0] - 2026-10-27

首个完整可玩版本：《星渊回响》ABYSSAL ECHO —— survivors-like roguelite，TypeScript + Canvas 2D + WebAudio，纯前端零外部资源，构建产物为单文件 HTML。
对应提交：`a3f129e`（引擎骨架）→ `c0d4559`（触屏控制与手感打磨）。

### Added

**核心玩法**

- 60Hz 固定步长确定性模拟：同种子同轨迹（mulberry32 单一随机源），可单测、可回放扩展（`src/game/sim.ts`、`src/core/rng.ts`）
- 9 分钟单局循环：存活至 9:00 迎战最终 Boss"深渊之眼"，击杀即胜；11:00 硬超时判负（`src/game/balance.ts` `RUN_GOAL_TIME/RUN_HARD_CAP`）
- 升级三选一系统：加权候选池（幸运影响权重）、武器/被动各 4 栏位、候选不足自动以治疗补位（`src/game/upgrades.ts`）
- 武器进化系统：8 把武器满 5 级 + 绑定被动满 3 级触发进化，进化必占三选一第一格（`src/game/upgrades.ts` `isEvolutionEligible`）

**角色与构筑（3 角色 / 8 武器 / 8 进化 / 8 被动）**

- 角色：游隼（默认）/ 壁垒（存活 4:00 解锁）/ 织星（击败任意 Boss 解锁），各有独立初始武器与面板（`src/data/characters.data.ts`、`src/app.ts` 解锁判定）
- 8 把基础武器：脉冲星尘（追踪）、星环刃（环绕）、新星爆发（环身弹幕）、链式电弧（跳跃）、贯穿射线（线段穿透）、蜂群无人机（自主索敌）、霜蚀领域（减速光环）、回响晶刃（弹射折射）（`src/game/weapons/`）
- 8 种进化形态：超新星脉冲（命中迸裂）、冕环之环（8 刃）、引力坍缩（牵引+大爆炸）、天穹之怒（9 跳+眩晕）、奇点光矛（720px 光束）、星群蜂巢（8 机）、绝对零度（冻结）、万象镜厅（14 次弹射）
- 8 条被动（各 5 级）：伤害/冷却/移速/生命回复/拾取/暴击/经验/护甲（`src/data/passives.data.ts`）

**敌人与波次（8 普通 + 3 精英 + 2 Boss）**

- 6 种敌人行为：追击（平滑转向保留击退惯性）、织行（正弦逼近）、远程（保持距离带开火）、分裂（死亡喷子体）、重装（高击退抗性）、相移（周期瞬移）（`src/game/enemies/index.ts`）
- 3 种精英词缀：疾影 / 偏导（近乎击退免疫）/ 母巢（持续产卵），时间轴投放并带横幅与警报
- 2 个 Boss 状态机：泯灭者（环形弹幕 + 蓄力冲锋三态循环）、深渊之眼（双臂螺旋弹幕 + 周期召唤尘埃风暴）（`src/game/enemies/boss.ts`）
- 波次导演：9 个相位密度爬升（0.9→7.8 个/秒）、按权重抽取敌人池、视野外生成环、0.5s 周期拉回超距敌人、Boss 战压制常规生成（`src/game/director.ts`、`src/data/waves.data.ts`）
- 20 条时间轴事件：精英预告与投放、3 次虫潮、治疗补给、两次 Boss 战
- 数值成长：敌人血量超线性（`1+(t/60)^1.42×0.42`）、伤害线性（每分钟 +16%）、同屏密度上限 90→320、经验曲线 `5+7L+1.6L^1.6`

**元进度与持久化**

- 星核经济：击杀/45 + 精英×3 + Boss×12 + 时间/30，胜利 +25；局内精英/Boss/核心拾取即时入账（`src/game/balance.ts` `coresEarned`）
- 6 节点星核强化树（生命/伤害/移速/拾取/幸运/复活，全满 2415 星核）（`src/data/meta.data.ts`）
- localStorage 存档 `abyssal-echo.save.v1`：版本字段、防御性合并（非法字段/负数/未知角色过滤钳制）、损坏回落默认、隐私模式静默降级（`src/core/save.ts`）

**表现层（Canvas，全程序化）**

- 程序化精灵图集：启动时合成约 30 个精灵（2× 超采样 + 辉光 + 白色受击剪影），零图片资源（`src/render/atlas.ts`）
- 渲染器：三层视差星空、参考点阵、深空云气、瞬时 FX（爆炸/光束/电链/冲击环/预警/冻结）、浮动伤害数字（池 160）、低血量红色脉冲暗角（`src/render/renderer.ts`）
- 相机：速度前瞻跟随 + trauma 震屏（`src/render/camera.ts`）
- 粒子系统：2200 容量环形覆盖池，火花/辉光/碎片三类（`src/render/particles.ts`）
- Canvas HUD：XP 条、计时与相位倒计时、等级/击杀/星核、跟随血条、冲刺冷却环、Boss 血条、警告横幅、开局教学提示（`src/render/hud.ts`）
- 敌人体验细节：出生淡入、缓速/眩晕/受击白闪、精英与 Boss 光环血条、经验宝石 3 倍磁吸与 15 秒后漂移回手

**音频（WebAudio 全合成，零音频文件）**

- 音频引擎：sfx/music 双总线 + 压限器、首次手势解锁、30ms 同类节流（重要音效豁免）、平方感知音量曲线（`src/audio/engine.ts`）
- 14 条音效配方：射击/命中/死亡/湮灭和弦/拾取/升级琶音/进化/受伤/Boss 警报/警示/爆炸/复活/冲刺/UI（`src/audio/sfx.ts`）
- 自适应音乐：B 和声小调 / 92 BPM / lookahead 音序器，pad + 低音脉冲 + 琶音 + 打击 + 铃音五层随波次强度呼吸，菜单→战斗无缝切换（`src/audio/music.ts`）

**界面（DOM 覆盖层，zh/en 双语）**

- 9 个应用模式：标题 / 角色选择 / 局内 / 暂停 / 升级 / 结算 / 设置 / 档案馆 / 星核强化（`src/app.ts`、`src/ui/ui.ts`）
- 档案馆：13 种敌人威胁图鉴（遭遇计数、未遇见显示？？？）+ 旅程统计（累计歼灭/最长幸存/通关数/坠入次数）
- 设置：音效/音乐/屏幕震动滑条、伤害数字开关、中英切换、清除存档
- 结算页：胜负标题、新纪录、角色解锁提示、五项统计、星核入账

**工程与质量**

- 分层架构：`core / data / game(sim) / render / audio / ui / app`，模拟层禁止依赖表现层，仅通过 `RunState.events` 三通道（damage/fx/sfx）通信并带长度护栏
- 对象池（稠密数组、池满覆盖保底）+ 空间哈希网格（CELL=96）支撑 320 同屏敌人
- 固定步长时钟 + rAF 挂起看门狗：标签页隐藏时定时器接管模拟不中断，恢复无缝衔接（`src/core/clock.ts`）
- 47 个单元测试（vitest）：种子随机、对象池、数值曲线、存档防御、升级系统、模拟决定性 —— 全部通过
- 构建管线：Vite 6 + `vite-plugin-singlefile` 产出可双击离线游玩的 `dist/index.html`；`tsc --noEmit` 严格模式（`noUncheckedIndexedAccess` 等）；ESLint；dev 固定端口 5199

[1.0.0]: https://example.invalid/abyssal-echo/releases/tag/v1.0.0

### Added（同日第二次迭代 · `b348cc5` → `c0d4559`）

- **移动端触屏支持**：粗指针设备自动启用——左半屏任意位置按住弹出虚拟摇杆（死区 8px、半径 56px），右下角冲刺键 + 右上角暂停键；桌面端零干扰（`src/ui/touch.ts`、`?touch=1` 可强制预览）
- 冲刺残影（轨迹渐隐重绘）、精英/Boss 出场震屏、血条平滑流动（受击快降/回复缓升）（`src/render/renderer.ts`、`src/render/hud.ts`）
- 升级卡专属图标：电弧（闪电折线）/ 光矛（束体）/ 霜域（六向雪花）不再复用其它武器图标（`src/render/atlas.ts`）

### Changed

- **经验曲线下调约 20%**（`4 + 5L + 1.5L^1.6`，原 `5 + 7L + 1.6L^1.6`）：机器人试玩数据显示前期 45s/级拖慢构筑成型，现约 35s/级（`src/game/balance.ts` `xpToNext`）
- 同屏敌人上限 320 → 300（弱机性能保命，实测 147 敌人时模拟步长仅 0.167ms）
- 敌人伤害数字就近合并（70px 窗口内同帧叠加），消除数字海；宝石辉光与 mote 精灵对比度增强

### Balance（机器人试玩证据）

- 无元进度、单武器、随机走位机器人：**存活 4:50**（111 杀、Lv4、挺过 4:00 泯灭者阶段），死亡曲线 77%→44%→5% 血（10s 内崩塌，非暴毙）——判定前期曲线对新玩家友好
- 索敌距离 900px → 460px（pulse/shard/lance）：修复"击杀发生在拾取半径外导致 0 经验"的体验断裂
- 敌人基础移速整体上调（mote 55→76、dart 96→118 等 13 项）：消除"一直跑就永不掉血"的逃课问题

### Performance（2026-10-28 凌晨 · 60fps 专项）

玩家实测帧率过低后的渲染专项优化（末期压力场景：百级敌群 + 粒子池满载）：

- **GlowCache（`src/render/glow.ts`）**：着色辉光改为预渲染贴图缓存，`drawGlowAt` 从"每帧每实体一次 `createRadialGradient` + 两次绘制"降为单次 `drawImage` —— 这是每帧上百次调用的最热路径
- **粒子系统**：池容量 2200→1400，glow 型粒子绘制尺寸减半（lighter 混合下的大贴图是最大过度绘制源），混合模式每帧只设置一次而非每粒子一次，各画质档位限绘制量（1100/800/500），引擎尾焰生成频率 0.03s→0.055s
- **爆炸特效**：动态径向渐变 → 缓存辉光贴图 + 白环描边
- **自适应画质分级**：EMA 帧时间监控，>19ms 快速降档（DPR 上限 1.5→1、关云气、减粒子），<14.5ms 自动回升——弱机自动保 60fps
- **实测**：压力场景渲染均值 4.79ms / P95 13.8ms（预算 16.67ms），较优化前（同场景 7.26ms/20.3ms，且原始基线测量时特效近乎为空）显著改善；星空/网格绘制实测仅 0.18ms 维持原案

### Android & Open Source（2026-10-28 凌晨）

- **Android 横屏版**（Capacitor 7 封装，`android/`）：
  - `sensorLandscape` 强制横屏 + 沉浸式全屏（隐藏系统栏，下拉临时呼出）+ 游戏中屏幕常亮
  - 竖屏持机显示"请横持设备"遮罩并自动暂停对局（`src/ui/mobile.ts`）
  - 触屏虚拟摇杆 + 冲刺键（此前已实现）在 coarse-pointer 设备自动启用
  - 自适应启动图标（深空底 + 青色信标，unique 资源名规避模板 v24 遮蔽）
  - **零权限清单**（纯单机，移除 INTERNET）· minSdk 24 / target 36
  - 开源签名模式：`android/keystore.properties` 不入库，缺失时 release 回退 debug 签名，clone 即可出包
  - 产物：签名 release APK（apksigner 验证通过），GitHub Release v1.0.0 分发
- **开源发布**：MIT LICENSE、双语 README（截图/徽章/构建指南）、GitHub 公开仓库 + Release
- 已知限制：模拟器验证因宿主机无 hypervisor 驱动跳过（驱动安装需管理员）；APK 内嵌 Web 内容与浏览器全链路验证版本一致
