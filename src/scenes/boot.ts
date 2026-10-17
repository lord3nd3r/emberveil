import Phaser from "phaser";
import { FONT } from "../cast";
import { onViewChange, setupCamera, view } from "../gfx";
import { WorldData } from "../sim/maps";
import { buildSprites } from "../sprites";
import { buildUiTextures } from "../ui";

export class BootScene extends Phaser.Scene {
  constructor() { super("boot"); }
  create(): void {
    setupCamera(this);
    this.cameras.main.setBackgroundColor("#06061a");
    const t = this.add.text(view.w / 2, view.h / 2, "Kindling Aurelane…", { fontFamily: FONT, fontSize: "10px", color: "#f4f1e8" }).setOrigin(0.5);
    onViewChange(this, () => t.setPosition(view.w / 2, view.h / 2));
    void this.load2();
  }
  private async load2(): Promise<void> {
    try { await Promise.all([document.fonts.load("600 10px Inter"), document.fonts.load("700 10px Inter")]); } catch { /* font loading is best effort */ }
    const base = import.meta.env.BASE_URL + "world/";
    const world = new WorldData(async (rel) => {
      const r = await fetch(base + rel, { cache: "no-cache" });
      if (!r.ok) throw new Error(`could not load ${rel}`);
      return r.json();
    });
    await world.init();
    this.registry.set("world", world);
    buildUiTextures(this);
    buildSprites(this);
    // the playable scene (HUD, menus, map views, combat rendering) is a separate lazy chunk
    const { GameScene } = await import("./game");
    if (!this.scene.manager.keys["game"]) this.scene.add("game", GameScene);
    this.scene.start("title");
  }
}
