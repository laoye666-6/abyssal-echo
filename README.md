# 星渊回响 · ABYSSAL ECHO

> 星井崩塌之后，你是最后一座灯塔。
> 一款纯前端、零外部资源的 survivors-like roguelite：TypeScript + Canvas 2D + WebAudio，构建产物是**一个可以双击离线游玩的单文件 HTML**。

## 30 秒上手

```text
1. 安装依赖：            npm install
2. 启动开发服务器：       npm run dev        → http://localhost:5199
3. 点击"开始坠落"选择角色（初次只有"游隼"）
4. WASD / 方向键移动，空格冲刺，Esc 暂停 —— 武器全自动开火
5. 捡绿色宝石升级，三选一强化；武器满 5 级 + 搭配被动满 3 级可"进化"
6. 活到 9:00 迎战最终 Boss"深渊之眼"，击杀即胜利
7. 死了也不亏：结算发"星核"，在主菜单买永久强化，越死越强
```

## 核心玩法三句话

1. **走位即操作**：所有武器自动索敌开火，你只负责移动、冲刺和站在哪——被包围是唯一死法。
2. **构筑即成长**：每次升级三选一（新武器 / 武器升级 / 新被动 / 被动升级 / 进化），武器与被动互相成就，满级组合触发质变的"进化"。
3. **失败即变强**：每局结算产出星核（击杀、精英、Boss、存活时间），跨局购买 6 节点永久强化树，逐步解锁另外两名角色，逼近 9 分钟的胜利线。

## 快速开始

| 命令 | 作用 |
| --- | --- |
| `npm install` | 安装依赖（vite / vitest / typescript / eslint，全部为 devDependencies，运行时零依赖） |
| `npm run dev` | 启动开发服务器，固定端口 **http://localhost:5199**（`vite.config.ts:20`） |
| `npm run build` | `tsc --noEmit` 类型检查 + 打包，产出 `dist/index.html` **单文件**（`vite-plugin-singlefile`），双击即可离线游玩 |
| `npm test` | 运行 47 个单元测试（vitest，一次性模式）；`npm run test:watch` 为监听模式 |
| `npm run lint` | ESLint 检查 `src` 与 `tests` |
| `npm run preview` | 本地预览构建产物 |

浏览器要求：支持 ES2022 的现代浏览器（Chrome / Edge / Firefox / Safari 近两年版本）。**首次点击或按键后音频才会响起**（浏览器自动播放策略，见 `src/ui/ui.ts:39-46`）。

## 操作说明

| 按键 | 动作 |
| --- | --- |
| `W A S D` / 方向键 | 移动（斜向已归一化，`src/core/input.ts:4-13,54-67`） |
| `空格` | 冲刺：0.18 秒、3.1 倍移速、附带 0.35 秒无敌，冷却 6 秒（`src/game/sim.ts:31-40`） |
| `Esc` / `P` | 暂停（可继续 / 重开 / 放弃本局） |
| `Enter` | 确认（UI 预留） |
| 鼠标 | 点选升级卡、菜单按钮 |

武器完全自动：脉冲追踪最近敌人，射线/电弧自动索敌，星环与无人机自主运行。开局 13 秒内有屏幕内教学提示淡出（`src/render/hud.ts:136-145`）。

## 游戏系统一览

### 角色（3 名，`src/data/characters.data.ts`）

| 角色 | 定位 | 初始武器 | 特性 | 解锁条件 |
| --- | --- | --- | --- | --- |
| 游隼 Peregrine | 均衡巡哨 | 脉冲星尘 | 移速 220（基准 200） | 默认解锁 |
| 壁垒 Bastion | 重装壁垒 | 星环刃 | 生命 140、护甲 +2、拾取范围 84 | 单局存活满 **4:00**（`src/app.ts:222`） |
| 织星 Astraeus | 引力诗人 | 新星爆发 | 生命 80、范围 +25%、暴击 +10% | 累计击败任意 **1 个 Boss**（`src/app.ts:226`） |

### 武器（8 基础 + 8 进化，`src/data/weapons.data.ts` + `src/game/weapons/`）

| 武器 | 一句话手感 | 进化（满 5 级 + 对应被动满 3 级） |
| --- | --- | --- |
| 脉冲星尘 pulse | 追踪弹，永远有人被打 | +聚焦棱镜 → **超新星脉冲**（3 连发，命中迸裂） |
| 星环刃 orbit | 环绕刀刃，贴身保险 | +蜂甲镀层 → **冕环之环**（8 刃大半径） |
| 新星爆发 nova | 环形弹幕，被围时救命 | +生体舱壁 → **引力坍缩**（先吸后炸） |
| 链式电弧 arc | 闪电跳敌，自动清杂 | +共振齿轮 → **天穹之怒**（9 跳 + 眩晕） |
| 贯穿射线 lance | 一线洞穿，对轴输出 | +过载核心 → **奇点光矛**（720px 巨型光束） |
| 蜂群无人机 drones | 自主猎杀的贴身蜂群 | +学者回路 → **星群蜂巢**（8 机高速） |
| 霜蚀领域 frost | 减速光环，控场保命 | +气垫阵列 → **绝对零度**（强减速 + 冻结） |
| 回响晶刃 shard | 弹射折射，在敌群间跳跃 | +引力锚 → **万象镜厅**（14 次弹射） |

