# 《星渊回响》v1.1.0 「无尽回廊」设计稿

> 2026-10-28 凌晨 · 本版本目标：给已完成的 v1.0.0 增加可玩深度（模式 × 内容 × 长线目标），保持架构分层不变、测试全绿。

## 1. 运行模式（RunMode）

`RunConfig.mode: 'standard' | 'endless' | 'daily'`，RunState 增加 `mode / loop / loopStart / evolutions / dailyDate / dailyModifier`。

### 无尽模式 endless
- 解锁：任一局击败「深渊之眼」（`meta.victories > 0`）。角色选择屏的模式切换处显示锁与条件。
- 9:00 击杀 boss_eye **不结算胜利**，而是进入下一循环（深度 +1）：
  - `loopStart = time`，导演时间轴/相位表以 `time - loopStart` 重新查表（timelineIdx 归零，bossDone 复位）。
  - 敌人成长沿用绝对时间（enemyHpScale/enemyDmgScale 天然继续增长），另加循环乘数：`loopHpMul = 1.12^loop`，经验 `loopXpMul = 1 + 0.15*loop`（保证成长跟得上压力）。
  - 每循环末尾再次刷新 boss_eye（HP 用绝对时间 bossHpScale）。
- 死亡结算：结果屏显示 **深度**（已清循环数）与时长；无胜利概念。
- HUD 右上加深度计数；`RUN_HARD_CAP` 对无尽不生效。

### 每日挑战 daily
- 种子：`fnv1a('abyssal-daily-' + YYYY-MM-DD)` → uint32。同一天所有玩家同一开局。
- 角色：按日期轮换（含未解锁角色——每日是"试用日"），界面展示当日角色。
- 修正器：种子从 6 个修正器里选 1（敌人速度+15%&经验+20% / 磁吸×2 / Boss HP-30% / 精英+1批 / 初始+1级武器 / 受伤+25%&暴击+10%）。
- 计分：`kills + floor(time)*2 + level*20 + (victory?500:0)`；`meta.dailyBest {date,score}` 只记当日最佳；完成任意一局标记 completed（对应成就）。
- 每日使用标准 9 分钟规则（含胜负）。

## 2. 成就系统（20 个）

- `src/game/achievements.ts`：`ACHIEVEMENTS` 表，`checkLive(state, meta)`（局内每秒节流）+ `checkAfterRun(result, meta)`（结算扫一遍）。
- 存储：`MetaSnapshot.achievements: Record<string, 1>`；解锁即时持久化。
- 表现：DOM toast 队列（`.toast-layer`，不随屏幕重建消失）+ 主菜单「成就」面板（解锁/未解锁/可量化进度）。
- 新增角色解锁：「织夜者 vesper」= 完成一次武器进化。

清单：首局 / 单局100杀 / 单局500杀 / 存活5分 / 击杀泯灭者 / 击败深渊之眼 / 首次进化 / 单局3进化 / 前5分无伤 / 武器满级 / 单局10精英 / 生涯星核1000 / 生涯25局 / 完成每日 / 无尽深度2 / 无尽深度5 / 单局满4武器 / 强化树任一满级 / 三角色都胜利 / 单局星核入账≥15。

## 3. 新内容

- **角色**：`vesper 织夜者`（startWeapon: scythe；90HP/0.92冷却/210速）。
- **武器 ×2**（含新被动 ×2，避免与既有 8 组进化被动冲突）：
  - `scythe 虚空收割`：朝向 120° 锥形挥砍（半径 95，强击退）。进化 `scythe_eclipse 蚀月`（被动 `aegis 回响护盾`）：360° 环斩 + 斩杀 12% 以下非 Boss。
  - `mines 星棘雷`：布设感应地雷（0.4s 布防，敌近 70px 或 6s 后爆，AoE 110px）。进化 `mines_bloom 星棘花海`（被动 `greed 贪婪协议`）：爆炸留下 2.5s 持续伤害区，双雷连布。
  - 新被动：`aegis`（+2 护甲 +8% maxHp/级，max 3）、`greed`（+15% xpMul +10% luck/级，max 3）。被动栏位仍为 4。
- **敌人**：`elite_echo 回响体`（behavior `dasher`：接近→0.8s 蓄力 telegraph→3.2x 速度突进 0.5s；死亡必掉星核拾取物）。加入标准 8:20 时间轴与无尽循环时间轴。
- **图集/图标**：`pr_mine`、`pr_mine_bloom`、`enemy_elite_echo`、`weapon_scythe`、`weapon_scythe_eclipse`、`weapon_mines`、`weapon_mines_bloom`、新被动图标；FxKind 新增 `slash`（带角度的弧形斩击特效）。

## 4. 统计与设置

- MetaSnapshot 新增：`totalCoresEarned / bestKills / bestLevel / totalPlaySeconds / endlessBestDepth / dailyBest / charWins`。
- 图鉴 stats 标签页扩展展示以上字段（含成就计数）。
- 设置新增 `reducedFlash`（低闪模式：抑制全屏白闪与低血脉冲，光敏友好）。SaveData version 2 + 迁移函数（v1 → v2 补默认值）。

## 5. 质量门槛（不达标不提交）

- 新增单元测试：模式（无尽循环/缩放/无硬上限）、每日（种子稳定/计分/修正器）、成就（触发判定）、新武器（弹幕/爆炸参数）、存档迁移。
- `tsc --noEmit` 0 错误、ESLint 0 警告、全部测试通过、构建单文件成功。
- 浏览器实测：三个模式各跑一局（含无尽进循环、每日计分、成就 toast）、新武器手感、新精英行为。
- 无尽平衡：机器人脚本 2 局（若时间允许）。

## 6. 发布

- 版本 1.1.0；CHANGELOG；DESIGN/ARCHITECTURE/README 同步。
- Capacitor APK 重打包 + keystore 签名 → GitHub Release v1.1.0。
- dist/index.html 推 GitHub Pages（在线试玩链接）。
- 工作区根：`验收报告-2.md`。
