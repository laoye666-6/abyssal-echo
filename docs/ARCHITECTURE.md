# 星渊回响 · 架构文档（ARCHITECTURE.md）

面向接手开发者。读完本文你应当能：找到任何功能的归属层、安全地添加武器/敌人/被动、理解为何模拟可测试、以及知道哪些地方埋着扩展点。
契约级信息以 `src/game/types.ts` 为准（头注释即架构原则）。

---

## 1. 分层架构与依赖规则

```
                ┌──────────────────────────────────────────────┐
                │                   app.ts                     │  应用层状态机
                │  title/characters/running/paused/upgrade/    │  持有 Clock、组装
                │  results/settings/codex/meta                 │  一切子系统
                └────┬──────────────┬──────────────┬────────────┘
          每帧调用    │              │ 事件消费      │
        ┌────────────▼───┐   ┌──────▼─────┐   ┌────▼─────────┐
        │  game/ (模拟)   │   │ render/    │   │ audio/       │  表现层
        │  sim/combat/   │   │ renderer/  │   │ engine/sfx/  │  只读 RunState
        │  director/...  │   │ camera/hud │   │ music        │  + events
        └───┬───────┬────┘   └─────┬──────┘   └──────┬───────┘
            │       │              │                 │
      ┌─────▼──┐ ┌──▼──────┐  ┌────▼─────┐    ┌──────▼──────┐
      │ core/  │ │ data/   │  │ ui/ (DOM)│    │ core/i18n   │
      │clock   │ │纯数值表  │  │覆盖层    │    │ save        │
      │rng/pool│ └─────────┘  └──────────┘    └─────────────┘
      │input...
      └────────┘
```

**依赖方向规则（硬性）**：

1. `game/`（模拟层）**禁止** import `render/`、`audio/`、`ui/`。模拟对表现的全部输出只有 `RunState.events`（damage/fx/sfx 三队列，`types.ts:419-423`）。
2. `data/` 是纯数据表，`weapons/`、`enemies/` 是纯函数行为，两者都只依赖 `game/types.ts` 的接口。
3. 表现层**只读**模拟状态（`state.player`、各 Pool），绝不写回；唯一的"表现→模拟"通道是输入（`app.ts:161` 把 `SimControl` 传给 `stepSim`）与升级选择（`app.chooseUpgrade`，`app.ts:190-202`）。
4. `core/` 不依赖任何游戏概念（`math.ts`/`pool.ts`/`rng.ts` 甚至不 import types）。

这条规则的收益：模拟层可以在 Node 里裸跑（见 `tests/sim.spec.ts`，不 mock 任何 DOM/Canvas/Audio），整局游戏逻辑 100% 单测覆盖。

**应用层状态机**（`src/app.ts:22`）：`'title' | 'characters' | 'running' | 'paused' | 'upgrade' | 'results' | 'settings' | 'codex' | 'meta'`。`step()` 仅在 `running` 推进模拟（`app.ts:157-158`）；升级通过 `state.pendingLevelUps > 0` 切入 `upgrade` 模式，选完减一并回 `running`（`app.ts:180-184,190-202`）——注意：**升级时模拟暂停**（step 早退），但渲染继续（rAF 一直转），所以升级界面背后画面是定格的。

---

## 2. 固定步长时钟与 rAF 挂起看门狗（`src/core/clock.ts`）

- `SIM_STEP = 1/60`（`clock.ts:6`）。模拟永远以固定 60Hz 步进，与渲染帧率无关；渲染每 rAF 一次，拿 `frameDt` 做插值类表现动画（相机、粒子、FX）。
- **累加器模式**：`acc += frameDt`，`while (acc >= SIM_STEP) stepFn(SIM_STEP)`；每帧最多补 4 步（`MAX_CATCHUP`，`clock.ts:8,84-90`），超出部分直接丢弃——防止"模拟慢→帧更长→补更多步"的死亡螺旋。
- **看门狗**（`clock.ts:35-53`）：16ms 定时器持续检查 `now - lastRafAt > 220ms`（`RAF_STARVE_MS`）。rAF 被挂起（标签页隐藏、窗口最小化、嵌入式面板被覆盖）时取消 rAF、由定时器接管 `pump()` 继续推进模拟，并以 **500ms 一次**的低频渲染维持画面（`clock.ts:47-50`）。rAF 恢复后重置累加器交还驱动（`clock.ts:66-71`）。设计动机：survivors-like 的"局内时间"是核心资产，挂后台也**不应停止结算**。
- 死亡螺旋防护与看门狗共用同一个 `pump()`，两条驱动路径行为一致。