规则：武器/被动各最多 **4 个栏位**（`src/data/weapons.data.ts:36-37`）；进化条件为武器满 5 级且绑定被动满 3 级， eligible 时必出现在三选一的第一格（`src/game/upgrades.ts:30-49`）。详细数值见 `docs/DESIGN.md`。

### 被动（8 条，各 5 级，`src/data/passives.data.ts`）

过载核心（伤害 +8%/级）、共振齿轮（冷却 -7%/级）、气垫阵列（移速 +7%/级）、生体舱壁（生命 +25、回复 +0.4/级）、引力锚（拾取 +30%/级）、聚焦棱镜（暴击 +6%、暴伤 +15%/级）、学者回路（经验 +12%/级）、蜂甲镀层（护甲 +1.5/级）。

### 敌人图鉴（8 普通 + 3 精英 + 2 Boss，`src/data/enemies.data.ts`）

- **普通**：尘埃（成群 chaser）、飞镖（高速 chaser）、刺蜂（正弦 weaver）、碎片兽（死亡分裂）、看守者（远程 shooter）、分裂体（大号分裂）、巨垒（重装 tank）、相影（瞬移 phaser）。
- **精英**（时间轴投放，金色光环）：疾影精英（极快）、偏导精英（几乎击退免疫）、母巢精英（持续产卵）。
- **Boss**：4:00 **泯灭者**（环形弹幕 + 蓄力冲锋二段状态机）；9:00 **深渊之眼**（双臂螺旋弹幕 + 召唤尘埃风暴，击杀即通关）。

击败过的敌人会记录进主菜单**档案馆**（含遭遇次数与旅程统计，`src/ui/ui.ts:342-404`）。

### 波次相位（9 相位 + 时间轴，`src/data/waves.data.ts`）

0:00 起每 60 秒进入下一相位，生成速率从 0.9 个/秒爬升到 7.8 个/秒，敌人池逐步加入新行为；同屏敌人数上限从 90 平滑升到 320（`src/game/balance.ts:43-45`）。时间轴在固定时刻投放精英、虫潮（swarm）、治疗补给与两次 Boss 战。**9:00 最终 Boss 登场，11:00 未击杀判负**（`src/game/balance.ts:9-11`）。

### 星核强化（跨局永久，6 节点，`src/data/meta.data.ts`）

| 节点 | 效果 | 等级 | 累计花费 |
| --- | --- | --- | --- |
| 生命回响 | 生命上限 +12/级 | 5 | 430 |
| 伤害回响 | 伤害 +4%/级 | 5 | 525 |
| 推进回响 | 移速 +3%/级 | 4 | 271 |
| 引力回响 | 拾取范围 +12%/级 | 4 | 219 |
| 幸运回响 | 幸运 +1/级（影响升级权重与掉率） | 5 | 590 |
| 不屈回响 | 每局 1 次复活 | 1 | 380 |

星核来源：每 45 击杀 +1、每精英 +3、每 Boss +12、每存活 30 秒 +1，胜利额外 +25（`src/game/balance.ts:48-51`）；局内精英死亡再掉 2、Boss 死亡掉 10、金色核心拾取物 +5。全满共需 2415 星核。

## 技术栈与目录结构

- **运行时零依赖**：TypeScript 5.6 + Vite 6 + Canvas 2D + WebAudio；测试 Vitest 3；构建 `vite-plugin-singlefile` 内联一切资产。
- **确定性模拟**：固定 60Hz 步长 + 单一种子随机源（mulberry32），同种子同轨迹。
- **程序化资源**：精灵图集与全部音效/音乐在启动时合成，仓库里没有一张图片、一个音频文件。

