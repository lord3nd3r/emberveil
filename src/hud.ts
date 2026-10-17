/** Heads-up display, laid out per PLAN section 6: magic meter, item box, counters, LIFE hearts top-right, boss bar, toasts, banners. */
import Phaser from "phaser";
import { DIM, GOLD, GREEN, RED, WHITE } from "./cast";
import { TEX, view } from "./gfx";
import { drawDungeonMap, drawWorldMap, WORLD_TH, WORLD_TW } from "./mapview";
import { settings } from "./settings";
import { MAX_MAGIC, DISC_COST, type Sim } from "./sim/core";
import { ENEMIES } from "./sim/data";
import { TS } from "./tiles";
import { label, windowImage } from "./ui";

const HUD_SAFE_RIGHT = 31; // room for the sound / settings buttons

export class Hud {
  root: Phaser.GameObjects.Container;
  private bar = { frame: null as Phaser.GameObjects.Graphics | null, fill: null as Phaser.GameObjects.Graphics | null };
  private magicLabel: Phaser.GameObjects.Text;
  private box: Phaser.GameObjects.Image | null = null;
  private itemIcon: Phaser.GameObjects.Image;
  private itemKey: Phaser.GameObjects.Text;
  private cost: Phaser.GameObjects.Text;
  private counters: { icon: Phaser.GameObjects.Image; text: Phaser.GameObjects.Text }[] = [];
  private lifeLabel: Phaser.GameObjects.Text;
  private hearts: Phaser.GameObjects.Image[] = [];
  private mini: Phaser.GameObjects.Image;
  private miniFrame: Phaser.GameObjects.Image | null = null;
  private miniDot: Phaser.GameObjects.Rectangle;
  private areaLabel: Phaser.GameObjects.Text;
  private toastText: Phaser.GameObjects.Text;
  private toastQ: string[] = [];
  private toastT = 0;
  private banner: Phaser.GameObjects.Text;
  private bannerT = 0;
  private bossName: Phaser.GameObjects.Text;
  private bossG: Phaser.GameObjects.Graphics;
  private fade: Phaser.GameObjects.Rectangle;
  private deadText: Phaser.GameObjects.Text;
  private lastHearts = -1;
  private lastHp = -1;
  private miniX = 0;
  private miniY = 0;
  private lvlLabel!: Phaser.GameObjects.Text;
  private xpG!: Phaser.GameObjects.Graphics;
  private lastLvl = -1;
  private lvlPulse = 0;
  private clock = 0;

  constructor(private scene: Phaser.Scene, private sim: Sim) {
    drawWorldMap(scene, sim);
    this.root = scene.add.container(0, 0).setScrollFactor(0).setDepth(15000);
    this.bar.frame = scene.add.graphics();
    this.bar.fill = scene.add.graphics();
    this.magicLabel = label(scene, 0, 0, "MAGIC", GREEN).setScale(0.6);
    this.itemIcon = scene.add.image(0, 0, "icon_disc").setScale(1 / TEX).setVisible(false);
    this.itemKey = label(scene, 0, 0, "Q", DIM).setScale(0.62);
    this.cost = label(scene, 0, 0, "", GREEN).setScale(0.62);
    for (const ic of ["icon_glint", "icon_key", "icon_tonic"]) {
      const icon = scene.add.image(0, 0, ic).setScale(0.6 / TEX);
      const text = label(scene, 0, 0, "0", WHITE);
      this.counters.push({ icon, text });
    }
    this.lifeLabel = label(scene, 0, 0, "LIFE", RED).setScale(0.8);
    this.lvlLabel = label(scene, 0, 0, "LV 1", GOLD).setScale(0.66);
    this.xpG = scene.add.graphics();
    this.mini = scene.add.image(0, 0, "worldmap").setOrigin(0, 0);
    this.miniDot = scene.add.rectangle(0, 0, 2, 2, 0xffe060).setOrigin(0.5);
    this.areaLabel = label(scene, 0, 0, "", DIM).setScale(0.62);
    this.toastText = label(scene, 0, 0, "", GOLD).setOrigin(0.5, 0).setAlpha(0);
    this.banner = label(scene, 0, 0, "", WHITE).setOrigin(0.5).setScale(1.9).setAlpha(0);
    this.bossName = label(scene, 0, 0, "", WHITE).setOrigin(0.5, 0).setVisible(false);
    this.bossG = scene.add.graphics();
    this.deadText = label(scene, 0, 0, "Ren collapses...", WHITE).setOrigin(0.5).setScale(1.6).setAlpha(0);
    this.fade = scene.add.rectangle(0, 0, 10, 10, 0x06061a).setOrigin(0).setAlpha(0);
    this.root.add([this.bar.frame, this.bar.fill, this.magicLabel, this.itemIcon, this.itemKey, this.cost, ...this.counters.flatMap((c) => [c.icon, c.text]), this.lifeLabel, this.lvlLabel, this.xpG, this.mini, this.miniDot, this.areaLabel, this.bossG, this.bossName, this.toastText, this.banner, this.deadText, this.fade]);
    this.layout();
  }