---

## 3. 对象池与粒子（`src/core/pool.ts`、`src/render/particles.ts`）

**Pool 是稠密数组池**：构造时一次性分配 N 个对象，`alive` 布尔做开关，遍历永远 O(capacity)、零分配、无 GC 抖动（`pool.ts:1-65`）。

- `spawn()` 从游标起找第一个空槽；**池满时覆盖游标处最旧对象**——保底不崩溃（`pool.ts:26-42`）。这是有意为之的降级策略：宁可最旧的投射物消失，也不让游戏崩或卡。
- `despawn()` 幂等；`forEach()` 回调内可安全 despawn 当前项（数组不重排）。
- 各池容量在 `makeRunState`（`src/game/state.ts:46-69`）：敌人 420、投射物 700、敌方子弹 260、经验宝石 900、拾取物 24、随从（orbit 刃/无人机/光环）64。敌人上限 300 + 分裂体/虫潮余量 → 420；容量改动时留意这个余量关系。
- 对象 `id` 即槽位号，稳定不变——空间网格与 `hitIds` 集合依赖它做身份识别。

**Particles**（`particles.ts:23-64`）：容量 2200 的**环形覆盖池**——`spawn()` 只向前推进游标、试 8 个槽位，找不到空位就直接顶掉最旧粒子。粒子生灭极频繁、不允许"找不到槽位"，环形覆盖是正确的语义。粒子只属于表现层（`app.ts` 的引擎尾焰、`renderer` 的死亡碎裂），不参与模拟。

---

## 4. 空间哈希网格（`EnemyGrid`，`src/game/combat.ts:14-50`）

- 单元格 **CELL = 96**px（约等于最大敌人直径 + 索敌余量），`Map<number, Enemy[]>` 存储，键为 `cx*73856093 ^ cy*19349663` 整数哈希（`combat.ts:22`）。
- **每步重建**：`sim.ts:57-58` 先 `grid.clear()` 再全量 insert。420 个上限下全量重建比增量维护更便宜且无遗忘 bug。
- `query(x, y, r, fn)` 遍历覆盖单元格，**可能返回少量超界者**，由调用方做精确圆-圆二次校验（`sim.ts:137-138` 等处）。API 契约是"粗筛"，不是"精确"。
- 消费方：投射物碰撞（`sim.ts:134`）、爆炸（`combat.ts:295`）、orbit 刃与 frost 光环（通过 `state.gridRef` 注入，`sim.ts:23` + `orbit.ts:67`/`frost.ts:45`）、lance 沿线采样查询（`lance.ts:57-68`）。
- 另有全局暴力索敌 `nearestEnemy` / `nearestEnemies`（`combat.ts:54-79`），供 arc/lance/drones 使用——敌人规模下 O(n) 可接受，且保证"全局最近"语义。

---

## 5. 确定性设计

- **Rng（mulberry32）是模拟层唯一的随机来源**（`src/core/rng.ts`；`RunState.rng` 于 `state.ts:32` 以 `cfg.seed` 构造）。种子来自 `Math.random()`（`app.ts:117`），一个 Run 一个实例。
- 同种子同输入 ⇒ 同轨迹。这不是理论承诺而是被测试锁死的事实：`tests/sim.spec.ts:22-43` 用两个同种子状态并行跑 600 步，断言 time/level/kills/enemies.live/player.x/player.hp **逐位相等**。
- 纪律：模拟代码里**禁止** `Math.random()`（表现层例外：相机震动、粒子、链式闪电折线、音乐铃音——它们不反馈进模拟，破坏不了确定性）。
- 现状与价值：回放/镜像对战**尚未实现**，确定性当前的直接收益是高质量单元测试（无需 mock、无需快照容差）。接手者若要做回放，只需录制 `{seed, 逐帧输入}` 序列——架构上没有其他障碍。
- 遗留：`src/main.ts:17` 已解析 `?seed=` URL 参数但**尚未接线**（下一节"扩展点"）。

