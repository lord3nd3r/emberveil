/** The playable scene. Reads the Phaser-free Sim every frame and draws it: chunk streaming, sprites, labels, HUD, menus. */
import Phaser from "phaser";
import { chunkCanvas } from "../art";
import { AQUA, DIM, EMBER, GOLD, RED, WHITE } from "../cast";
import { DialogueBox } from "../dialog";
import { aim, onViewChange, setupCamera, view, TEX, CHUNK_TEX } from "../gfx";
import { Hud } from "../hud";
import { GameInput } from "../input";
import { PauseMenu } from "../menu";
import { persist } from "../save";
import { sfx, TRACKS, type TrackId } from "../audio";
import { settings } from "../settings";
import { Sim, dirAngle } from "../sim/core";
import { ALLIES, NPCS, ITEMS, itemName } from "../sim/data";
import type { WorldData } from "../sim/maps";
import { NO_INPUT, type Dir, type Ev, type Input, type SaveV2 } from "../sim/types";
import { doorTexture, SPR } from "../sprites";
import { CH, CW, TS, T } from "../tiles";
import { label, windowImage, zone } from "../ui";

const FOOT_ORIGIN: Record<string, [number, number]> = { marshal: [0.5, 38 / 40], sluicejaw: [0.5, 50 / 56], rootknight: [0.5, 38 / 40], barkwarden: [0.5, 50 / 56], cloudmarshal: [0.5, 38 / 40], stormfinch: [0.5, 50 / 56], vael: [0.5, 38 / 40] };
const ITEM_ICON: Record<string, string> = { keeper_blade: "icon_blade", wicker_buckler: "icon_buckler", gale_disc: "icon_disc", cistern_map: "icon_map", cistern_compass: "icon_compass", big_key: "icon_bigkey", moss_map: "icon_map", moss_compass: "icon_compass", moss_key: "icon_bigkey", spire_map: "icon_map", spire_compass: "icon_compass", spire_key: "icon_bigkey", ember_bow: "icon_bow", brass_lantern: "icon_lantern", dune_gauntlet: "icon_gauntlet", spiral_boots: "icon_boots", archivist_folio: "icon_folio", small_key: "icon_key", tonic: "icon_tonic", heart_piece: "icon_shard", heart_container: "pk_heart", soup: "icon_tonic", mote: "icon_tonic", stew: "icon_tonic", elixir: "icon_tonic", parcel: "icon_folio", heron_feather: "icon_folio", waterskin: "icon_tonic", old_medal: "icon_shard", glass_pearl: "icon_shard", bell_rope: "icon_folio", kit_lamp: "icon_lantern" };
const COLOR_NUM = (s: string | undefined): number => (s ? parseInt(s.replace("#", ""), 16) : 0xffffff);

interface Spr { img: Phaser.GameObjects.Image; tag: string }

export class GameScene extends Phaser.Scene {
  sim!: Sim;
  private inp!: GameInput;
  private hud!: Hud;
  private dlg!: DialogueBox;
  private menu!: PauseMenu;
  private ready = false;
  private acc = 0;
  private chunkImgs = new Map<string, Phaser.GameObjects.Image>();
  private chunkSlot = new Map<string, Phaser.Textures.CanvasTexture>();
  private freeSlots: Phaser.Textures.CanvasTexture[] = [];
  private poolN = 0;
  private waterG!: Phaser.GameObjects.Graphics;
  private waterT = 0;
  private waterLast = 0;
  private waterOn = false;
  private darkCv: Phaser.Textures.CanvasTexture | null = null;
  private darkImg2: Phaser.GameObjects.Image | null = null;
  private torches: { x: number; y: number }[] = [];
  private lightsFor = "";
  private aimX = 0;
  private aimY = 0;
  fxCount = 0; // live level-up effect objects (read by the browser test)
  private roomImg: Phaser.GameObjects.Image | null = null;
  private roomId = "";
  private sprites = new Map<string, Spr>();
  private labels = new Map<string, Phaser.GameObjects.Text>();
  private fx!: Phaser.GameObjects.Graphics;
  private dark!: Phaser.GameObjects.Graphics;
  private darkImg!: Phaser.GameObjects.Image;
  private prompt!: Phaser.GameObjects.Text;
  private player!: Phaser.GameObjects.Image;
  private heldIcon!: Phaser.GameObjects.Image;
  private cam = { x: 0, y: 0, snap: true };
  private shake = 0;
  private dlgOpen: object | null = null;
  private dlgLine = -1;
  private shopUi: Phaser.GameObjects.Container | null = null;
  private shopSel = 0;
  private lastTrack: string | null = "";
  private walkT = 0;
  private lastTab: "Map" | "Items" = "Items";

  constructor() { super("game"); }