  layout(): void {
    const s = this.scene;
    this.root.setPosition(view.ox, view.oy);
    this.box?.destroy();
    this.box = windowImage(s, 16, 6, 22, 22);
    this.root.add(this.box);
    this.root.sendToBack(this.box);
    this.itemIcon.setPosition(27, 17);
    this.itemKey.setPosition(33, 20.5);
    this.cost.setPosition(18, 20.5);
    this.magicLabel.setPosition(2, 49);
    const g = this.bar.frame!;
    g.clear();
    g.fillStyle(0x0a1020, 0.9); g.fillRoundedRect(5, 6, 8, 42, 3);
    g.lineStyle(1, 0xdce6ff, 0.8); g.strokeRoundedRect(5.5, 6.5, 7, 41, 3);
    this.counters.forEach((c, i) => { c.icon.setPosition(46, 12 + i * 10.5); c.text.setPosition(52, 7.5 + i * 10.5); });
    const rx = view.w - HUD_SAFE_RIGHT;
    this.lifeLabel.setPosition(rx - 100, 1);
    this.lvlLabel.setPosition(44, 37);
    this.miniFrame?.destroy();
    this.miniFrame = windowImage(s, rx - 66, 36, 66, 50);
    this.root.add(this.miniFrame);
    this.root.sendToBack(this.miniFrame);
    this.miniX = rx - 65; this.miniY = 37;
    this.mini.setPosition(rx - 65, 37);
    this.areaLabel.setPosition(rx - 64, 87);
    this.toastText.setPosition(view.w / 2, 30).setWordWrapWidth(Math.min(240, view.w - 120), true);
    this.banner.setPosition(view.w / 2, view.h * 0.3);
    this.bossName.setPosition(view.w / 2, 4);
    this.deadText.setPosition(view.w / 2, view.h / 2);
    this.fade.setSize(view.w + 4, view.h + 4).setPosition(-2, -2);
    this.lastHearts = -1;
  }

  toast(text: string): void { this.toastQ.push(text); }
  showBanner(name: string): void { this.banner.setText(name); this.bannerT = 2.6; }