---

## 6. 事件流：damage / fx / sfx 三通道

生产者与消费者完全解耦，生命周期一圈为一帧：

```
模拟 stepSim（生产）
  combat.dealDamageToEnemy → events.damage.push（伤害数字、击杀标记）
  weapons/* enemies/*      → events.fx.push（explosion/beam/chain/ring/...）
  sim/combat               → events.sfx.push（{name, v 音量, p 音高}）
        │
表现 renderFrame（消费，app.ts:269-286）
  damage → 相机 kick + renderer.pushDamage（浮动数字）
  sfx    → audio.play(name, v, p)
  fx     → renderer.drawFxWorld 内部直接消费（renderer.ts:352-354 入队为瞬时动画）
        │
drainEvents(state)（app.ts:285，state.ts:98-102）——三队列清空，一圈结束
```

关键细节：

- **fx 的消费者在 renderer 内部**（`renderer.render` 每帧读取 `state.events.fx` 转为瞬时动画/粒子），damage/sfx 的消费者在 app——所以 `drainEvents` 必须在 renderer.render **之后**调用（`app.ts:263-285` 的顺序即为此设计）。
- **护栏**：挂起/看门狗模式下表现层可能 500ms 才渲染一次，事件会积压。`sim.ts:270-272` 在模拟侧截断：damage ≤300、fx ≤200、sfx ≤24。另有 `capEvents()`（`combat.ts:279-282`）备用。
- sfx 事件自带音量/音高系数（如普通命中 v=0.5、随机 ±8% 音高，`combat.ts:164`），音频引擎侧再做 30ms 同名节流（v>0.9 的重要音效豁免，`engine.ts:93-98`）。
- 横幅（`state.banner`）不走事件通道，是状态而非事件（持续 2.4~3s，`director.ts:91,98,118`）。

---

## 7. 程序化资源：零外部资产

### 7.1 精灵图集（`src/render/atlas.ts`）

- 启动时 `buildAtlas()`（`atlas.ts:427-434`）在离屏 canvas 上逐个绘制约 30 个精灵：玩家、宝石、3 种拾取物、10 种投射物/随从、敌方子弹、13 种敌人。
- `buildSprite`（`atlas.ts:33-50`）：2× 超采样 + shadowBlur 辉光；随后用 `source-in` 合成出**白色剪影版**——受击白闪就是同一精灵叠画白版、按 `flash/0.12` 渐隐（`renderer.ts:197-200`，`flash` 由 `combat.ts:142` 置位）。
- 另有 64px 径向渐变 `buildGlowBlob()`（`atlas.ts:437-448`），是所有辉光/粒子的通用贴图（`renderer.drawGlowAt` 以 `lighter` 混合着色）。
- UI 图标复用同一图集（`ui.ts:59-70` 直接从 atlas 取 canvas 画到 DOM 上的小 canvas）。
- 想改视觉：只改 `atlas.ts` 的 PAINTERS/SIZES 表，不碰渲染管线。

### 7.2 音频（`src/audio/`）

- **拓扑**：sfx bus + music bus → DynamicsCompressor（threshold -14/knee 24/ratio 3）→ master → destination（`engine.ts:51-67`）。音量应用用平方感知曲线 + `setTargetAtTime` 防爆音（`engine.ts:138-144`）。
- **解锁时机**：`unlock()` 幂等，首次 pointerdown/keydown 时由 UI 层调用（`ui.ts:39-46`）；未解锁期间 `play()` 静默丢弃（`engine.ts:91`）。
- **SFX**：14 条纯 WebAudio 合成配方（`sfx.ts`），每条配方 = 一组短生命周期节点，尾部 source 的 `onended` 统一 disconnect，杜绝泄漏（`sfx.ts:79-83`）。白噪声缓冲按 AudioContext 缓存复用（`sfx.ts:26-44`）。
- **音乐**：`MusicDirector`（`music.ts`）——B 和声小调 / 92 BPM / 4 小节循环的 **lookahead 音序器**（100ms 心跳、调度未来 220ms，`music.ts:25-29,257-271`）。5 条层 gain（pad/bass/arp/perc/bell）随 `intensity`（波次导演驱动，`app.ts:284`）以 ~1.5s 时间常数呼吸：琶音层 >0.35 渐入、打击层 >0.7 渐入（`music.ts:227-241`）。菜单模式只有 pad + 5-10s 随机间隔的空灵铃音。`stop()` 先淡出再统一断开，可无泄漏地反复 start/stop（`music.ts:108-139`）。
- 音乐模式切换在引擎侧镜像（`musicMode: 'off'|'menu'|'run'`，`engine.ts:44,104-135`）：菜单→战斗时 pad 延续、节奏层无缝渐入（`enterRun`）。

