import Phaser from "phaser";
import { accounts } from "../accounts";
import { sfx } from "../audio";
import { showAuth } from "../authui";
import { DIM, EMBER, GOLD, WHITE } from "../cast";
import { onViewChange, setupCamera, view, TEX } from "../gfx";
import { GameInput } from "../input";
import { clearSave, readSave } from "../save";
import { label, windowImage, zone, announce } from "../ui";

export class TitleScene extends Phaser.Scene {
  private items: { id: string; text: string }[] = [];
  private sel = 0;
  private objs: Phaser.GameObjects.GameObject[] = [];
  private inp!: GameInput;
  private confirmNew = false;
  private embers: { img: Phaser.GameObjects.Image; vy: number; ph: number }[] = [];
  private t = 0;
  constructor() { super("title"); }

  create(): void {
    setupCamera(this);
    this.cameras.main.setBackgroundColor("#0a0c26");
    this.inp = new GameInput(this);
    onViewChange(this, () => this.build());
    this.build();
    sfx.setTheme("title");
    this.input.once("pointerdown", () => sfx.unlock());
  }

  private build(): void {
    this.objs.forEach((o) => o.destroy());
    this.objs = [];
    this.embers = [];
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => { this.objs.push(o); return o; };
    const W = view.w, H = view.h;
    // night sky, far ridges, a lone beacon
    const g = add(this.add.graphics());
    for (let i = 0; i < 24; i++) { g.fillStyle(0x1a2050 + i * 0x010202, 1); g.fillRect(0, (H * i) / 24, W, H / 24 + 1); }
    for (let i = 0; i < 70; i++) { g.fillStyle(0xffffff, 0.3 + ((i * 37) % 7) / 12); g.fillRect((i * 97.3) % W, (i * 53.1) % (H * 0.55), 1, 1); }
    const ridge = (base: number, amp: number, col: number, ph: number) => {
      g.fillStyle(col, 1); g.beginPath(); g.moveTo(0, H);
      for (let x = 0; x <= W; x += 4) g.lineTo(x, base + Math.sin(x * 0.02 + ph) * amp + Math.sin(x * 0.047 + ph * 2) * amp * 0.5);
      g.lineTo(W, H); g.closePath(); g.fillPath();
    };
    ridge(H * 0.62, 12, 0x1c2250, 0); ridge(H * 0.72, 10, 0x141a3c, 2); ridge(H * 0.84, 8, 0x0c1028, 4);
    const bx = W * 0.72, by = H * 0.6;
    g.fillStyle(0x0a0c20, 1); g.fillRect(bx - 5, by - 22, 10, 26); g.fillRect(bx - 8, by - 26, 16, 5);
    const glow = add(this.add.image(bx, by - 28, "glow").setScale(2.6 / TEX).setAlpha(0.85).setBlendMode(Phaser.BlendModes.ADD));
    this.tweens.add({ targets: glow, alpha: 0.5, duration: 900, yoyo: true, repeat: -1, ease: "Sine.inOut" });
    for (let i = 0; i < 28; i++) {
      const e = add(this.add.image(Math.random() * W, H * (0.55 + Math.random() * 0.45), "dot").setScale(0.12 + Math.random() * 0.14).setTint(0xff9a4a).setAlpha(0.5 + Math.random() * 0.5).setBlendMode(Phaser.BlendModes.ADD));
      this.embers.push({ img: e, vy: 4 + Math.random() * 10, ph: Math.random() * 6 });
    }
    // title
    const title = add(label(this, W / 2, H * 0.17, "EMBERVEIL", GOLD).setOrigin(0.5).setScale(4.2));
    title.setShadow(0, 2, "rgba(255,120,40,0.7)", 8, true, true);
    add(label(this, W / 2, H * 0.17 + 24, "A tale of Aurelane", EMBER).setOrigin(0.5).setScale(1.1));
    // menu
    const sv = readSave();
    const acc = accounts.current();
    this.items = [];
    if (this.confirmNew) this.items.push({ id: "yes", text: "Yes, erase my save and begin anew" }, { id: "no", text: "No, go back" });
    else {
      if (sv) this.items.push({ id: "continue", text: `Continue  (${Math.floor(sv.playTime / 60)} min)` });
      this.items.push({ id: "new", text: "New Game" });
      if (!acc) this.items.push({ id: "account", text: "Sign in / Register  (sync saves)" });
      this.items.push({ id: "settings", text: "Settings" });
    }
    this.sel = Math.min(this.sel, this.items.length - 1);
    const mw = 172, mh = 14 + this.items.length * 15, mx = (W - mw) / 2, my = H * 0.5;
    add(windowImage(this, mx, my, mw, mh));
    this.items.forEach((it, i) => {
      const y = my + 8 + i * 15, on = i === this.sel;
      if (on) add(this.add.rectangle(mx + 4, y - 2, mw - 8, 14, 0xf2c85a, 0.2).setOrigin(0));
      add(label(this, W / 2, y, (on ? "▶ " : "   ") + it.text, on ? GOLD : WHITE).setOrigin(0.5, 0).setScale(0.92));
      add(zone(this, mx + 4, y - 2, mw - 8, 14, () => { if (this.sel !== i) { this.sel = i; this.build(); } }, () => { this.sel = i; void this.choose(); }, true));
    });
    const who = acc ? `Signed in as ${acc.name}` : "Playing as guest: saves stay on this device";
    add(label(this, W / 2, H - 14, `${who}   •   WASD/arrows move, Space sword, Shift shield, L roll, E talk, M map, Esc menu`, DIM).setOrigin(0.5, 0).setScale(0.66));
    announce(`Emberveil title. ${this.items.map((i) => i.text).join(", ")}`);
  }

  update(_t: number, ms: number): void {
    const dt = ms / 1000;
    this.t += dt;
    for (const e of this.embers) { e.img.y -= e.vy * dt; e.img.x += Math.sin(this.t * 1.4 + e.ph) * 6 * dt; if (e.img.y < -4) e.img.y = view.h + 4; }
    const ui = this.inp.ui();
    if (ui.up) { this.sel = (this.sel + this.items.length - 1) % this.items.length; sfx.play("select"); this.build(); }
    if (ui.down) { this.sel = (this.sel + 1) % this.items.length; sfx.play("select"); this.build(); }
    if (ui.confirm) void this.choose();
    if ((ui.cancel || ui.menu) && this.confirmNew) { this.confirmNew = false; this.build(); }
  }

  private async choose(): Promise<void> {
    const it = this.items[this.sel];
    if (!it) return;
    sfx.unlock(); sfx.play("blip");
    switch (it.id) {
      case "continue": this.scene.start("game", { save: readSave() }); break;
      case "new": if (readSave()) { this.confirmNew = true; this.sel = 1; this.build(); } else this.scene.start("game", { save: null }); break;
      case "yes": clearSave(); this.scene.start("game", { save: null }); break;
      case "no": this.confirmNew = false; this.sel = 0; this.build(); break;
      case "account": await showAuth(); this.build(); break;
      case "settings": (document.querySelector('#hudbtns button[aria-haspopup="dialog"]') as HTMLButtonElement | null)?.click(); break;
    }
  }
}
void TEX;