  update(dt: number): void {
    const sim = this.sim, sv = sim.save;
    this.clock += dt;
    this.root.setVisible(true);
    // magic
    const m = sv.magic / MAX_MAGIC;
    const f = this.bar.fill!;
    f.clear();
    f.fillStyle(0x2ad060, 1); f.fillRoundedRect(6.5, 7.5 + 39 * (1 - m), 5, 39 * m, 2);
    f.fillStyle(0xa8ffc8, 0.5); f.fillRect(7, 8 + 39 * (1 - m), 1.2, Math.max(0, 38 * m));
    // item box
    const eq = sv.equipped;
    const EQI: Record<string, string> = { gale_disc: "icon_disc", spiral_boots: "icon_boots" };
    this.itemIcon.setVisible(!!EQI[eq]);
    if (EQI[eq]) this.itemIcon.setTexture(EQI[eq]);
    this.cost.setText(eq === "gale_disc" ? String(DISC_COST) : "");
    this.itemKey.setVisible(eq !== "");
    // counters
    const vals = [String(sv.glints), String(sv.keys), String(sv.inv.tonic ?? 0)];
    this.counters.forEach((c, i) => { c.text.setText(vals[i]); c.icon.setAlpha(i === 1 && sim.area.kind === "world" && sv.keys === 0 ? 0.4 : 1); });
    this.counters[2].text.setText(`${vals[2]}  H`);
    // level + XP bar
    const lvl = sim.level, xp = sim.xpProgress();
    if (this.lastLvl >= 0 && lvl > this.lastLvl) this.lvlPulse = 1.2;
    this.lastLvl = lvl;
    this.lvlPulse = Math.max(0, this.lvlPulse - dt);
    this.lvlLabel.setText(`LV ${lvl}`).setScale(0.66 * (1 + Math.min(1, this.lvlPulse) * 0.3 * (settings.reduceMotion ? 0 : 1))).setColor(this.lvlPulse > 0 ? "#fff4c0" : GOLD);
    const xg = this.xpG;
    xg.clear();
    xg.fillStyle(0x0a1020, 0.9); xg.fillRoundedRect(44, 47, 42, 4, 1.5);
    const frac = xp.need ? xp.cur / xp.need : 1;
    xg.fillStyle(this.lvlPulse > 0 ? 0xfff4c0 : 0xf2c85a, 1); xg.fillRoundedRect(44.5, 47.5, 41 * frac, 3, 1);
    // hearts
    const rx = view.w - HUD_SAFE_RIGHT;
    const nHearts = sim.maxHp / 2;
    if (nHearts !== this.lastHearts) {
      this.hearts.forEach((h) => h.destroy());
      this.hearts = [];
      for (let i = 0; i < nHearts; i++) {
        const h = this.scene.add.image(rx - 100 + (i % 10) * 10 + 5, 17 + Math.floor(i / 10) * 11, "heart_full").setScale(1 / TEX);
        this.root.add(h);
        this.hearts.push(h);
      }
      this.lastHearts = nHearts;
      this.lastHp = -1;
    }
    if (sim.hp !== this.lastHp) {
      this.lastHp = sim.hp;
      this.hearts.forEach((h, i) => { const v = sim.hp - i * 2; h.setTexture(v >= 2 ? "heart_full" : v === 1 ? "heart_half" : "heart_empty"); });
    }
    const low = sim.hp <= 2;
    this.hearts.forEach((h, i) => h.setScale((low && sim.hp - i * 2 > 0 ? 1 + Math.sin(this.clock * 9) * 0.08 : 1) / TEX));
    // minimap
    const compact = document.body.classList.contains("touch-ui") && window.innerHeight < 520; // phone: the on-screen buttons need that corner
    const showMini = settings.minimap && sim.mode !== "shop" && !compact;
    this.mini.setVisible(showMini); this.miniDot.setVisible(showMini); this.miniFrame?.setVisible(showMini); this.areaLabel.setVisible(showMini);
    if (showMini) this.drawMini();
    // boss bar
    this.bossG.clear();
    const boss = sim.enemies.find((e) => e.alive && e.def.boss && sim.bossActive === e.kind);
    this.bossName.setVisible(!!boss);
    if (boss) {
      const w = Math.min(140, view.w - 150), x = view.w / 2 - w / 2;
      this.bossName.setText(boss.def.name);
      this.bossG.fillStyle(0x0a0a20, 0.9); this.bossG.fillRoundedRect(x - 1, 14, w + 2, 6, 2);
      this.bossG.fillStyle(0xe8384a, 1); this.bossG.fillRoundedRect(x, 15, w * Math.max(0, boss.hp / ENEMIES[boss.kind].hp), 4, 1.5);
    }
    // toast
    if (this.toastT > 0) {
      this.toastT -= dt;
      this.toastText.setAlpha(Math.min(1, this.toastT * 3));
    } else if (this.toastQ.length) {
      this.toastText.setText(this.toastQ.shift()!);
      this.toastT = 2.4;
    }
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      this.banner.setAlpha(Math.min(1, this.bannerT * 2, (2.6 - this.bannerT) * 3));
    } else this.banner.setAlpha(0);
    // fade + death
    this.fade.setAlpha(sim.fade);
    this.deadText.setAlpha(sim.mode === "dead" ? Math.min(1, sim.dead / 0.8) * (sim.fade > 0.95 ? 0.6 : 1) : 0);
  }

  private drawMini(): void {
    const sim = this.sim;
    if (sim.area.kind === "world") {
      // a 128x96-tile window of the world map centred on the hero, shown at half size
      const key = drawWorldMap(this.scene, sim);
      const px = sim.p.x / TS, py = sim.p.y / TS;
      const cx = Math.max(0, Math.min(WORLD_TW - 128, Math.round(px - 64))), cy = Math.max(0, Math.min(WORLD_TH - 96, Math.round(py - 48)));
      this.mini.setTexture(key).setCrop(cx, cy, 128, 96).setScale(0.5);
      this.mini.setPosition(this.miniX - cx * 0.5, this.miniY - cy * 0.5);
      this.miniDot.setPosition(this.miniX + (px - cx) * 0.5, this.miniY + (py - cy) * 0.5);
      this.areaLabel.setText(sim.chunkName(sim.p.x, sim.p.y));
    } else if (sim.area.room!.kind === "dungeon") {
      const d = drawDungeonMap(this.scene, sim, "dunmini", 16);
      this.mini.setTexture(d.key).setCrop().setScale(64 / d.w, 48 / d.h).setPosition(this.miniX, this.miniY);
      const r = sim.area.room!;
      const gx = r.grid?.[0] ?? 0, gy = r.grid?.[1] ?? 0;
      this.miniDot.setPosition(this.mini.x + ((gx * d.cell + 1 + (sim.p.x / TS / r.w) * d.cell) * 64) / d.w, this.mini.y + ((gy * d.cell + 1 + (sim.p.y / TS / r.h) * d.cell) * 48) / d.h);
      this.areaLabel.setText(r.name);
    } else {
      this.mini.setVisible(false);
      this.miniDot.setVisible(false);
      this.miniFrame?.setVisible(false);
      this.areaLabel.setText(sim.area.room!.name);
    }
    this.miniDot.setAlpha(0.55 + 0.45 * Math.sin(this.clock * 8));
  }
}