---

## 8. 存档：版本化与防御性合并（`src/core/save.ts`）

- 存储：`localStorage['abyssal-echo.save.v1']`，`SaveData { version: 1, settings, meta }`（`save.ts:3-4`，`types.ts:481-485`）。
- **loadSave 防御链**（`save.ts:60-82`）：JSON 损坏 → 默认档；`version !== 1` → `migrate()`（当前为逐级迁移的空壳，`save.ts:88-91`）；settings 逐字段类型校验 + `clamp01`；meta 走 `mergeMeta`。
- **mergeMeta**（`save.ts:34-58`）：以默认值为底座做深合并——非有限数、负数一律钳 0/丢弃；`unlocked` 白名单过滤（`'hacker'` 进不来）；`peregrine` 不会重复追加。目标：**存档永远可玩**，手改/损坏/半截数据最多丢进度，绝不崩启动。
- 写入 `persistSave` 全程 try/catch：隐私模式/配额满静默降级为"不保存"（`save.ts:93-99`）。
- 写入时机：局结束（`app.ts:230`）、改设置（`app.ts:301`）、买强化（`ui.ts:459`）。局中不落盘，**没有中途存续**——放弃即结算。
- 扩展存档版本时：VERSION++ 并在 `migrate()` 里逐级迁移，`mergeMeta` 的字段校验模式可以照抄。

---

## 9. i18n（`src/core/i18n.ts`）

- 扁平 key 字典：`zh` 主语言（约 150 条）+ `en` 完整对译；`t(key, params)` 缺 key 回落 zh，再缺返回 key 本身（`i18n.ts:426-430`）。
- `{param}` 插值：`t('results.cores', { n: 42 })` → `"星核 +42"`（正则替换，`i18n.ts:429`）。
- key 命名约定即 UI 数据源：`weapon.<id>.name/desc/evoName/evoDesc`、`passive.<id>.perLevel`（升级卡片直接渲染）、`enemy.<id>.name/desc`（图鉴）、`metaNode.<id>.name/desc`、`char.<id>.perk`。**加新武器/敌人/被动 = 同时加 4 个语言的 key，否则 UI 显示原始 key**。
- 语言存于 `settings.lang`，`GameApp` 构造与 `updateSettings` 时 `setLang`（`app.ts:58,302`）。运行时切换即时生效（UI 重建屏幕）。

---

## 10. 测试策略（47 个测试，`tests/`）

运行：`npm test`（一次性）/ `npm run test:watch`。当前 6 文件 47 用例全绿（vitest 3）。

| 文件 | 数量 | 覆盖 |
| --- | --- | --- |
| `rng.spec.ts` | 9 | 种子确定性、range/int/chance/weighted/shuffled 的边界与分布（万次采样验证） |
| `pool.spec.ts` | 7 | spawn/despawn 计数、池满覆盖、id 稳定、forEach 内 despawn 安全 |
| `balance.spec.ts` | 6 | 曲线单调性、护甲下限、星核公式、密度钳制、Boss 倍率 |
| `save.spec.ts` | 6 | 默认档结构、损坏 JSON、mergeMeta 防御（非法 id/负数/超界）、版本迁移回落 |
| `upgrades.spec.ts` | 13 | 三选一去重与补位、栏位上限、进化资格矩阵（满级×被动等级）、applyOption 各分支、recomputeStats 的 maxHp 差值回补 |
| `sim.spec.ts` | 6 | **同种子决定性**（600 步逐位相等）、前 1s 无敌人生成、接触伤害、死亡路径、升级触发、投射物击杀 |