```text
abyssal-echo/
├─ index.html                 # 入口页（内联 SVG favicon，dark 主题）
├─ vite.config.ts             # 端口 5199、@→src 别名、单文件打包
├─ package.json / tsconfig.json
├─ src/
│  ├─ main.ts                 # 启动：创建 canvas + GameApp
│  ├─ app.ts                  # 应用层状态机（title/running/paused/upgrade/results/…）
│  ├─ core/                   # 与游戏规则无关的底层件
│  │  ├─ clock.ts             #   固定步长 60Hz 时钟 + rAF 挂起看门狗
│  │  ├─ rng.ts               #   mulberry32 种子随机（确定性唯一来源）
│  │  ├─ pool.ts              #   稠密对象池（无 GC 抖动）
│  │  ├─ input.ts             #   键盘 → 动作映射
│  │  ├─ save.ts              #   localStorage 存档 + 防御性合并
│  │  ├─ i18n.ts              #   zh/en 双语字典 + {param} 插值
│  │  └─ math.ts              #   clamp/damp/dist2 等纯函数
│  ├─ data/                   # 全部数值表（纯数据，无行为）
│  │  ├─ weapons.data.ts      #   武器等级/进化绑定/栏位上限
│  │  ├─ passives.data.ts     #   8 被动的每级 apply
│  │  ├─ characters.data.ts   #   3 角色初始属性
│  │  ├─ enemies.data.ts      #   13 种敌人的数值与行为标记
│  │  ├─ waves.data.ts        #   9 相位密度表 + 20 条时间轴事件
│  │  └─ meta.data.ts         #   6 节点星核强化树
│  ├─ game/                   # 模拟层（禁止依赖 render/audio/ui）
│  │  ├─ types.ts             #   全局类型契约（最重要的设计文档）
│  │  ├─ sim.ts               #   60Hz 主步进（玩家/投射物/拾取/结算）
│  │  ├─ combat.ts            #   空间网格、伤害管线、击杀结算
│  │  ├─ director.ts          #   波次导演（相位推进/生成环/时间轴/拉回）
│  │  ├─ upgrades.ts          #   三选一候选生成与应用、属性重算
│  │  ├─ balance.ts           #   数值曲线纯函数（经验/成长/经济）
│  │  ├─ state.ts             #   RunState 构造 + 事件清空
│  │  ├─ weapons/             #   8 武器行为 + helpers
│  │  └─ enemies/             #   敌人行为表 + Boss 状态机
│  ├─ render/                 # Canvas 表现层（只读模拟状态 + events）
│  │  ├─ atlas.ts             #   程序化精灵图集（含白色受击版）
│  │  ├─ renderer.ts          #   视差星空/实体/FX/伤害数字/暗角
│  │  ├─ camera.ts            #   前瞻跟随 + trauma 震屏
│  │  ├─ particles.ts         #   2200 容量环形粒子
│  │  └─ hud.ts               #   Canvas HUD（XP 条/计时/Boss 血条/横幅）
│  ├─ audio/                  # WebAudio 全合成
│  │  ├─ engine.ts            #   惰性单例、总线/压限器/节流
│  │  ├─ sfx.ts               #   14 条音效配方
│  │  └─ music.ts             #   92 BPM B 和声小调自适应分层音乐
│  └─ ui/
│     ├─ ui.ts                # DOM 覆盖层（标题/角色/升级/结算/图鉴/设置/强化）
│     └─ styles.css
└─ tests/                     # 47 个单元测试（vitest）
   ├─ balance.spec.ts / sim.spec.ts / upgrades.spec.ts
   └─ pool.spec.ts / rng.spec.ts / save.spec.ts
```

## 常见问题

**Q：进度存在哪？会丢吗？**
存档在浏览器 `localStorage`，key 为 `abyssal-echo.save.v1`（`src/core/save.ts:3`）。读取时做防御性合并：任何字段缺失、类型错误、负数、非法角色 id 都会回落默认值，损坏的 JSON 也只会静默重置，永远不会卡死启动（`src/core/save.ts:60-82`）。设置里有"清除所有存档"。注意：**不同浏览器/隐私窗口之间存档不互通**。

**Q：为什么没有声音？**
浏览器要求用户手势后才能启动 AudioContext。游戏在首次点击/按键时自动解锁（`src/ui/ui.ts:39-46`）；如果仍无声，进"设置"检查音效/音乐音量滑条（默认 0.8 / 0.55，感知曲线为平方，`src/audio/engine.ts:138-144`）。

**Q：怎么切换语言？**
设置 → 语言 → 中文 / English，立即生效并写入存档（zh 为主语言，en 完整对译，缺 key 回落 zh，`src/core/i18n.ts:426-430`）。

**Q：卡顿了怎么办？**
模拟固定 60Hz，渲染压力主要来自同屏实体与粒子。内置护栏：同屏敌人上限 90→320 随时间爬升（`src/game/balance.ts:43-45`）、伤害数字池 160、粒子池 2200、事件队列截断（`src/game/sim.ts:270-272`）。低配设备可在设置里关闭"伤害数字"、调低"屏幕震动"。

**Q：切到别的标签页游戏会暂停吗？**
不会中断。页面隐藏导致 rAF 挂起时，看门狗定时器会接管继续以 60Hz 推进模拟，回来时画面无缝衔接（`src/core/clock.ts:35-53`）。想暂停请按 `Esc`。

**Q：一局要玩多久？**
胜利线 9 分钟（最终 Boss 在 9:00 出现，击杀即胜）；11 分钟仍未击杀判负，防止无限拖。死亡/放弃随时结算星核。

**Q：开发者如何调试？**
`window.__app` 暴露 GameApp 句柄（`src/main.ts:14`），可在控制台检查 `mode/state/save`；`?seed=` 参数位已预留但尚未接线（`src/main.ts:17`）。模拟层与表现层解耦，可参考 `tests/sim.spec.ts` 直接对 `stepSim` 写确定性测试。