  create(data: { save?: SaveV2 | null }): void {
    this.ready = false;
    this.sprites.clear(); this.labels.clear(); this.chunkImgs.clear(); this.chunkSlot.clear(); this.freeSlots = []; this.poolN = 0; this.roomImg = null; this.roomId = ""; this.shopUi = null;
    const world = this.registry.get("world") as WorldData;
    this.sim = new Sim(world, data.save ?? undefined);
    this.sim.onSave = (s) => persist(s);
    setupCamera(this);
    this.cameras.main.setBackgroundColor("#06061a");
    onViewChange(this, () => this.relayout());
    this.inp = new GameInput(this);
    this.fx = this.add.graphics().setDepth(9000);
    this.waterG = this.add.graphics().setDepth(-9);
    this.dark = this.add.graphics().setDepth(12000);
    this.glowG = null; this.waterOn = false; this.darkCv = null; this.darkImg2 = null; this.torches = []; this.lightsFor = ""; this.fxCount = 0;
    this.darkImg = this.add.image(0, 0, "darkhole").setDepth(12000).setVisible(false);
    this.prompt = label(this, 0, 0, "", WHITE).setOrigin(0.5, 1).setDepth(14000).setScale(0.8).setVisible(false);
    this.player = this.add.image(0, 0, "ren_down_0").setScale(1 / TEX).setOrigin(0.5, 28 / SPR);
    this.heldIcon = this.add.image(0, 0, "icon_disc").setScale(1 / TEX).setVisible(false).setDepth(9500);
    this.hud = new Hud(this, this.sim);
    this.dlg = new DialogueBox(this);
    this.menu = new PauseMenu(this, this.sim);
    this.menu.onSettings = () => { this.menu.hide(); (document.querySelector('#hudbtns button[aria-haspopup="dialog"]') as HTMLButtonElement | null)?.click(); };
    this.menu.onClose = () => this.inp.flush();
    const flush = () => { if (this.ready && document.visibilityState !== "visible") this.sim.commit(); };
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("pagehide", flush);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { document.removeEventListener("visibilitychange", flush); window.removeEventListener("pagehide", flush); });
    (window as unknown as { __ev: unknown }).__ev = this.debugApi();
    void this.begin();
  }

  private async begin(): Promise<void> {
    const sv = this.sim.save;
    // the whole region's tile data is tiny; entities and textures still stream by 3x3 window
    await Promise.all(Array.from({ length: this.sim.data.meta.cols * this.sim.data.meta.rows }, (_, i) => this.sim.data.loadChunk(i % this.sim.data.meta.cols, Math.floor(i / this.sim.data.meta.cols))));
    await Promise.all(this.sim.data.roomIds.map((id) => this.sim.data.loadRoom(id)));
    await this.sim.enterArea(sv.area, sv.x, sv.y, sv.facing);
    await this.sim.settle();
    this.sim.mode = "play";
    this.ready = true;
    this.sim.commit();
  }

  private relayout(): void {
    this.hud?.layout();
    this.dlg?.layout();
    this.menu?.layout();
    if (this.shopUi) this.buildShop();
    this.cam.snap = true;
  }

  /** Test / screenshot helpers (also useful from the dev console). */
  private debugApi() {
    const self = this;
    return {
      get sim() { return self.sim; },
      get ready() { return self.ready; },
      async warp(area: string, tx: number, ty: number, dir: Dir = "down") { await self.sim.enterArea(area, tx, ty, dir); await self.sim.settle(); self.sim.mode = "play"; self.sim.fade = 0; self.cam.snap = true; },
      give(id: string) { self.sim.give(id); },
      patch(fn: (s: Sim) => void) { fn(self.sim); },
      openMenu(tab: "Map" | "Quests" | "Items") { self.menu.show(tab); },
      closeMenu() { self.menu.hide(); },
      get fxCount() { return self.fxCount; },
      /** Fires the level-up effect for any entity at a world position (heroes, allies, companions). */
      levelUpFx(x: number, y: number, lvl: number, who = "ally") { self.levelUpFx(x, y, lvl, who); },
    };
  }

  /* ---------------------------------------------------------------- frame */
  update(_t: number, deltaMs: number): void {
    if (!this.ready) return;
    const sim = this.sim;
    const dt = Math.min(deltaMs / 1000, 0.1);

    if (this.menu.open) {
      this.menu.handle(this.inp.ui());
    } else if (sim.mode === "ending") {
      this.updateEnding(dt, this.inp.ui().confirm);
    } else if (sim.mode === "dialog") {
      const ui = this.inp.ui();
      this.updateDialog(ui.confirm);
      sim.step(dt, NO_INPUT);
    } else if (sim.mode === "shop") {
      this.updateShop(this.inp.ui());
      sim.step(dt, NO_INPUT);
    } else {
      const p = sim.p;
      const input = sim.mode === "play" ? this.inp.poll(p.x, p.y - 7) : NO_INPUT;
      const ui = this.inp.ui();
      if (sim.mode === "play") {
        if (ui.menu) { this.openMenu(this.lastTab); }
        else if (ui.map) { this.lastTab = "Map"; this.openMenu("Map"); }
        else if (ui.tonic) sim.useTonic();
        else if (ui.cycle) sim.cycleItem();
      }
      if (!this.menu.open) {
        this.acc += dt;
        let first = true;
        let n = 0;
        while (this.acc >= 1 / 60 && n++ < 6) {
          this.acc -= 1 / 60;
          const inp: Input = first ? input : { ...input, attack: false, dodge: false, item: false, interact: false };
          sim.step(1 / 60, inp);
          first = false;
        }
        if (n >= 6) this.acc = 0;
      }
    }
    if (sim.mode !== "dialog" && this.dlg.active) { this.dlg.close(); this.dlgOpen = null; }
    if (sim.mode !== "shop" && this.shopUi) { this.shopUi.destroy(); this.shopUi = null; }
    if (sim.mode === "shop" && !this.shopUi) { this.shopSel = 0; this.buildShop(); }

    this.drainEvents(dt);
    this.syncWorld();
    this.syncEntities(dt);
    this.hud.update(dt);
    this.dlg.update(dt);
  }

  private openMenu(tab: "Map" | "Items" | "Quests"): void {
    this.sim.commit();
    this.menu.show(tab === "Quests" ? "Quests" : tab);
    if (tab !== "Quests") this.lastTab = tab;
  }

  /* ---------------------------------------------------------------- dialog + shop */
  private updateDialog(confirm: boolean): void {
    const d = this.sim.dialog;
    if (!d) return;
    if (this.dlgOpen !== d || this.dlgLine !== d.i) {
      this.dlgOpen = d; this.dlgLine = d.i;
      this.dlg.open(d.who, d.lines[d.i] ?? "");
      return;
    }
    if (confirm && this.dlg.advance()) {
      this.sim.dialogNext();
      this.dlgOpen = null;
      if (!this.sim.dialog) this.dlg.close();
    }
  }

  private buildShop(): void {
    this.shopUi?.destroy();
    const shopRows = this.sim.shopRows(), w = Math.min(view.w - 16, 250), rows = shopRows.length, h = 34 + rows * 18;
    const x = (view.w - w) / 2, y = Math.max(8, (view.h - h) / 2 - 20);
    const c = this.add.container(view.ox, view.oy).setScrollFactor(0).setDepth(18500);
    c.add(windowImage(this, x, y, w, h));
    c.add(label(this, x + 8, y + 5, "Tamsin's Lamp Shop", GOLD));
    c.add(label(this, x + w - 8, y + 5, `${this.sim.save.glints} glints`, AQUA).setOrigin(1, 0));
    shopRows.forEach((row, i) => {
      const ry = y + 20 + i * 18, on = i === this.shopSel;
      if (on) c.add(this.add.rectangle(x + 4, ry - 1, w - 8, 16, 0xf2c85a, 0.2).setOrigin(0));
      c.add(this.add.image(x + 14, ry + 7, ITEM_ICON[row.item] ?? "icon_key").setScale(0.9 / TEX));
      c.add(label(this, x + 26, ry + 1, itemName(row.item), on ? GOLD : WHITE));
      c.add(label(this, x + w - 10, ry + 1, `${row.price}`, this.sim.save.glints >= row.price ? AQUA : RED).setOrigin(1, 0));
      c.add(zone(this, x + 4, ry - 1, w - 8, 16, () => { if (this.shopSel !== i) { this.shopSel = i; this.buildShop(); } }, () => { this.shopSel = i; this.sim.shopBuy(row.id); this.buildShop(); }, true));
    });
    c.add(label(this, x + 8, y + h - 12, `${ITEMS[shopRows[this.shopSel]?.item]?.desc ?? ""}`, DIM, w - 16).setScale(0.7));
    c.add(label(this, x + w - 8, y + h - 12, "Enter: buy   Esc: leave", DIM).setOrigin(1, 0).setScale(0.7));
    this.shopUi = c;
  }

  private updateShop(ui: ReturnType<GameInput["ui"]>): void {
    if (!this.shopUi) return;
    if (ui.up) { this.shopSel = (this.shopSel + this.sim.shopRows().length - 1) % this.sim.shopRows().length; this.sim.sfx("select"); this.buildShop(); }
    if (ui.down) { this.shopSel = (this.shopSel + 1) % this.sim.shopRows().length; this.sim.sfx("select"); this.buildShop(); }
    if (ui.confirm) { this.sim.shopBuy(this.sim.shopRows()[this.shopSel].id); this.buildShop(); }
    if (ui.cancel || ui.menu) { this.sim.closeShop(); this.sim.commit(); }
  }

  /* ---------------------------------------------------------------- events */
  private drainEvents(_dt: number): void {
    const evs = this.sim.events.splice(0);
    for (const e of evs) this.onEvent(e);
  }

  private onEvent(e: Ev): void {
    switch (e.t) {
      case "sfx": sfx.play(e.name); break;
      case "toast": this.hud.toast(e.text); break;
      case "music": {
        const t = e.track && (TRACKS as string[]).includes(e.track) ? (e.track as TrackId) : null;
        if (t !== this.lastTrack) { this.lastTrack = t; sfx.setTheme(t); }
        break;
      }
      case "area": this.hud.showBanner(e.name); this.cam.snap = true; break;
      case "shake": if (!settings.reduceShake) this.shake = Math.max(this.shake, e.amt); break;
      case "flash": if (!settings.reduceFlash) this.cameras.main.flash(220, 255, 255, 255, true); break;
      case "spark": this.burst(e.x, e.y, COLOR_NUM(e.color), e.n ?? 4); break;
      case "dmgtext": this.floatText(e.x, e.y, e.text); break;
      case "levelup": this.levelUpFx(e.x, e.y, e.lvl, e.who); break;
      case "ending": this.showEnding(); break;
      case "saved": break;
    }
  }

  /**
   * Level-up flourish: a rising light pillar, three ground rings, rising star sparkles, a brief screen glow and a floating "LEVEL UP!".
   * With "Reduce motion" it is only the still label and a soft glow; "Reduce flashing" lowers the glow further.
   */
  private endUi: { box: Phaser.GameObjects.Container; wash: Phaser.GameObjects.Rectangle; t: number; h: number } | null = null;
  private showEnding(): void {
    if (this.endUi) return;
    const lines = [
      "EMBERVEIL", "", "The Veil is mended.", "Three lamps burn, and the Lantern-Crown is dark no more.", "",
      "Ren, lamp-keeper of Emberfen", "Warden Isolde: the wardstones", "Kit and Dorn: companions", "", "WORLD OF AURELANE",
      "Emberfen, Whispering Grove, Mirewick, Ashglass Dunes", "Greatwater, Kestrel Plateau, Emberspine Range, Crownwatch", "",
      "DUNGEONS", "Cistern Under-Hall", "Mossgate Ruins", "Skyreach Spire", "Crownwatch Keep", "",
      "BOSSES", "Sluicejaw  -  The Bark Warden  -  Stormfinch Mol  -  Vael Orsek", "",
      "Music, sound, sprites and maps are generated in code.", "Built with Phaser 3, Vite and TypeScript.", "",
      "Thank you for playing.", "", "(press confirm to continue exploring)",
    ];
    const wash = this.add.rectangle(view.ox, view.oy, view.w, view.h, 0x04040e, 0.92).setOrigin(0).setScrollFactor(0).setDepth(16000);
    const box = this.add.container(0, 0).setScrollFactor(0).setDepth(16001);
    lines.forEach((ln, i) => {
      const big = i === 0 || ["WORLD OF AURELANE", "DUNGEONS", "BOSSES", "The Veil is mended.", "Thank you for playing."].includes(ln);
      const t = label(this, view.ox + view.w / 2, view.oy + view.h + i * 13, ln, big ? "#ffe08a" : "#ffffff").setOrigin(0.5, 0).setScale(big ? 0.9 : 0.66);
      box.add(t);
    });
    this.endUi = { box, wash, t: 0, h: lines.length * 13 + view.h };
  }
  private updateEnding(dt: number, confirm: boolean): void {
    if (!this.endUi) { this.showEnding(); return; }
    const u = this.endUi;
    u.t += dt;
    const speed = settings.reduceMotion ? 10 : 20;
    u.box.y = -Math.min(u.t * speed, u.h - view.h * 0.55);
    if ((confirm && u.t > 3) || u.t > u.h / speed + 20) {
      u.box.destroy(); u.wash.destroy(); this.endUi = null;
      this.sim.endEnding();
    }
  }

  private levelUpFx(x: number, y: number, lvl: number, who: string): void {
    const calm = settings.reduceMotion;
    const track = <G extends Phaser.GameObjects.GameObject>(o: G): G => { this.fxCount++; o.once(Phaser.GameObjects.Events.DESTROY, () => { this.fxCount--; }); return o; };
    const gold = 0xffe08a, aqua = 0x9fe8ff;
    if (!calm) {
      const pillar = track(this.add.image(x, y + 2, "lvl_pillar").setOrigin(0.5, 1).setBlendMode(Phaser.BlendModes.ADD).setDepth(y + 1).setAlpha(0).setScale(0.5 / TEX, 0.1 / TEX));
      this.tweens.add({ targets: pillar, scaleY: 1.1 / TEX, scaleX: 0.9 / TEX, alpha: { from: 0.95, to: 0 }, duration: 1300, ease: "Cubic.easeOut", onComplete: () => pillar.destroy() });
      for (let i = 0; i < 3; i++) {
        const ring = track(this.add.image(x, y - 1, "lvl_ring").setBlendMode(Phaser.BlendModes.ADD).setDepth(y + 1.5).setTint(i === 1 ? aqua : gold).setScale(0.2 / TEX, 0.08 / TEX).setAlpha(0));
        this.tweens.add({ targets: ring, scaleX: (1.0 + i * 0.25) / TEX, scaleY: ((1.0 + i * 0.25) * 0.42) / TEX, alpha: { from: 0.9, to: 0 }, duration: 760 + i * 120, delay: i * 140, ease: "Quad.easeOut", onStart: () => ring.setAlpha(0.9), onComplete: () => ring.destroy() });
      }
      for (let i = 0; i < 26; i++) {
        const a = Math.random() * Math.PI * 2, r = 4 + Math.random() * 14;
        const st = track(this.add.image(x + Math.cos(a) * r, y - 2 + Math.sin(a) * r * 0.4, "lvl_star").setBlendMode(Phaser.BlendModes.ADD).setDepth(13200).setTint([0xffffff, gold, aqua][i % 3]).setScale((0.5 + Math.random() * 0.7) / TEX).setAlpha(0));
        this.tweens.add({ targets: st, y: st.y - 22 - Math.random() * 34, x: st.x + (Math.random() - 0.5) * 12, alpha: { from: 1, to: 0 }, angle: (Math.random() - 0.5) * 180, scale: st.scale * 0.4, delay: Math.random() * 450, duration: 700 + Math.random() * 600, ease: "Sine.easeOut", onStart: () => st.setAlpha(1), onComplete: () => st.destroy() });
      }
    }
    // screen glow (a soft fixed gold wash)
    const peak = settings.reduceFlash ? 0.05 : calm ? 0.1 : 0.24;
    const wash = track(this.add.rectangle(view.ox, view.oy, view.w, view.h, 0xffd870, 0).setOrigin(0).setScrollFactor(0).setDepth(15500).setBlendMode(Phaser.BlendModes.ADD));
    this.tweens.add({ targets: wash, fillAlpha: { from: peak, to: 0 }, duration: calm ? 900 : 650, ease: "Quad.easeOut", onStart: () => wash.setFillStyle(0xffd870, peak), onComplete: () => wash.destroy() });
    // floating label
    const t = track(label(this, x, y - 30, "LEVEL UP!", "#fff0b0").setOrigin(0.5).setDepth(14600).setScale(calm ? 1 : 0.3));
    const sub = track(label(this, x, y - 21, who === "ren" ? `Level ${lvl}` : `${ALLIES[who]?.name ?? who} reached level ${lvl}`, "#ffffff").setOrigin(0.5).setDepth(14600).setScale(0.62).setAlpha(0));
    t.setStroke("#8a4a10", 3);
    if (calm) {
      t.setAlpha(0); sub.setAlpha(0);
      this.tweens.add({ targets: [t, sub], alpha: 1, duration: 250, yoyo: false, hold: 1500, onComplete: () => this.tweens.add({ targets: [t, sub], alpha: 0, duration: 400, onComplete: () => { t.destroy(); sub.destroy(); } }) });
    } else {
      this.tweens.add({ targets: t, scale: { from: 0.3, to: 1.25 }, duration: 320, ease: "Back.easeOut" });
      this.tweens.add({ targets: [t, sub], y: "-=14", duration: 1900, ease: "Sine.easeOut" });
      this.tweens.add({ targets: sub, alpha: 1, delay: 250, duration: 250 });
      this.tweens.add({ targets: [t, sub], alpha: 0, delay: 1500, duration: 450, onComplete: () => { t.destroy(); sub.destroy(); } });
    }
  }

  private burst(x: number, y: number, color: number, n: number): void {
    for (let i = 0; i < n; i++) {
      const d = this.add.image(x, y, "dot").setScale(0.2).setTint(color).setDepth(13000);
      const a = Math.random() * Math.PI * 2, r = 6 + Math.random() * 10;
      this.tweens.add({ targets: d, x: x + Math.cos(a) * r, y: y + Math.sin(a) * r - 4, alpha: 0, scale: 0.1, duration: 280 + Math.random() * 160, onComplete: () => d.destroy() });
    }
  }
  private floatText(x: number, y: number, text: string): void {
    const t = label(this, x, y, text, "#ffffff").setOrigin(0.5).setScale(0.8).setDepth(13500);
    this.tweens.add({ targets: t, y: y - 12, alpha: 0, duration: 650, onComplete: () => t.destroy() });
  }

  /* ---------------------------------------------------------------- world drawing */
  private syncWorld(): void {
    const sim = this.sim;
    if (sim.area.kind === "world") {
      if (this.roomImg) { this.destroyRoom(); }
      // drop unloaded chunk images
      for (const [k, img] of this.chunkImgs) if (!sim.loaded.has(k)) this.releaseChunk(k, img);
      let painted = 0;
      for (const k of sim.loaded) {
        if (this.chunkImgs.has(k) || painted >= 1) continue;
        const [cx, cy] = k.split(",").map(Number);
        const ch = sim.data.chunks.get(k);
        if (!ch) continue;
        const slot = this.takeSlot();
        chunkCanvas(ch.tiles, CW, CH, "world", cx * CW, cy * CH, (x, y) => sim.data.worldTile(x, y), CHUNK_TEX, slot.getSourceImage() as HTMLCanvasElement);
        slot.refresh();
        const img = this.add.image(cx * CW * TS, cy * CH * TS, slot.key).setOrigin(0, 0).setScale(1 / CHUNK_TEX).setDepth(-10);
        this.chunkSlot.set(k, slot);
        this.chunkImgs.set(k, img);
        painted++;
      }
    } else {
      for (const [k, img] of this.chunkImgs) this.releaseChunk(k, img);
      if (this.roomId !== sim.area.id) {
        this.destroyRoom();
        const r = sim.area.room!;
        const cv = chunkCanvas(r.tiles, r.w, r.h, r.kind === "dungeon" ? "dungeon" : "interior", 0, 0, () => 0);
        this.textures.addCanvas(`room_${r.id}`, cv)!.setFilter(Phaser.Textures.FilterMode.LINEAR);
        this.roomImg = this.add.image(0, 0, `room_${r.id}`).setOrigin(0, 0).setScale(1 / TEX).setDepth(-10);
        this.roomId = r.id;
      }
    }
  }
  /** Chunk textures come from a small pool of canvas textures that are repainted in place: no GPU texture churn when streaming. */
  private takeSlot(): Phaser.Textures.CanvasTexture {
    const free = this.freeSlots.pop();
    if (free) return free;
    const key = `cpool_${this.poolN++}`;
    const tex = this.textures.exists(key) ? (this.textures.get(key) as Phaser.Textures.CanvasTexture) : this.textures.createCanvas(key, CW * TS * CHUNK_TEX, CH * TS * CHUNK_TEX)!;
    tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
    return tex;
  }
  private releaseChunk(k: string, img: Phaser.GameObjects.Image): void {
    img.destroy();
    const slot = this.chunkSlot.get(k);
    if (slot) this.freeSlots.push(slot);
    this.chunkSlot.delete(k);
    this.chunkImgs.delete(k);
  }
  private destroyRoom(): void {
    if (this.roomImg) { this.roomImg.destroy(); this.textures.remove(`room_${this.roomId}`); this.roomImg = null; this.roomId = ""; }
  }

  private cameraUpdate(dt: number): { x0: number; y0: number; x1: number; y1: number } {
    const sim = this.sim, p = sim.p;
    const aw = sim.area.w * TS, ah = sim.area.h * TS;
    const tx = aw <= view.w ? (aw - view.w) / 2 : Phaser.Math.Clamp(p.x - view.w / 2, 0, aw - view.w);
    const ty = ah <= view.h ? (ah - view.h) / 2 : Phaser.Math.Clamp(p.y - 8 - view.h / 2, 0, ah - view.h);
    if (this.cam.snap) { this.cam.x = tx; this.cam.y = ty; this.cam.snap = false; }
    else { const k = 1 - Math.pow(0.0006, dt); this.cam.x += (tx - this.cam.x) * k; this.cam.y += (ty - this.cam.y) * k; }
    this.shake = Math.max(0, this.shake - dt * 14);
    const sx = this.shake ? (Math.random() - 0.5) * this.shake : 0, sy = this.shake ? (Math.random() - 0.5) * this.shake : 0;
    this.aimX = Math.round(this.cam.x * 4) / 4 + sx; this.aimY = Math.round(this.cam.y * 4) / 4 + sy;
    aim(this, this.aimX, this.aimY);
    return { x0: this.cam.x - 32, y0: this.cam.y - 32, x1: this.cam.x + view.w + 32, y1: this.cam.y + view.h + 32 };
  }

  /* ---------------------------------------------------------------- entities */
  private spr(key: string, tex: string, tag: string): Phaser.GameObjects.Image {
    let s = this.sprites.get(key);
    if (!s) {
      s = { img: this.add.image(0, 0, tex).setScale(1 / TEX).setOrigin(0.5, 28 / SPR), tag };
      this.sprites.set(key, s);
    }
    if (s.img.texture.key !== tex) s.img.setTexture(tex);
    return s.img;
  }

  private lab(key: string, text: string, x: number, y: number, color: string, near: boolean, alive: Set<string>): void {
    const mode = settings.labels;
    if (mode === "off" || !text) return;
    if (mode === "near" && !near) return;
    alive.add(key);
    let t = this.labels.get(key);
    if (!t) {
      t = label(this, 0, 0, text, color).setOrigin(0.5, 1).setScale(0.62).setDepth(14500);
      this.labels.set(key, t);
    }
    if (t.text !== text) t.setText(text);
    t.setColor(color).setPosition(x, y);
  }

  private syncEntities(dt: number): void {
    const sim = this.sim, p = sim.p, time = sim.time;
    const v = this.cameraUpdate(dt);
    const live = new Set<string>();
    const liveLabels = new Set<string>();
    const inView = (x: number, y: number, m = 0) => x > v.x0 - m && x < v.x1 + m && y > v.y0 - m && y < v.y1 + m;
    const nearP = (x: number, y: number) => Math.hypot(x - p.x, y - p.y) < 70;

    // things
    for (const th of sim.things) {
      if (!inView(th.x, th.y, th.w)) continue;
      const k = `t${th.uid}`;
      const near = nearP(th.x, th.y);
      switch (th.t) {
        case "bush": {
          live.add(k);
          const im = this.spr(k, th.cut ? "bush_1" : "bush_0", "bush"); im.setPosition(th.x, th.y + 6).setDepth(th.y + 6);
          break;
        }
        case "sign": {
          live.add(k); const im = this.spr(k, "sign", "sign"); im.setPosition(th.x, th.y + 6).setDepth(th.y + 6);
          this.lab(`l${k}`, "Sign", th.x, th.y - 12, DIM, near, liveLabels);
          break;
        }
        case "chest": {
          if (!sim.chestVisible(th)) break;
          live.add(k);
          const big = !!th.raw.big, open = sim.chestOpened(th);
          const im = this.spr(k, `${big ? "bigchest" : "chest"}_${open ? 1 : 0}`, "chest"); im.setPosition(th.x, th.y + 6).setDepth(th.y + 6);
          this.lab(`l${k}`, open ? `${th.label} (open)` : th.label, th.x, th.y - 12, open ? DIM : GOLD, near, liveLabels);
          break;
        }
        case "slab": case "rubble": case "thicket": {
          if (th.cut) break;
          live.add(k);
          const im = this.spr(k, th.t, th.t); im.setPosition(th.x, th.y + 8).setDepth(th.y + 8);
          this.lab(`l${k}`, th.label, th.x, th.y - 10, th.t === "slab" ? "#d8c88a" : th.t === "thicket" ? "#e8a070" : "#c8b8a0", near, liveLabels);
          break;
        }
        case "crystal": {
          live.add(k);
          const on = sim.save.doors.includes(th.raw.opens as string);
          const im = this.spr(k, `crystal_${on ? 1 : 0}`, "crystal"); im.setPosition(th.x, th.y + 6).setDepth(th.y + 6);
          this.lab(`l${k}`, "Crystal switch", th.x, th.y - 14, on ? DIM : "#ff9ab8", near, liveLabels);
          break;
        }
        case "npc": {
          if (sim.npcHidden(th.id)) break;
          live.add(k);
          const def = NPCS[th.id];
          const f = def?.look.kind === "hen" ? Math.floor(time * 3) % 2 : 0;
          const im = this.spr(k, `npc_${th.id}_${f}`, "npc"); im.setPosition(th.x, th.y + 6 + (def?.look.kind === "hen" ? 0 : Math.sin(time * 2 + th.uid) * 0.25)).setDepth(th.y + 6);
          this.lab(`l${k}`, def?.name ?? th.label, th.x, th.y - 17, EMBER, near, liveLabels);
          break;
        }
        case "shopitem": {
          live.add(k); const im = this.spr(k, "shopitem", "shop"); im.setPosition(th.x, th.y + 6).setDepth(th.y + 6);
          this.lab(`l${k}`, "Lamp shop counter", th.x, th.y - 10, GOLD, near, liveLabels);
          break;
        }
        case "door": {
          const open = sim.doorOpen(th);
          const kind = th.raw.kind as string;
          if (!open) {
            live.add(k);
            const tk = `door_${Math.round(th.w)}_${Math.round(th.h)}_${sim.sealed && kind === "open" ? "fight" : kind}`;
            doorTexture(this, tk, th.w, th.h, sim.sealed && kind === "open" ? "fight" : kind);
            const im = this.spr(k, tk, "door"); im.setOrigin(0.5, 0.5).setPosition(th.x, th.y).setDepth(th.y + th.h / 2);
            const nm = sim.sealed && kind === "open" ? "Sealed: defeat every foe" : th.label;
            this.lab(`l${k}`, nm, th.x, th.y - th.h / 2 - 2, kind === "big" ? "#d8a8ff" : kind === "switch" ? "#ff9ab8" : GOLD, near || sim.sealed, liveLabels);
          } else if (th.label) this.lab(`l${k}`, th.label, th.x, th.y - th.h / 2 - 2, DIM, near, liveLabels);
          break;
        }
        case "warp": {
          const reveal = th.raw.reveal as string | undefined;
          if (reveal && !sim.hasFlag(reveal)) break;
          if (th.label) this.lab(`l${k}`, th.label, th.x, th.y - th.h / 2 - 2, AQUA, near, liveLabels);
          break;
        }
      }
    }
    // pickups
    for (const pk of sim.pickups) {
      if (!inView(pk.x, pk.y)) continue;
      const k = `p${pk.uid}`; live.add(k);
      const im = this.spr(k, `pk_${pk.kind}`, "pk");
      const big = pk.val >= 99;
      im.setPosition(pk.x, pk.y + 6 - Math.max(0, pk.z) - Math.sin(time * 4 + pk.uid) * 1.2).setDepth(pk.y + 6).setScale((big ? 1.6 : 1) / TEX);
      im.setAlpha(pk.ttl < 2 ? (Math.floor(time * 10) % 2 ? 0.3 : 1) : 1);
      if (big) this.lab(`l${k}`, "Heart Lamp", pk.x, pk.y - 14, "#ff9aa4", true, liveLabels);
    }
    // enemies
    for (const e of sim.enemies) {
      if (!inView(e.x, e.y, 40)) continue;
      const k = `e${e.uid}`; live.add(k);
      const big = e.kind === "marshal" ? 40 : e.kind === "sluicejaw" ? 56 : SPR;
      const f = Math.floor(time * (e.kind === "bat" ? 10 : e.kind === "wisp" ? 7 : 4) + e.uid) % 2;
      const im = this.spr(k, `en_${e.kind}_${e.st === "windup" || e.st === "tell" || e.st === "crouch" ? 1 : f}`, "enemy");
      const org = FOOT_ORIGIN[e.kind] ?? [0.5, 28 / SPR];
      im.setOrigin(org[0], org[1]);
      const lift = e.kind === "stormfinch" ? (e.st === "grounded" ? 0 : 20 + Math.sin(time * 4) * 3) : e.def.flying ? 6 + Math.sin(time * 5 + e.uid) * 1.6 : 0;
      im.setPosition(e.x, e.y - lift + 2).setDepth(e.y + 2);
      im.setFlipX(e.kind === "soldier" ? Math.cos(e.face) < 0 : false);
      im.setScale(1 / TEX);
      if (e.dying > 0 && !e.alive) { const k2 = e.dying / 0.45; im.setAlpha(k2).setScale((1 / TEX) * (0.6 + 0.6 * k2)); }
      else im.setAlpha(e.kind === "sluicejaw" || e.kind === "stormfinch" ? Math.max(0.12, e.vis) : e.stun > 0 && Math.floor(time * 16) % 2 ? 0.7 : 1);
      if (e.flash > 0) im.setTintFill(0xffffff); else if (e.stun > 0 || e.st === "stunned") im.setTint(0xa8d8ff); else im.clearTint();
      void big;
      if (e.alive) this.lab(`l${k}`, e.def.name, e.x, e.y - (e.kind === "sluicejaw" || e.kind === "barkwarden" || e.kind === "stormfinch" ? 52 : e.kind === "marshal" || e.kind === "rootknight" || e.kind === "cloudmarshal" || e.kind === "vael" ? 40 : 18) - lift, e.def.boss ? RED : "#ffb0a0", nearP(e.x, e.y) || !!e.def.boss, liveLabels);
    }

    for (const id of sim.allyIds()) {
      const rt = sim.allyRt[id];
      if (!rt) continue;
      live.add(`ally_${id}`);
      const im = this.spr(`ally_${id}`, `npc_${id}_0`, "npc");
      im.setPosition(rt.x, rt.y + 6 + (rt.moving ? Math.abs(Math.sin(time * 9)) * -1.2 : Math.sin(time * 2) * 0.25)).setDepth(rt.y + 6);
      this.lab(`lally_${id}`, `${ALLIES[id].name} Lv ${sim.allyLevelOf(id)}`, rt.x, rt.y - 17, AQUA, false, liveLabels);
    }
    this.drawPlayer(time);
    this.drawProjs(time);
    this.drawPrompt(v);

    for (const [k, s] of this.sprites) if (!live.has(k)) { s.img.destroy(); this.sprites.delete(k); }
    for (const [k, t] of this.labels) if (!liveLabels.has(k)) { t.destroy(); this.labels.delete(k); }
    this.drawDark(v);
    if (sim.area.kind === "world") this.drawWater(v, dt); else if (this.waterOn) { this.waterG.clear(); this.waterOn = false; }
    void dirAngle;
  }

  private drawPlayer(time: number): void {
    const sim = this.sim, p = sim.p, im = this.player;
    const dir = p.facing;
    const moving = p.state === "walk";
    if (moving) this.walkT += 1 / 60; 
    const f = moving ? (Math.floor(this.walkT * 8) % 2) + 1 : 0;
    im.setTexture(`ren_${dir === "right" ? "right" : dir}_${f}`);
    let yoff = 0, ang = 0, sc = 1, alpha = 1;
    switch (p.state) {
      case "roll": ang = (p.t / 0.28) * Math.PI * 2 * (p.rollDx >= 0 ? 1 : -1); yoff = -3; sc = 0.9; break;
      case "hop": yoff = -Math.sin(Math.min(1, p.t / 0.5) * Math.PI) * 9; break;
      case "fall": sc = Math.max(0.05, 1 - p.t / 0.7); alpha = sc; break;
      case "dead": ang = Math.PI / 2; break;
      case "hurt": break;
      case "dash": yoff = -1; if (Math.floor(p.t * 30) % 2) alpha = 0.85; break;
      case "swing": case "charge": case "spin": break;
    }
    if (p.inv > 0 && p.state !== "roll") alpha = Math.floor(time * 20) % 2 ? 0.35 : 1;
    im.setPosition(p.x, p.y + yoff + 2).setDepth(p.y + 2).setRotation(ang).setScale(sc / TEX).setAlpha(alpha);
    if (p.state === "hurt") im.setTintFill(0xff6060); else im.clearTint();
    if (sim.mode === "dead") im.setAlpha(Math.max(0, 1 - sim.dead / 1.4));
    // held item
    const showHeld = p.state === "item" && p.held;
    this.heldIcon.setVisible(!!showHeld);
    if (showHeld) {
      const tex = ITEM_ICON[p.held] ?? (/^glints_/.test(p.held) ? "icon_glint" : "icon_key");
      this.heldIcon.setTexture(tex).setPosition(p.x, p.y - 22 - Math.min(4, p.t * 8)).setScale(1.6 / TEX).setDepth(p.y + 40);
    }
    // sword, shield, charge glow
    const g = this.fx;
    g.clear();
    const cx = p.x, cy = p.y - 7;
    if (p.state === "swing") {
      const k = Phaser.Math.Clamp((p.t - 0.03) / 0.22, 0, 1);
      const a0 = p.swingAngle - 1.3, a = a0 + 2.6 * k;
      g.lineStyle(5, 0xcfe8ff, 0.28); g.beginPath(); g.arc(cx, cy, 17, a0, a); g.strokePath();
      g.lineStyle(2.4, 0xffffff, 0.75); g.beginPath(); g.arc(cx, cy, 20, Math.max(a0, a - 1.2), a); g.strokePath();
      this.blade(g, cx, cy, a, 1);
    } else if (p.state === "spin") {
      const a = (p.t / 0.36) * Math.PI * 2 + p.swingAngle;
      g.lineStyle(6, 0xfff2b0, 0.3); g.beginPath(); g.arc(cx, cy, 20, a - 2.2, a); g.strokePath();
      g.lineStyle(2.4, 0xffffff, 0.85); g.beginPath(); g.arc(cx, cy, 24, a - 1.4, a); g.strokePath();
      this.blade(g, cx, cy, a, 1.15);
    } else if (p.state === "charge") {
      const full = p.chargeT >= 0.75;
      const a = dirAngle(p.facing) + 0.9;
      this.blade(g, cx, cy, a, 0.8);
      if (full) { const pulse = 0.5 + 0.5 * Math.sin(time * 18); g.lineStyle(1.6, 0xfff2b0, 0.5 + 0.4 * pulse); g.strokeCircle(cx, cy, 14 + pulse * 3); g.fillStyle(0xfff2b0, 0.18); g.fillCircle(cx, cy, 13); }
      else { g.lineStyle(1.4, 0xffffff, 0.35); g.beginPath(); g.arc(cx, cy, 13, -Math.PI / 2, -Math.PI / 2 + (p.chargeT / 0.75) * Math.PI * 2); g.strokePath(); }
    }
    if (p.shielding) {
      const a = dirAngle(p.facing), sx = cx + Math.cos(a) * 9, sy = cy + 1 + Math.sin(a) * 9;
      g.fillStyle(0x7d5833, 1); g.fillEllipse(sx, sy, 8, 10); g.fillStyle(0xc79a62, 1); g.fillEllipse(sx, sy, 5.6, 7.6); g.fillStyle(0xf2c85a, 1); g.fillCircle(sx, sy, 1.3);
    }
    g.setDepth(p.y + 3);
  }

  private blade(g: Phaser.GameObjects.Graphics, cx: number, cy: number, a: number, s: number): void {
    const c = Math.cos(a), sn = Math.sin(a);
    g.lineStyle(3 * s, 0x9fb4d8, 1); g.beginPath(); g.moveTo(cx + c * 5, cy + sn * 5); g.lineTo(cx + c * 21 * s, cy + sn * 21 * s); g.strokePath();
    g.lineStyle(1.6 * s, 0xf4f8ff, 1); g.beginPath(); g.moveTo(cx + c * 6, cy + sn * 6); g.lineTo(cx + c * 21 * s, cy + sn * 21 * s); g.strokePath();
    g.lineStyle(2.4, 0xf2c85a, 1); g.beginPath(); g.moveTo(cx + c * 5 - sn * 2.4, cy + sn * 5 + c * 2.4); g.lineTo(cx + c * 5 + sn * 2.4, cy + sn * 5 - c * 2.4); g.strokePath();
  }

  private drawProjs(time: number): void {
    const g = this.fx;
    for (const e of this.sim.enemies) {
      if (e.kind === "stormfinch" && e.alive) {
        const sh = e.st === "grounded" ? 0.4 : 0.22;
        g.fillStyle(0x000000, sh); g.fillEllipse(e.x, e.y + 2, 26, 8);
        if (e.st === "tell") { const a = 0.3 + 0.3 * Math.sin(time * 24); g.lineStyle(1.5, 0xff4a3a, 0.9); g.strokeCircle(e.hx, e.hy, 11); g.fillStyle(0xff4a3a, a); g.fillCircle(e.hx, e.hy, 9); }
      }
      if (e.kind === "barkwarden" && e.st === "whirl" && e.alive) {
        for (let k = 0; k < 2; k++) {
          const a = e.a + k * Math.PI, bx = e.x + Math.cos(a) * 38, by = e.y - 8 + Math.sin(a) * 38 * 0.8;
          g.lineStyle(2.4, 0x5a7a34, 0.9); g.beginPath(); g.moveTo(e.x, e.y - 8); g.lineTo(bx, by); g.strokePath();
          g.fillStyle(0x6ac84a, 0.4); g.fillCircle(bx, by, 8); g.fillStyle(0xe8587a, 1); g.fillCircle(bx, by, 4);
        }
      }
    }
    for (const pr of this.sim.projs) {
      if (pr.kind === "disc") {
        g.fillStyle(0xcfe0f4, 0.25); g.fillCircle(pr.x, pr.y, 6);
        g.fillStyle(0x8aa0b8, 1); g.fillCircle(pr.x, pr.y, 4.2); g.fillStyle(0xe8f2ff, 1); g.fillCircle(pr.x, pr.y, 3);
        g.lineStyle(1, 0x4a5a78, 1);
        for (let i = 0; i < 3; i++) { const a = time * 22 + (i * Math.PI * 2) / 3; g.beginPath(); g.moveTo(pr.x, pr.y); g.lineTo(pr.x + Math.cos(a) * 3.6, pr.y + Math.sin(a) * 3.6); g.strokePath(); }
      } else if (pr.kind === "seed") {
        g.fillStyle(0x6ac84a, 0.35); g.fillCircle(pr.x, pr.y, 5.5); g.fillStyle(0xa8e860, 1); g.fillCircle(pr.x, pr.y, 3); g.fillStyle(0xf0ffc0, 1); g.fillCircle(pr.x - 0.8, pr.y - 0.8, 1.2);
      } else if (pr.kind === "arrow") {
        const a = Math.atan2(pr.vy, pr.vx); g.lineStyle(1.6, 0xe8d8a8, 1); g.beginPath(); g.moveTo(pr.x - Math.cos(a) * 6, pr.y - Math.sin(a) * 6); g.lineTo(pr.x + Math.cos(a) * 5, pr.y + Math.sin(a) * 5); g.strokePath();
        g.fillStyle(0xc8ccd8, 1); g.fillCircle(pr.x + Math.cos(a) * 5, pr.y + Math.sin(a) * 5, 1.6);
      } else if (pr.kind === "bolt") {
        g.fillStyle(0xff7a2a, 0.3); g.fillCircle(pr.x, pr.y, 6); g.fillStyle(0xffa040, 1); g.fillCircle(pr.x, pr.y, 3.4); g.fillStyle(0xfff0b0, 1); g.fillCircle(pr.x, pr.y, 1.8);
      } else {
        g.fillStyle(0x6ac8f0, 0.45); g.fillCircle(pr.x, pr.y, 6); g.lineStyle(1.2, 0xd8f4ff, 0.9); g.strokeCircle(pr.x, pr.y, 5.4); g.fillStyle(0xffffff, 0.8); g.fillCircle(pr.x - 1.6, pr.y - 1.6, 1.2);
      }
    }
  }

  private drawPrompt(v: { x0: number; y0: number }): void {
    const sim = this.sim;
    void v;
    const th = sim.mode === "play" ? sim.nearestInteractable() : null;
    this.prompt.setVisible(!!th);
    if (!th) return;
    const touch = document.body.classList.contains("touch-ui");
    const verb = th.t === "slab" ? "Lift" : th.t === "npc" ? "Talk" : th.t === "sign" ? "Read" : th.t === "shopitem" ? "Shop" : "Open";
    this.prompt.setText(`${touch ? "Sword button" : "E"}: ${verb}`).setPosition(th.x, th.y - 22 - (th.t === "npc" ? 8 : 0));
  }

  /** Animated shimmer over visible water tiles (the baked chunk texture stays static, so streaming never repaints). */
  private drawWater(v: { x0: number; y0: number; x1: number; y1: number }, dt: number): void {
    const sim = this.sim, g = this.waterG;
    this.waterT += dt;
    if (settings.reduceMotion) { if (this.waterOn) { g.clear(); this.waterOn = false; } return; }
    // ~12 fps shimmer: the Graphics keeps its last commands between redraws, so this costs almost nothing per frame
    if (this.waterOn && this.waterT - this.waterLast < 0.085) return;
    this.waterLast = this.waterT; this.waterOn = true;
    g.clear();
    const t = this.waterT;
    const tx0 = Math.max(0, Math.floor(v.x0 / TS)), tx1 = Math.ceil(v.x1 / TS), ty0 = Math.max(0, Math.floor(v.y0 / TS)), ty1 = Math.ceil(v.y1 / TS);
    for (let ty = ty0; ty < ty1; ty++)
      for (let tx = tx0; tx < tx1; tx++) {
        const id = sim.tile(tx, ty);
        const deep = id === T.WATER || id === T.SEA || id === T.DUNWATER, lily = id === T.LILY, shallow = id === T.SHALLOW;
        if (!deep && !lily && !shallow) continue;
        const px = tx * TS, py = ty * TS, ph = (tx * 7 + ty * 13) % 6;
        const k = Math.sin(t * 1.8 + tx * 0.7 + ty * 0.45 + ph);
        const k2 = Math.sin(t * 1.3 - tx * 0.5 + ty * 0.9 + ph * 2);
        g.fillStyle(shallow ? 0xeaffff : 0xd8f0ff, 0.16 + 0.14 * k);
        g.fillRect(px + 2 + 3 * k, py + 4 + ((ph + 1) % 3), 6, 1);
        g.fillStyle(shallow ? 0xcff4ff : 0xa8d8ff, 0.12 + 0.12 * k2);
        g.fillRect(px + 7 - 3 * k2, py + 10 + (ph % 3), 6, 1);
        if (!shallow && (ph === 0 || ph === 3) && k > 0.85) { g.fillStyle(0xffffff, 0.55); g.fillRect(px + 5 + ph, py + 7, 2, 1); }
      }
  }

  /** Darkness layer: a small 2D canvas (1 px per logical unit, softened by linear filtering) that is repainted each frame while a dark room is shown. */
  private ensureDark(): { cv: Phaser.Textures.CanvasTexture; img: Phaser.GameObjects.Image } {
    const w = Math.ceil(view.w), h = Math.ceil(view.h);
    if (!this.darkCv || this.darkCv.width !== w || this.darkCv.height !== h) {
      this.darkImg2?.destroy();
      if (this.textures.exists("darkcv")) this.textures.remove("darkcv");
      this.darkCv = this.textures.createCanvas("darkcv", w, h)!;
      this.darkCv.setFilter(Phaser.Textures.FilterMode.LINEAR);
      this.darkImg2 = this.add.image(0, 0, "darkcv").setOrigin(0).setScrollFactor(0).setDepth(12000);
    }
    this.darkImg2!.setPosition(view.ox, view.oy).setScale(view.w / w, view.h / h);
    return { cv: this.darkCv, img: this.darkImg2! };
  }

  /**
   * Dark rooms: a darkness layer with soft light carved out around the hero (gentle flicker, lantern widens it) and around every
   * brazier in the room, plus a warm additive glow on each flame.
   */
  private drawDark(v: { x0: number; y0: number; x1: number; y1: number }): void {
    const sim = this.sim;
    const dark = sim.area.kind === "room" && !!sim.area.room!.dark;
    this.dark.clear();
    this.darkImg.setVisible(false);
    if (!dark) { this.darkImg2?.setVisible(false); this.glowG?.clear(); return; }
    if (this.lightsFor !== sim.area.id) {
      const r = sim.area.room!;
      this.torches = [];
      for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) if (r.tiles[y * r.w + x] === T.BRAZIER) this.torches.push({ x: (x + 0.5) * TS, y: (y + 0.4) * TS });
      this.lightsFor = sim.area.id;
    }
    const { cv, img } = this.ensureDark();
    img.setVisible(true);
    const ctx = cv.getContext();
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = `rgba(4,4,26,${settings.reduceFlash ? 0.8 : 0.88})`;
    ctx.fillRect(0, 0, cv.width, cv.height);
    const p = sim.p, time = sim.time;
    const flick = settings.reduceMotion ? 0 : Math.sin(time * 9) * 0.015 + Math.sin(time * 5.3) * 0.02;
    const lamp = sim.hasItem("brass_lantern") ? 1.2 : 1;
    ctx.globalCompositeOperation = "destination-out";
    const carve = (wx: number, wy: number, radius: number) => {
      const sx = wx - this.aimX, sy = wy - this.aimY;
      if (sx < -radius || sy < -radius || sx > cv.width + radius || sy > cv.height + radius) return;
      const g = ctx.createRadialGradient(sx, sy, radius * 0.08, sx, sy, radius);
      g.addColorStop(0, "rgba(0,0,0,1)"); g.addColorStop(0.55, "rgba(0,0,0,0.78)"); g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(sx - radius, sy - radius, radius * 2, radius * 2);
    };
    carve(p.x, p.y - 8, 62 * lamp * (1 + flick));
    for (const l of this.torches) carve(l.x, l.y, 46 * (1 + flick * 1.4));
    ctx.globalCompositeOperation = "source-over";
    cv.refresh();
    // warm flame glow (additive, drawn under the darkness)
    if (!this.glowG) this.glowG = this.add.graphics().setDepth(11990).setBlendMode(Phaser.BlendModes.ADD);
    const gg = this.glowG;
    gg.clear();
    void v;
    for (const l of this.torches) {
      const pulse = 1 + (settings.reduceMotion ? 0 : Math.sin(time * 8 + l.x) * 0.06);
      for (let i = 0; i < 7; i++) { gg.fillStyle(i < 4 ? 0xff8a30 : 0xffc060, 0.028); gg.fillCircle(l.x, l.y, (32 - i * 4.4) * pulse); }
    }
    for (let i = 0; i < 4; i++) { gg.fillStyle(0xffd890, 0.02); gg.fillCircle(p.x, p.y - 8, 26 - i * 6); }
  }
  private glowG: Phaser.GameObjects.Graphics | null = null;
}