**设计思路**：分层架构让模拟层在 Node 裸跑——`makeRunState` + `stepSim` 就是全部入口（`sim.spec.ts:12-19` 的测试脚手架值得照抄）。曲线类测试断言"单调/有界"而非具体值，避免调参就挂测试。

**如何加新测试**：在 `tests/` 建 `*.spec.ts`；导入路径用 `@/` 别名（vitest 与 vite 共享 tsconfig 的 paths）；优先模式是"构造 RunState → 直接调被测纯函数 / 跑 N 步 stepSim → 断言状态"。不需要 mock（唯一例外：save 测试用 `vi.stubGlobal('localStorage', ...)`，见 `save.spec.ts:17-24`）。

---

## 11. 已知限制与扩展点

以下均为代码中可验证的真实现状，按"接手后最可能碰到"排序：

### 限制（现状如此，勿当成 bug 踩坑）

1. **触控已实现（v1.1），手柄仍未实现**：触屏虚拟摇杆 `src/ui/touch.ts` 汇入 `SimControl`（`main.ts:16-23`），移动端加固（横屏提示/禁长按菜单）在 `src/ui/mobile.ts`（`main.ts:25`）；手柄映射仍缺失。 <!-- v1.1 校对 -->
2. **`?seed=` 未接线**：`main.ts:16-17` 解析了 URL 参数但丢弃（`void new URLSearchParams(...)`）。接线点：`app.startRun()` 的 `seed = Math.random()*0xffffffff`（`app.ts:117`）改为读取该参数即可获得可分享种子。
3. **行为枚举有幽灵项**：`EnemyBehaviorId` 声明了 `'charger'` 与 `'orbiter'`（`types.ts:143-146`），但 `enemies/index.ts` 的行为表只实现 6 种，也没有敌人引用它们。
4. **敌人 `params` 字段未被执行读取**：`enemies.data.ts` 里 stinger 的 weaveAmp/weaveFreq、warden 的 keepDist/fireCd/bulletSpeed/bulletDmg、shardling 的 childId 都是文档性数据，行为代码里是同值的硬编码常量（`enemies/index.ts:34-35,81,102-111`；分裂子体硬编码 `'mote'`，`combat.ts:208`）。调这些 params 不会生效，需先改为读取 `def.params`。
5. **死代码**：`balance.weaponDamage`（`balance.ts:38-40`）、`weapons/helpers.hpScaleRef` 与 `assertWeapon`（`helpers.ts:70-77`）导出但无调用方；`renderer.drawFxScreen` 是空实现（`renderer.ts:544-546`）。
6. **进化武器图标是占位映射**：`ui.weaponIconKey`（`ui.ts:72-83`）把 arc/lance/frost 等映射到已有投射物精灵（如 arc→pr_orbit），图标不精确。
7. **存档版本迁移是空壳**：版本不匹配直接回落默认档（`save.ts:88-91`），未来改档结构时必须补真实迁移，否则用户进度清零。
8. **后台继续模拟**：看门狗保证 rAF 挂起时模拟不中断（`clock.ts:35-53`）。v1.1 起窗口失焦自动暂停对局（`window` blur → `app.pause()`，`app.ts:94-97`）；`document.visibilitychange` 本身仍未监听，无失焦信号的隐藏场景仍会继续模拟。 <!-- v1.1 校对 -->
9. **伤害数字池覆盖策略**：`Renderer.pushDamage` 池满时覆盖第 0 槽（`renderer.ts:558`），极端瞬间可能吞数字，属于接受的降级。
10. **`sim.spec.ts` 中注释 `xpToNext(1)=15` 不准确**（实际 14，`balance.ts:15`），仅注释笔误，断言未受影响。

### 扩展点（架构已留好接缝）

