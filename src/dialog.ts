import Phaser from "phaser";
import { FONT, fs, GOLD, WHITE } from "./cast";
import { view } from "./gfx";
import { label, windowImage } from "./ui";

const BOX_H = 54;
const MAX_W = 380;
const LINES = 3;

/** Chrono-style dialogue: window anchored to the bottom edge, typewriter text, paged three lines at a time. */
export class DialogueBox {
  private box: Phaser.GameObjects.Container;
  private win: Phaser.GameObjects.Image | null = null;
  private body: Phaser.GameObjects.Text;
  private nameWin: Phaser.GameObjects.Image | null = null;
  private nameText: Phaser.GameObjects.Text;
  private more: Phaser.GameObjects.Text;
  private measure: Phaser.GameObjects.Text;
  private pages: string[] = [];
  private page = 0;
  private shown = 0;
  private acc = 0;
  private clock = 0;
  private who = "";
  private text = "";
  private boxX = 0;
  private boxY = 0;
  private boxW = 0;
  active = false;

  constructor(private scene: Phaser.Scene) {
    this.box = scene.add.container(0, 0).setScrollFactor(0).setDepth(20000).setVisible(false);
    this.body = label(scene, 0, 0, "", WHITE, 100);
    this.nameText = label(scene, 0, 0, "", GOLD);
    this.more = label(scene, 0, 0, "▼", GOLD);
    this.box.add([this.body, this.nameText, this.more]);
    this.measure = scene.add
      .text(-999, -999, "", { fontFamily: FONT, fontSize: fs(), fontStyle: "600", lineSpacing: 4.5, wordWrap: { width: 100, useAdvancedWrap: true } })
      .setVisible(false);
    this.layout();
  }

  /** Re-anchors to the current window size. Safe to call any time. */
  layout(): void {
    this.boxW = Math.min(MAX_W, view.w - 16);
    this.boxX = (view.w - this.boxW) / 2;
    this.boxY = view.h - BOX_H - 8;
    this.box.setPosition(view.ox, view.oy);
    this.win?.destroy();
    this.win = windowImage(this.scene, this.boxX, this.boxY, this.boxW, BOX_H);
    this.box.add(this.win);
    this.box.sendToBack(this.win);
    const textW = this.boxW - 22;
    this.body.setPosition(this.boxX + 11, this.boxY + 8);
    this.body.setWordWrapWidth(textW, true);
    this.measure.setWordWrapWidth(textW, true);
    this.more.setPosition(this.boxX + this.boxW - 17, this.boxY + BOX_H - 14);
    if (this.active) {
      this.paginate();
      this.page = Math.min(this.page, this.pages.length - 1);
      this.shown = Math.min(this.shown, this.pages[this.page].length);
      this.body.setText(this.pages[this.page].slice(0, this.shown));
      this.placeName();
    }
  }

  hit(): boolean {
    return this.active;
  }

  private paginate(): void {
    const lines = this.measure.setText(this.text).getWrappedText(this.text);
    this.pages = [];
    for (let i = 0; i < lines.length; i += LINES) this.pages.push(lines.slice(i, i + LINES).join("\n"));
    if (this.pages.length === 0) this.pages = [""];
  }

  private placeName(): void {
    this.nameWin?.destroy();
    this.nameWin = null;
    this.nameText.setText(this.who);
    if (this.who) {
      const w = Math.max(44, this.who.length * 5.6 + 16);
      this.nameWin = windowImage(this.scene, this.boxX + 6, this.boxY - 15, w, 16);
      this.box.add(this.nameWin);
      this.box.bringToTop(this.nameText);
      this.nameText.setPosition(this.boxX + 14, this.boxY - 12.5);
    }
  }

  open(who: string, text: string): void {
    this.active = true;
    this.box.setVisible(true);
    this.who = who;
    this.text = text;
    this.paginate();
    this.page = 0;
    this.shown = 0;
    this.acc = 0;
    this.placeName();
    this.body.setText("");
  }

  update(dt: number): void {
    if (!this.active) return;
    this.clock += dt;
    const full = this.pages[this.page];
    if (this.shown < full.length) {
      this.acc += dt * 70;
      while (this.acc >= 1 && this.shown < full.length) {
        this.acc -= 1;
        this.shown += 1;
      }
      this.body.setText(full.slice(0, this.shown));
    }
    const done = this.shown >= full.length;
    this.more.setVisible(done);
    this.more.setY(this.boxY + BOX_H - 14 + Math.sin(this.clock * 6) * 1.2);
  }

  /** Confirm pressed or clicked. Returns true when the whole line is finished. */
  advance(): boolean {
    if (!this.active) return true;
    const full = this.pages[this.page];
    if (this.shown < full.length) {
      this.shown = full.length;
      this.body.setText(full);
      return false;
    }
    if (this.page < this.pages.length - 1) {
      this.page += 1;
      this.shown = 0;
      this.acc = 0;
      this.body.setText("");
      return false;
    }
    return true;
  }

  close(): void {
    this.active = false;
    this.box.setVisible(false);
  }
}
