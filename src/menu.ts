/** Pause menu: Map (world map with fog / dungeon plan), Quests, Items, Settings. Keyboard, mouse and touch. */
import Phaser from "phaser";
import { DIM, GOLD, GREEN, WHITE } from "./cast";
import { TEX, view } from "./gfx";
import type { Ui } from "./input";
import { chunkLabelCells, drawDungeonMap, drawWorldMap, WORLD_TH, WORLD_TW } from "./mapview";
import { settings } from "./settings";
import type { Sim } from "./sim/core";
import { DUNGEONS, EQUIPPABLE, ITEMS, dungeonOf, QUEST_DEFS, atkMul, defReduce } from "./sim/data";
import { announce, label, windowImage, zone } from "./ui";

const TABS = ["Map", "Quests", "Items", "Settings"] as const;
type Tab = (typeof TABS)[number];
const ICON: Record<string, string> = { keeper_blade: "icon_blade", wicker_buckler: "icon_buckler", gale_disc: "icon_disc", dune_gauntlet: "icon_gauntlet", spiral_boots: "icon_boots", archivist_folio: "icon_folio", cistern_map: "icon_map", cistern_compass: "icon_compass", big_key: "icon_bigkey", moss_map: "icon_map", moss_compass: "icon_compass", moss_key: "icon_bigkey", spire_map: "icon_map", spire_compass: "icon_compass", spire_key: "icon_bigkey", ember_bow: "icon_bow", brass_lantern: "icon_lantern", tonic: "icon_tonic" };

export class PauseMenu {
  open = false;
  private tab: Tab = "Map";
  private root: Phaser.GameObjects.Container;
  private dyn: Phaser.GameObjects.GameObject[] = [];
  private sel = 0;
  private clock = 0;
  onSettings: () => void = () => undefined;
  onClose: () => void = () => undefined;

  constructor(private scene: Phaser.Scene, private sim: Sim) {
    this.root = scene.add.container(0, 0).setScrollFactor(0).setDepth(18000).setVisible(false);
  }

  show(tab: Tab = "Map"): void {
    this.open = true;
    this.tab = tab;
    this.sel = 0;
    this.root.setVisible(true);
    this.build();
    announce(`Menu, ${tab} tab`);
  }
  hide(): void { this.open = false; this.root.setVisible(false); this.clear(); this.onClose(); }
  toggle(tab: Tab): void { if (this.open && this.tab === tab) this.hide(); else this.show(tab); }
  layout(): void { if (this.open) this.build(); }

  private clear(): void { this.dyn.forEach((o) => o.destroy()); this.dyn = []; }
  private add<T extends Phaser.GameObjects.GameObject>(o: T): T { this.root.add(o); this.dyn.push(o); return o; }

  private setTab(t: Tab): void {
    if (t === "Settings") { this.onSettings(); return; }
    this.tab = t; this.sel = 0; this.build(); announce(`${t} tab`);
  }

  handle(ui: Ui): void {
    this.clock += 1 / 60;
    if (ui.menu || ui.cancel) { this.hide(); return; }
    if (ui.map) { this.toggle("Map"); return; }
    const i = TABS.indexOf(this.tab);
    if (ui.left && (this.tab !== "Items" || this.sel % 3 === 0)) this.setTab(TABS[(i + TABS.length - 1) % TABS.length]);
    else if (ui.right && (this.tab !== "Items" || this.sel % 3 === 2 || this.sel >= this.itemList().length - 1)) this.setTab(TABS[(i + 1) % TABS.length]);
    if (this.tab === "Items") {
      const n = this.itemList().length;
      if (ui.left && this.sel % 3 > 0) { this.sel--; this.build(); }
      if (ui.right && this.sel % 3 < 2 && this.sel < n - 1) { this.sel++; this.build(); }
      if (ui.up && this.sel >= 3) { this.sel -= 3; this.build(); }
      if (ui.down && this.sel + 3 < n) { this.sel += 3; this.build(); }
      if (ui.confirm) this.activate();
    }
    if (ui.tonic && this.sim.useTonic()) this.build();
  }

  private itemList(): string[] {
    const sim = this.sim;
    const out = ["keeper_blade", "wicker_buckler", "gale_disc", "spiral_boots", "dune_gauntlet", "archivist_folio", "cistern_map", "cistern_compass", "big_key", "ember_bow", "moss_map", "moss_compass", "moss_key", "spire_map", "spire_compass", "spire_key", "brass_lantern"].filter((id) => sim.hasItem(id));
    if ((sim.save.inv.tonic ?? 0) > 0) out.push("tonic");
    return out;
  }
  private activate(): void {
    const id = this.itemList()[this.sel];
    if (id === "tonic") { if (!this.sim.useTonic()) this.sim.toast("Your hearts are already full."); }
    else if (EQUIPPABLE.includes(id)) this.sim.save.equipped = this.sim.save.equipped === id ? "" : id;
    this.build();
  }