1. **新武器/新敌人**：武器 = `data/weapons.data.ts` 加条目 + `weapons/` 加行为 + `weapons/index.ts` 注册 + i18n 4 个 key（+可选 atlas 精灵）；敌人 = `enemies.data.ts` 加条目（选已有 behavior）+ atlas 精灵 + i18n +（可选）加入 `waves.data.ts` 池。均不需要改 `sim.ts`。
2. **新被动/新星核节点**：各在 `passives.data.ts` / `meta.data.ts` 加一条 `apply` 纯函数，UI 自动渲染（图鉴/强化界面遍历 data 表）。
3. **回放系统**：确定性已就绪（第 5 节），只需输入录制器 + `{seed, inputs[]}` 序列化。
4. **触控/手柄**：实现 `Input` 的对等物并从 `app.step` 注入 `SimControl`；模拟层零改动。
5. **网络/镜像对战**：`RunState` 可整体序列化（Pool 是纯数据），事件流是现成的"表现差异包"。
6. **新 Boss**：`boss.ts` 加状态机 + `enemies.data.ts` 条目（behavior 任意，`bossUpdate` 按 kind 分派）+ timeline 加 `{type:'boss'}`。
7. **音频新配方**：`sfx.ts` 加配方 + `SfxName`（`types.ts:327-329`）加枚举 + 分发 switch 加一行。

---

## 12. v1.1 附录：模式管道、成就系统、存档 v2 与调试钩子

### 12.1 新模块一览与依赖方向

v1.1 新增/显著改动的模块：

| 模块 | 职责 |
| --- | --- |
| `src/game/achievements.ts` | 成就定义表 + 三通道判定（纯函数，无 DOM/Audio） |
| `src/data/daily.data.ts` | 每日修正器池与抽取函数 |
| `src/game/weapons/scythe.ts` / `mines.ts` | 新武器行为（注册于 `weapons/index.ts:23-24,33-34`） |
| `src/game/enemies/index.ts` 的 `dasher` | elite_echo 行为（`enemies/index.ts:138-182`） |
| `src/ui/touch.ts` / `src/ui/mobile.ts` | 触屏控制与移动端加固（`src/main.ts:16-25`） |

依赖方向的两处新增约定（红线）：

1. **achievements.ts（game/）→ data/meta.data + data/weapons.data**（`achievements.ts:9-10`）。game→data 本就是允许方向，但成就模块把这两张表的**形状**变成了自己的契约：`maxed_weapon` 读 `WEAPON_DATA[w.id]?.maxLevel`（`achievements.ts:84`，带 `?? 99` 兜底）、`forge_master` 遍历 `META_NODES` 的 id/maxRank（`achievements.ts:122`）。重构这两张表（改名/改字段/改 maxRank 语义）必须同步过一遍成就谓词，否则编译报错或静默失效。
2. **daily.data.ts（data/）→ game/balance**（`daily.data.ts:2`，`dailySeed`）。这是 data/ 首次依赖 game/ 的**函数**（此前仅 types.ts 的类型）。balance 全部纯函数无状态，方向上可接受；反向（balance import data/）仍禁止。

另一处结构性注意点：`evaluateMeta` 以全零 `RunSummaryLite` 复用 afterRun 谓词（`achievements.ts:163-168`）——任何读 `r.*` 的 afterRun 成就在 meta 通道恒为 false。**新成就若想被"购买星核强化"触发，谓词必须只读 meta 参数**（现有消费方：core_mogul / veteran / forge_master / trifecta）。

### 12.2 模式管道（standard / endless / daily）

```
RunConfig.mode（'standard'|'endless'|'daily'，types.ts:406,412）
  → app.startRun(mode)（app.ts:145-173）
      daily：seed = dailySeed(date)（app.ts:148）、角色 = dailyCharacter（149-151）、
             makeRunState 注入 mode/dailyDate（152-158）、push 初始武器后 mod.apply(state)（159-164）
  → makeRunState（state.ts:33-41：mode、loop=0、loopStart=0、enemySpeedMul/enemyHpMul/bossHpMul=1）
  → stepSim
      director：endless 下 t = time − loopStart（director.ts:30），相位/密度/时间轴按循环重放
      combat.spawnEnemy：速度乘 enemySpeedMul（combat.ts:97）；
                         血量 = enemyHpScale(time) × hpMul × enemyHpMul × loopHpMul(loop)（87-88，Boss 例外走 bossHpMul）
      combat.killEnemy：boss_eye 分支——endless 进下一循环（loop++ / loopStart=time / timelineIdx、phaseIndex 归零，
                        combat.ts:196-205），否则置 victory（206-208）
      sim：超时判负跳过 endless（sim.ts:265-268）
  → app.finishRun（app.ts:252-332）
      depth = loop + 1（app.ts:259；upgrades.collectRunSummary 同语义，upgrades.ts:196-197）
      daily：dailyScore → meta.dailyBest 覆盖/取优（app.ts:261-275）
      meta 写回：endlessBestDepth / charWins / bestiary / totalPlaySeconds 等（app.ts:277-295）
```

