import { t } from '@/core/i18n';
import { persistSave } from '@/core/save';
import type { CharacterId, MetaUpgradeNode, UpgradeOption } from '@/game/types';
import { CHARACTER_DEFS } from '@/data/characters.data';
import { ENEMY_DEFS } from '@/data/enemies.data';
import { META_NODES } from '@/data/meta.data';
import { WEAPON_DATA } from '@/data/weapons.data';
import { formatTime } from '@/core/math';
import type { GameApp, RunResult } from '@/app';
import type { Sprite } from '@/render/atlas';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  html?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

function btn(label: string, onClick: () => void, cls = 'btn'): HTMLButtonElement {
  const b = el('button', cls, label);
  b.addEventListener('click', onClick);
  return b;
}

/** UI 管理器：DOM 覆盖层，全部屏幕。 */
export class UiManager {
  private root: HTMLDivElement | null = null;

  constructor(private readonly app: GameApp) {}

  mount(parent: HTMLElement): void {
    this.root = el('div', 'ui-root');
    parent.appendChild(this.root);
    // 首次手势解锁音频
    const unlock = () => {
      this.app.unlockAudio();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  private clear(): void {
    if (this.root) this.root.innerHTML = '';
  }

  private screen(cls = 'screen'): HTMLDivElement {
    const s = el('div', `screen ${cls}`);
    this.root!.appendChild(s);
    return s;
  }

  /** 从图集生成小图标 canvas（每次新建节点，避免同一节点被 appendChild 移动） */
  private icon(key: string, size: number): HTMLCanvasElement {
    const sp: Sprite | undefined = this.app.atlas.get(key);
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    if (sp) {
      const ctx = c.getContext('2d')!;
      const s = (size / (sp.canvas.width / 2)) * 0.9;
      ctx.drawImage(sp.canvas, size / 2 - (sp.canvas.width / 2) * s / 2, size / 2 - (sp.canvas.height / 2) * s / 2, (sp.canvas.width / 2) * s, (sp.canvas.height / 2) * s);
    }
    return c;
  }

  private weaponIconKey(id: string): string {
    const map: Record<string, string> = {
      pulse: 'pr_pulse', pulse_supernova: 'pr_pulse_supernova',
      orbit: 'pr_orbit', orbit_corona: 'pr_orbit_corona',
      nova: 'pr_nova', nova_collapse: 'pr_nova_collapse',
      shard: 'pr_shard', shard_mirror: 'pr_shard_mirror',
      arc: 'pr_orbit', lance: 'pr_pulse', drones: 'pr_drone', frost: 'pr_nova',
      arc_tempest: 'pr_orbit', lance_singularity: 'pr_pulse',
      drones_hive: 'pr_drone', frost_zero: 'pr_nova',
    };
    return map[id] ?? 'pr_pulse';
  }

  // ---------------- 标题 ----------------

  showTitle(): void {
    this.clear();
    const s = this.screen('title-screen');
    s.appendChild(el('div', 'title-logo', `<span class="logo-zh">${t('app.title')}</span><span class="logo-en">${t('app.subtitle')}</span>`));
    s.appendChild(el('div', 'title-tagline', t('app.tagline')));
    const menu = el('div', 'title-menu');
    menu.appendChild(btn(t('menu.start'), () => this.app.showCharacters(), 'btn primary big'));
    menu.appendChild(btn(t('menu.upgrades'), () => this.app.showMeta()));
    menu.appendChild(btn(t('menu.codex'), () => this.app.showCodex()));
    menu.appendChild(btn(t('menu.settings'), () => this.app.showSettings()));
    s.appendChild(menu);
    const m = this.app.save.meta;
    s.appendChild(el('div', 'title-meta-line', `◆ ${m.cores} · ✦ ${m.lifetimeKills} · ${t('stat.bestTime')} ${formatTime(m.bestTime)}`));
  }

  // ---------------- 角色 ----------------

  showCharacters(): void {
    this.clear();
    const s = this.screen('char-screen');
    s.appendChild(el('h2', 'screen-title', t('menu.characters')));
    const row = el('div', 'char-row');
    const unlocked = this.app.save.meta.unlocked;

    for (const id of ['peregrine', 'bastion', 'astraeus'] as CharacterId[]) {
      const def = CHARACTER_DEFS[id]!;
      const isUnlocked = unlocked.includes(id);
      const card = el('div', `char-card ${this.app.selectedCharacter === id ? 'selected' : ''} ${isUnlocked ? '' : 'locked'}`);
      const head = el('div', 'char-head');
      head.appendChild(this.icon('player', 56));
      head.appendChild(el('div', 'char-names', `<div class="char-name">${t(`char.${id}.name`)}</div><div class="char-title">${t(`char.${id}.title`)}</div>`));
      card.appendChild(head);
      card.appendChild(el('div', 'char-desc', isUnlocked ? t(`char.${id}.desc`) : `<span class="lock-mark">🔒 ${t('char.locked')}</span>`));
      if (isUnlocked) {
        card.appendChild(el('div', 'char-perk', t(`char.${id}.perk`)));
        card.appendChild(el('div', 'char-weapon', `${t('upgrade.new')}: ${t(`weapon.${def.startWeapon}.name`)}`));
        card.appendChild(btn(
          this.app.selectedCharacter === id ? t('char.selected') : t('char.select'),
          () => {
            this.app.selectedCharacter = id;
            this.showCharacters();
          },
          this.app.selectedCharacter === id ? 'btn primary' : 'btn',
        ));
      } else {
        const hint = id === 'bastion' ? '存活 4:00 解锁' : '击败任意 Boss 解锁';
        card.appendChild(el('div', 'char-perk muted', hint));
      }
      row.appendChild(card);
    }
    s.appendChild(row);
    const foot = el('div', 'char-foot');
    foot.appendChild(btn(t('char.back'), () => this.app.showTitle()));
    const sel = this.app.selectedCharacter;
    const startB = btn(t('menu.start'), () => this.app.startRun(), 'btn primary big');
    if (!unlocked.includes(sel)) startB.disabled = true;
    foot.appendChild(startB);
    s.appendChild(foot);
  }

  // ---------------- 局内（仅隐藏 UI） ----------------

  showGame(): void {
    this.clear();
  }

  // ---------------- 暂停 ----------------

  showPause(): void {
    this.clear();
    const s = this.screen('pause-screen');
    s.appendChild(el('h2', 'screen-title', t('pause.title')));
    const menu = el('div', 'menu-col');
    menu.appendChild(btn(t('pause.resume'), () => this.app.resume(), 'btn primary big'));
    menu.appendChild(btn(t('pause.restart'), () => this.app.restartRun()));
    menu.appendChild(btn(t('pause.quit'), () => this.app.abandonRun()));
    s.appendChild(menu);
  }

  // ---------------- 升级三选一 ----------------

  showUpgrade(options: UpgradeOption[]): void {
    this.clear();
    const s = this.screen('upgrade-screen');
    s.appendChild(el('h2', 'upgrade-title', t('upgrade.title')));
    s.appendChild(el('div', 'upgrade-sub', t('upgrade.choose')));
    const row = el('div', 'upgrade-row');
    for (const opt of options) {
      row.appendChild(this.upgradeCard(opt));
    }
    s.appendChild(row);
    const skip = btn(t('upgrade.skip'), () => {
      this.app.chooseUpgrade({ kind: 'heal', amount: 0.15 });
    }, 'btn ghost');
    s.appendChild(skip);
  }

  private upgradeCard(opt: UpgradeOption): HTMLDivElement {
    const card = el('div', 'upgrade-card');
    let iconKey = 'pr_pulse';
    let name = '';
    let tag = '';
    let desc = '';
    let tagCls = 'tag';

    switch (opt.kind) {
      case 'newWeapon':
        iconKey = this.weaponIconKey(opt.id);
        name = t(`weapon.${opt.id}.name`);
        tag = t('upgrade.new');
        tagCls = 'tag new';
        desc = t(`weapon.${opt.id}.desc`);
        break;
      case 'weaponLevel': {
        iconKey = this.weaponIconKey(opt.id);
        const data = WEAPON_DATA[opt.id];
        name = t(`weapon.${opt.id}.name`);
        tag = t('upgrade.lv', { n: opt.toLevel });
        desc = opt.toLevel >= data.maxLevel ? t('upgrade.reachMax') : t(`weapon.${opt.id}.desc`);
        break;
      }
      case 'evolution':
        iconKey = this.weaponIconKey(opt.into);
        name = t(`weapon.${opt.into}.evoName`);
        tag = t('upgrade.evolution');
        tagCls = 'tag evo';
        desc = t(`weapon.${opt.into}.evoDesc`);
        break;
      case 'newPassive':
        iconKey = 'pick_core';
        name = t(`passive.${opt.id}.name`);
        tag = t('upgrade.new');
        tagCls = 'tag new';
        desc = t(`passive.${opt.id}.desc`);
        break;
      case 'passiveLevel':
        iconKey = 'pick_core';
        name = t(`passive.${opt.id}.name`);
        tag = t('upgrade.lv', { n: opt.toLevel });
        desc = t(`passive.${opt.id}.perLevel`);
        break;
      case 'heal':
        iconKey = 'pick_heal';
        name = t('upgrade.skip');
        tag = '';
        desc = '';
        break;
    }

    if (tag) card.appendChild(el('div', tagCls, tag));
    const ic = this.icon(iconKey, 64);
    ic.className = 'upgrade-icon';
    card.appendChild(ic);
    card.appendChild(el('div', 'upgrade-name', name));
    card.appendChild(el('div', 'upgrade-desc', desc));
    card.appendChild(btn('✦', () => this.app.chooseUpgrade(opt), 'btn pick'));
    card.addEventListener('click', () => this.app.chooseUpgrade(opt));
    return card;
  }

  // ---------------- 结算 ----------------

  showResults(r: RunResult): void {
    this.clear();
    const s = this.screen('results-screen');
    s.appendChild(el('h1', `results-title ${r.victory ? 'victory' : 'defeat'}`, r.victory ? t('results.victory') : t('results.defeat')));
    if (r.newRecord) s.appendChild(el('div', 'new-record', t('results.newRecord')));
    if (r.unlockToast) s.appendChild(el('div', 'unlock-toast', t('toast.unlockChar', { name: r.unlockToast })));

    const panel = el('div', 'results-panel');
    const rows: [string, string][] = [
      [t('results.time'), formatTime(r.time)],
      [t('results.kills'), String(r.kills)],
      [t('results.level'), String(r.level)],
      [t('results.damage'), String(r.damageDealt)],
      [t('meta.cores'), `+${r.cores} ◆`],
    ];
    for (const [k, v] of rows) {
      const rowEl = el('div', 'stat-row', `<span class="stat-k">${k}</span><span class="stat-v">${v}</span>`);
      panel.appendChild(rowEl);
    }
    s.appendChild(panel);

    const menu = el('div', 'menu-row');
    menu.appendChild(btn(t('results.again'), () => this.app.showCharacters(), 'btn primary big'));
    menu.appendChild(btn(t('results.menu'), () => this.app.showTitle()));
    s.appendChild(menu);
  }

  // ---------------- 设置 ----------------

  showSettings(): void {
    this.clear();
    const s = this.screen('settings-screen');
    s.appendChild(el('h2', 'screen-title', t('settings.title')));
    const panel = el('div', 'settings-panel');

    const slider = (label: string, value: number, onChange: (v: number) => void) => {
      const row = el('div', 'setting-row');
      row.appendChild(el('span', 'setting-label', label));
      const input = document.createElement('input');
      input.type = 'range';
      input.min = '0';
      input.max = '1';
      input.step = '0.05';
      input.value = String(value);
      input.addEventListener('input', () => onChange(Number(input.value)));
      row.appendChild(input);
      panel.appendChild(row);
    };

    slider(t('settings.sfx'), this.app.save.settings.sfxVolume, (v) => this.app.updateSettings((x) => { x.sfxVolume = v; }));
    slider(t('settings.music'), this.app.save.settings.musicVolume, (v) => this.app.updateSettings((x) => { x.musicVolume = v; }));
    slider(t('settings.shake'), this.app.save.settings.screenShake, (v) => this.app.updateSettings((x) => { x.screenShake = v; }));

    const dmgRow = el('div', 'setting-row');
    dmgRow.appendChild(el('span', 'setting-label', t('settings.dmgNum')));
    dmgRow.appendChild(btn(
      this.app.save.settings.showDamageNumbers ? t('common.on') : t('common.off'),
      () => {
        this.app.updateSettings((x) => { x.showDamageNumbers = !x.showDamageNumbers; });
        this.showSettings();
      },
      'btn small',
    ));
    panel.appendChild(dmgRow);

    const langRow = el('div', 'setting-row');
    langRow.appendChild(el('span', 'setting-label', t('settings.lang')));
    const langBtns = el('div', 'lang-btns');
    for (const l of ['zh', 'en'] as const) {
      const b = btn(l === 'zh' ? '中文' : 'English', () => {
        this.app.updateSettings((x) => { x.lang = l; });
        this.showSettings();
      }, `btn small ${this.app.save.settings.lang === l ? 'primary' : ''}`);
      langBtns.appendChild(b);
    }
    langRow.appendChild(langBtns);
    panel.appendChild(langRow);

    const resetRow = el('div', 'setting-row');
    resetRow.appendChild(btn(t('settings.reset'), () => {
      if (window.confirm(t('settings.resetConfirm'))) {
        this.app.resetSave();
        this.showTitle();
      }
    }, 'btn danger'));
    panel.appendChild(resetRow);

    s.appendChild(panel);
    s.appendChild(btn(t('settings.back'), () => this.app.showTitle(), 'btn big'));
  }

  // ---------------- 图鉴 ----------------

  showCodex(): void {
    this.clear();
    const s = this.screen('codex-screen');
    s.appendChild(el('h2', 'screen-title', t('codex.title')));

    const tabs = el('div', 'codex-tabs');
    const bestiaryPanel = el('div', 'codex-panel');
    const statsPanel = el('div', 'codex-panel hidden');

    const bestiaryBtn = btn(t('codex.bestiary'), () => {
      bestiaryPanel.classList.remove('hidden');
      statsPanel.classList.add('hidden');
      bestiaryBtn.classList.add('primary');
      statsBtn.classList.remove('primary');
    }, 'btn primary');
    const statsBtn = btn(t('codex.stats'), () => {
      statsPanel.classList.remove('hidden');
      bestiaryPanel.classList.add('hidden');
      statsBtn.classList.add('primary');
      bestiaryBtn.classList.remove('primary');
    }, 'btn');
    tabs.appendChild(bestiaryBtn);
    tabs.appendChild(statsBtn);
    s.appendChild(tabs);

    // 图鉴
    const grid = el('div', 'bestiary-grid');
    let seenCount = 0;
    for (const id of Object.keys(ENEMY_DEFS) as (keyof typeof ENEMY_DEFS)[]) {
      const def = ENEMY_DEFS[id];
      const count = this.app.save.meta.bestiary[id] ?? 0;
      const seen = count > 0;
      if (seen) seenCount++;
      const cell = el('div', `bestiary-cell ${seen ? '' : 'unknown'}`);
      cell.appendChild(this.icon(`enemy_${id}`, 44));
      cell.appendChild(el('div', 'bestiary-name', seen ? t(`enemy.${id}.name`) : t('codex.unknown')));
      cell.appendChild(el('div', 'bestiary-desc', seen ? t(`enemy.${id}.desc`) : t('codex.unknownDesc')));
      if (seen) cell.appendChild(el('div', 'bestiary-count', `×${count}`));
      if (def.tier !== 'normal') cell.classList.add(def.tier);
      grid.appendChild(cell);
    }
    bestiaryPanel.appendChild(el('div', 'codex-count', t('codex.encountered', { n: `${seenCount}/${Object.keys(ENEMY_DEFS).length}` })));
    bestiaryPanel.appendChild(grid);
    s.appendChild(bestiaryPanel);

    // 统计
    const m = this.app.save.meta;
    const stats = el('div', 'stats-list');
    const rows: [string, string][] = [
      [t('stat.kills'), String(m.lifetimeKills)],
      [t('stat.bestTime'), formatTime(m.bestTime)],
      [t('stat.victories'), String(m.victories)],
      [t('stat.runs'), String(m.runs)],
      [t('meta.cores'), `◆ ${m.cores}`],
    ];
    for (const [k, v] of rows) {
      stats.appendChild(el('div', 'stat-row', `<span class="stat-k">${k}</span><span class="stat-v">${v}</span>`));
    }
    statsPanel.appendChild(stats);
    s.appendChild(statsPanel);

    s.appendChild(btn(t('settings.back'), () => this.app.showTitle(), 'btn big'));
  }

  // ---------------- 星核强化 ----------------

  showMeta(): void {
    this.clear();
    const s = this.screen('meta-screen');
    s.appendChild(el('h2', 'screen-title', t('meta.title')));
    s.appendChild(el('div', 'meta-cores', `◆ ${t('meta.cores')}：${this.app.save.meta.cores}`));

    const grid = el('div', 'meta-grid');
    for (const node of META_NODES) {
      grid.appendChild(this.metaCard(node));
    }
    s.appendChild(grid);
    s.appendChild(btn(t('settings.back'), () => this.app.showTitle(), 'btn big'));
  }

  private metaCard(node: MetaUpgradeNode): HTMLDivElement {
    const rank = this.app.save.meta.upgrades[node.id] ?? 0;
    const maxed = rank >= node.maxRank;
    const card = el('div', `meta-card ${maxed ? 'maxed' : ''}`);
    card.appendChild(el('div', 'meta-name', t(`metaNode.${node.id}.name`)));
    card.appendChild(el('div', 'meta-desc', t(`metaNode.${node.id}.desc`)));
    const pips = el('div', 'meta-pips');
    for (let i = 0; i < node.maxRank; i++) {
      pips.appendChild(el('span', `pip ${i < rank ? 'on' : ''}`));
    }
    card.appendChild(pips);
    if (maxed) {
      card.appendChild(el('div', 'meta-state max', t('meta.maxed')));
    } else {
      const cost = node.costs[rank]!;
      const afford = this.app.save.meta.cores >= cost;
      card.appendChild(btn(
        t('meta.cost', { n: cost }),
        () => {
          if (this.metaBuy(node.id)) this.showMeta();
        },
        `btn ${afford ? 'primary' : 'ghost'}`,
      ));
    }
    return card;
  }

  metaBuy(nodeId: string): boolean {
    const node = META_NODES.find((n) => n.id === nodeId);
    if (!node) return false;
    const meta = this.app.save.meta;
    const rank = meta.upgrades[nodeId] ?? 0;
    if (rank >= node.maxRank) return false;
    const cost = node.costs[rank]!;
    if (meta.cores < cost) return false;
    meta.cores -= cost;
    meta.upgrades[nodeId] = rank + 1;
    persistSave(this.app.save);
    return true;
  }
}