  private build(): void {
    this.clear();
    const s = this.scene;
    this.root.setPosition(view.ox, view.oy);
    const w = Math.min(view.w - 12, 372), h = Math.min(view.h - 12, 214);
    const x = (view.w - w) / 2, y = (view.h - h) / 2;
    const dim = this.add(s.add.rectangle(0, 0, view.w, view.h, 0x04061a, 0.62).setOrigin(0));
    dim.setInteractive();
    this.add(windowImage(s, x, y, w, h));
    // tabs
    let tx = x + 8;
    TABS.forEach((t) => {
      const on = t === this.tab;
      const txt = this.add(label(s, tx, y + 5, t, on ? GOLD : DIM));
      if (on) this.add(s.add.rectangle(tx, y + 16, txt.width, 1, 0xf2c85a).setOrigin(0));
      this.add(zone(s, tx - 2, y + 2, txt.width + 4, 16, () => undefined, () => this.setTab(t), true));
      tx += txt.width + 14;
    });
    this.add(label(s, x + w - 8, y + h - 9, "Esc: close   ◀ ▶: switch tab", DIM).setOrigin(1, 1).setScale(0.66));
    const cx = x + 8, cy = y + 24, cw = w - 16, ch = h - 30;
    if (this.tab === "Map") this.buildMap(cx, cy, cw, ch);
    else if (this.tab === "Quests") this.buildQuests(cx, cy, cw, ch);
    else if (this.tab === "Items") this.buildItems(cx, cy, cw, ch);
  }

  private buildMap(cx: number, cy: number, cw: number, ch: number): void {
    const s = this.scene, sim = this.sim;
    if (sim.area.kind === "room" && sim.area.room!.kind === "dungeon") {
      const d = drawDungeonMap(s, sim, "dunmap", 24);
      const k = Math.min((cw * 0.55) / d.w, ch / d.h);
      const img = this.add(s.add.image(cx, cy + 2, d.key).setOrigin(0).setScale(k));
      const r = sim.area.room!;
      const gx = r.grid?.[0] ?? 0, gy = r.grid?.[1] ?? 0;
      const dot = this.add(s.add.rectangle(img.x + (gx * d.cell + 1 + (sim.p.x / 16 / r.w) * d.cell) * k, img.y + (gy * d.cell + 1 + (sim.p.y / 16 / r.h) * d.cell) * k, 3, 3, 0xff5050));
      dot.setAlpha(0.6 + 0.4 * Math.sin(this.clock * 8));
      const tx = cx + d.w * k + 12;
      const dun = dungeonOf(sim.area.id) ?? DUNGEONS[0];
      const fl = r.floor ?? 0;
      this.add(label(s, tx, cy, `${dun.name} - ${dun.floors[fl] ?? "Floor " + (fl + 1)}`, GOLD));
      const lines = [`You are in: ${r.name}`, sim.hasItem(dun.map) ? "Map: every room on this floor shown" : "Find the map to reveal every room", sim.hasItem(dun.compass) ? "Compass: chests (gold) and the boss (red)" : "Find the Compass to mark chests and the boss", `Small keys: ${sim.save.keys}    Boss key: ${sim.hasItem(dun.key) ? "yes" : "no"}`];
      this.add(label(s, tx, cy + 12, lines.join("\n"), WHITE, cw - (tx - cx) - 4).setScale(0.82));
      return;
    }
    const key = drawWorldMap(s, sim, "worldmap");
    const k = Math.min(cw / WORLD_TW, ch / WORLD_TH) * 0.96;
    const mx = cx + (cw - WORLD_TW * k) / 2, my = cy + (ch - WORLD_TH * k) / 2;
    this.add(s.add.rectangle(mx - 1, my - 1, WORLD_TW * k + 2, WORLD_TH * k + 2, 0xdce6ff, 0.8).setOrigin(0));
    this.add(s.add.image(mx, my, key).setOrigin(0).setScale(k));
    for (const l of chunkLabelCells(sim)) this.add(label(s, mx + l.x * k, my + l.y * k, l.name.replace(/ /g, "\n"), WHITE).setOrigin(0.5).setScale(0.5).setAlpha(0.9));
    if (sim.area.kind === "world") {
      const dot = this.add(s.add.rectangle(mx + (sim.p.x / 16) * k, my + (sim.p.y / 16) * k, 3.4, 3.4, 0xff4a3a));
      dot.setStrokeStyle(0.8, 0xffffff);
      dot.setAlpha(0.6 + 0.4 * Math.sin(this.clock * 8));
    } else this.add(label(s, mx + 3, my + 3, `You are inside: ${sim.area.room!.name}`, GOLD).setScale(0.78));
    this.add(label(s, mx + WORLD_TW * k - 3, my + WORLD_TH * k - 3, "Aurelane (fog hides unexplored ground)", DIM).setOrigin(1, 1).setScale(0.62));
  }