表现层一致性：HUD 相位标签同样以循环相对时间倒计时（`app.ts:384,388`，i18n key `hud.depth`，`i18n.ts:233`）。

### 12.3 成就系统：三通道数据流

```
live      app.step 每 1s 节流（achvT，app.ts:73,204-209）
          → evaluateLive(state, meta)（achievements.ts:135-146）
afterRun  finishRun：先补一次 evaluateLive 覆盖边界（app.ts:307）
          → evaluateAfterRun(summary, meta)（achievements.ts:149-160，调用点 app.ts:308）
meta      星核商店购买后 → checkMetaAchievements（app.ts:434-436）
          → evaluateMeta（全零 summary，只读 meta 参数可解锁，achievements.ts:163-168）
        ↓ 三通道汇合
unlockAchievements(ids, silentSfx)（app.ts:417-431）
  幂等：meta.achievements[id] 已置位即跳过（app.ts:422；achievements.ts:138）
  写 meta.achievements[id] = 1（app.ts:423）→ ui.toast（app.ts:425，toast 层 3.2s 自动消失）
  → persistSave（app.ts:428）→ levelup 音效 v=0.7 p=1.3（app.ts:429；afterRun 传 silentSfx=true 不播）
```

面板入口：AppMode 增加 `'achievements'`（`app.ts:24`）；进度条 `achievementProgress`（`achievements.ts:171-173`）。测试：`tests/achievements.spec.ts`（10 用例，锁死三通道与 depth=loop+1 语义）、`tests/modes.spec.ts`（7 用例）、`tests/weapons.spec.ts`（9 用例）、`tests/save.spec.ts` 增补 v1→v2 迁移用例（`save.spec.ts:124`）。

### 12.4 存档 v2（`src/core/save.ts`）

- `SAVE_VERSION = 2`（`save.ts:4`）；localStorage 键名仍是 `'abyssal-echo.save.v1'`（`save.ts:3`）——键名未随版本升级，版本号在 payload 内。
- **新增字段清单**（全部可选，缺省回落 defaultMeta/defaultSettings 底座，`save.ts:28-35`）：
  - `settings.reducedFlash`（`types.ts:538`；解析校验 `save.ts:108`）
  - `meta.achievements`（`types.ts:516`）
  - `meta.totalCoresEarned / bestKills / bestLevel / totalPlaySeconds / endlessBestDepth`（`types.ts:518-524`）
  - `meta.dailyBest = { date, score }`（`types.ts:526`）
  - `meta.charWins`（`types.ts:528`）
- **迁移策略**（`save.ts:99-100`）：

  ```
  version === 1 或 === SAVE_VERSION(2) → 同一条解析路径（v1/v2 字段结构兼容，v2 只是新增字段，
                                        缺失项由 mergeMeta 逐字段校验补齐，save.ts:66-86）
  其他（未来版本）                    → migrate()（save.ts:121-128）：仅 old.version===1 时保留 meta
                                        （经 mergeMeta 防御合并），否则整体回落默认档
  ```

  即 v1 档无损升级（`tests/save.spec.ts:124` 锁死）；v3+ 档按回落默认档处理——与 v1.0 的"版本不匹配清档"语义一致，只是 v1 被显式豁免。ARCHITECTURE §8/§11 所述"迁移是空壳"的现状至此被真实迁移取代。
- **mergeMeta v1.1 扩展**（`save.ts:66-86`）：`achievements` 仅收录值为 1 的键（`68-70`）；`dailyBest` 逐字段校验（`77-81`）；`charWins` 逐键钳非负整数（`82-86`）；其余数值字段统一钳 0（`72-76`）。

### 12.5 新武器实现模式

v1.1 两把武器示范了两种不新增池子/弹种的实现套路：