  private buildQuests(cx: number, cy: number, cw: number, ch: number): void {
    const s = this.scene, sim = this.sim;
    let y = cy + 2;
    const shown = QUEST_DEFS.filter((q) => sim.quest(q.id) > 0);
    if (!shown.length) this.add(label(s, cx, y, "No quests yet. Talk to people in Emberfen.", DIM));
    for (const q of shown) {
      const st = sim.quest(q.id);
      const done = st >= q.stages.length - (q.main ? 1 : 0) && (q.main ? st >= 4 : st >= 3);
      this.add(label(s, cx, y, `${done ? "✔ " : "◆ "}${q.name}${q.main ? "   (main)" : ""}`, done ? GREEN : GOLD));
      const t = this.add(label(s, cx + 6, y + 11, q.stages[Math.min(st, q.stages.length) - 1] ?? "", WHITE, cw - 12).setScale(0.82));
      y += 15 + t.height * 0.82;
      if (y > cy + ch - 10) break;
    }
  }

  private buildItems(cx: number, cy: number, cw: number, ch: number): void {
    const s = this.scene, sim = this.sim;
    const list = this.itemList();
    const colW = 112;
    list.forEach((id, i) => {
      const gx = cx + (i % 3) * colW, gy = cy + 2 + Math.floor(i / 3) * 24;
      const on = i === this.sel;
      this.add(windowImage(s, gx, gy, colW - 6, 20));
      if (on) this.add(s.add.rectangle(gx + 1, gy + 1, colW - 8, 18, 0xf2c85a, 0.18).setOrigin(0));
      this.add(s.add.image(gx + 11, gy + 10, ICON[id] ?? "icon_key").setScale(1 / TEX));
      const nm = id === "tonic" ? `Ember Tonic x${sim.save.inv.tonic ?? 0}` : ITEMS[id]?.name ?? id;
      this.add(label(s, gx + 22, gy + 5, nm + (sim.save.equipped === id ? "  ★" : ""), on ? GOLD : WHITE).setScale(0.78));
      this.add(zone(s, gx, gy, colW - 6, 20, () => { if (this.sel !== i) { this.sel = i; this.build(); } }, () => { this.sel = i; this.activate(); }, true));
    });
    if (!list.length) this.add(label(s, cx, cy + 4, "You are not carrying anything yet.", DIM));
    const sv = sim.save;
    const sel = list[this.sel];
    const desc = sel ? ITEMS[sel]?.desc ?? "" : "";
    const hint = sel && EQUIPPABLE.includes(sel) ? "  [Enter] equip" : sel === "tonic" ? "  [Enter] drink" : "";
    this.add(label(s, cx, cy + ch - 46, `${desc}${hint}`, WHITE, cw).setScale(0.82));
    const xp = sim.xpProgress(), g = this.add(s.add.graphics());
    this.add(label(s, cx, cy + ch - 33, `Level ${sim.level}${xp.need ? `   XP ${xp.cur}/${xp.need}` : "   (max)"}   Sword +${Math.round((atkMul(sim.level) - 1) * 100)}%   Guard -${defReduce(sim.level, 4)}`, GOLD).setScale(0.8));
    (g as unknown as Phaser.GameObjects.Graphics).fillStyle(0x0a1020, 0.9).fillRoundedRect(cx + 150, cy + ch - 31, 90, 5, 2);
    (g as unknown as Phaser.GameObjects.Graphics).fillStyle(0xf2c85a, 1).fillRoundedRect(cx + 150.5, cy + ch - 30.5, 89 * (xp.need ? xp.cur / xp.need : 1), 4, 1.5);
    this.add(label(s, cx, cy + ch - 16, `Hearts ${sim.maxHp / 2}   Shards ${sv.pieces}/4   Glints ${sv.glints}   Small keys ${sv.keys}   Magic ${Math.round(sv.magic)}/32`, DIM).setScale(0.8));
    void settings;
  }
}