**scythe：无弹道直接结算。** `fire` 内直接遍历 `state.enemies` 做扇形判定——距离 + `angleDiff` 半角校验（`scythe.ts:6-11,33-39`），伤害即时走 `dealDamageToEnemy`（`scythe.ts:45`），视觉反馈只有一次 `slash` fx，弧线起止角塞进 `FxEvent.points`（`scythe.ts:48-55`；`FxKind` 新枚举 `types.ts:326`）。进化形态不新增 behavior：`scythe_eclipse` 在注册表里别名同一实现（`weapons/index.ts:33`），`fire` 内按 `w.id` 分支取数值（`scythe.ts:22-28`）。

**mines：Projectile 承载"延时实体"。** 地雷与持续伤害区都是普通 Projectile（kind `'mine' | 'mine_bloom'`，`types.ts:219`），不引入新池：
- `mine`：`data0` = 布防倒计时（0.4s，`mines.ts:44,125-128`）；布防期结束后感应半径内查敌（`grid.query`，`mines.ts:129-137`）或寿命（6s）耗尽即 `detonate`（`mines.ts:138-141`）；
- `mine_bloom`（伤害区形态）：`data1 = 1` 为标记位（`mines.ts:66`），`rehit` 承载跳伤间隔（0.5s，`mines.ts:63,113`），每跳对半径内敌人结算 `dmg × 0.35`（noFlash、零击退，`mines.ts:117`）；
- 布雷在 `update` 中自计时：`fire` 是空壳注释（`mines.ts:87-89`），`update` 内 `if (w.cd <= 0)` 布设当批地雷、播 sfx 并重置 `w.cd = mines.cooldown(level) × stats.cooldownMul`（`mines.ts:92-101`）；`w.cd` 的逐帧扣减由 sim 主循环统一完成（`sim.ts:72`）。

**实现注意：带 update 的武器与分发器。** sim 的武器分发规则：每帧对所有武器统一 `w.cd -= dt`（`sim.ts:72`）；仅当 `w.cd <= 0 && !behavior.update` 才调用 `fire` 并按 `cooldown × stats.cooldownMul` 重置（`sim.ts:73-76`）；随后无条件调用 `behavior.update`（`sim.ts:77`）。即**分发器不会对带 update 的武器调 fire**。现有带 update 的武器分两种方案：orbit/drones/frost 的 `fire` 是空壳、逻辑全在 attendants 自驱；mines 采用 update 自计时布雷（frost 光环同族模式，`mines.ts:90-101`）。新写"周期性放置型"武器时照抄 mines 模式，不要在带 update 的武器里写实质 `fire`（永远不会被调用）；测试同样应走 update 真实路径（`tests/weapons.spec.ts:76` 起）。

### 12.6 调试钩子：window.__app

`main.ts` 在 boot 时把 GameApp 实例挂到 `window.__app`（`main.ts:26-27`，注释明确"QA/调试句柄（不影响游戏逻辑）"）。浏览器控制台 QA 用法：

```js
__app.mode                        // 当前 AppMode（app.ts:62）
__app.state                       // 进行中的 RunState：state.loop / state.loopStart /
                                  //   state.director.timelineIdx / state.time
__app.save.meta.victories = 1     // 解锁无尽（判断点 ui.ts:232；改内存值后重开角色屏即生效，
                                  //   下次 persistSave 落盘——如 finishRun / updateSettings）
__app.startRun('endless')         // 直接开一局无尽（app.ts:145；daily 同理）
__app.state.dailyModifier         // 每日命中修正器 id（注入点 app.ts:162）
__app.checkMetaAchievements()     // 手动触发 meta 通道成就判定（app.ts:434）
__app.unlockAchievements(['depth_2'])  // 手动解锁成就（app.ts:417）
__app.abandonRun()                // 以失败结算当前局（app.ts:187，走完整 finishRun 管道）
__app.resetSave()                 // 清档（app.ts:409）
```

典型 QA 流：无尽循环验证 = `__app.save.meta.victories = 1` → `__app.startRun('endless')` → 击杀 boss_eye 后检查 `__app.state.loop === 1 && __app.state.loopStart` 已重置且时间轴重放；每日验证 = `__app.startRun('daily')` 后读 `__app.state.dailyModifier` 与 stats 是否符合 `DAILY_MODIFIERS` 对应项。另：`?seed=` 参数仍被解析但丢弃（`main.ts:29-30`），未接线状态与 v1.0 文档一致。
