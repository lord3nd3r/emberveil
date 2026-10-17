/** Keyboard, mouse and touch input merged into the sim's Input struct plus menu actions. */
import Phaser from "phaser";
import { takeV, vin } from "./keys";
import { pad } from "./gamepad";
import type { Input } from "./sim/types";

export interface Ui {
  up: boolean; down: boolean; left: boolean; right: boolean;
  confirm: boolean; cancel: boolean; menu: boolean; map: boolean; tonic: boolean; cycle: boolean; cycleBack?: boolean;
}

const KEYS = {
  up: ["KeyW", "ArrowUp"], down: ["KeyS", "ArrowDown"], left: ["KeyA", "ArrowLeft"], right: ["KeyD", "ArrowRight"],
  attack: ["Space", "KeyJ", "KeyZ"], shield: ["KeyK", "ShiftLeft", "ShiftRight", "KeyX"], dodge: ["KeyL", "KeyR"], item: ["KeyQ", "KeyI"],
  interact: ["KeyE", "Enter"], map: ["KeyM"], menu: ["Escape", "KeyP", "Tab"], tonic: ["KeyH"], cycle: ["KeyC"],
};
const BLOCK = new Set(["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Tab"]);

export class GameInput {
  private down = new Set<string>();
  private edge = new Set<string>();
  private mouseL = false;
  private mouseLEdge = false;
  private mouseR = false;
  private lastMove = -1e9;
  private cam: Phaser.Cameras.Scene2D.Camera;

  constructor(private scene: Phaser.Scene) {
    this.cam = scene.cameras.main;
    const kd = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT")) return;
      if (BLOCK.has(e.code)) e.preventDefault();
      if (!e.repeat) this.edge.add(e.code);
      this.down.add(e.code);
    };
    const ku = (e: KeyboardEvent) => this.down.delete(e.code);
    const blur = () => { this.down.clear(); this.mouseL = false; this.mouseR = false; };
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    window.addEventListener("blur", blur);
    const cm = (e: Event) => e.preventDefault();
    scene.game.canvas.addEventListener("contextmenu", cm);
    scene.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (p.wasTouch) return;
      if (p.rightButtonDown()) this.mouseR = true;
      else { this.mouseL = true; this.mouseLEdge = true; }
      this.lastMove = performance.now();
    });
    scene.input.on("pointerup", (p: Phaser.Input.Pointer) => {
      if (p.wasTouch) return;
      if (!p.rightButtonDown()) this.mouseR = false;
      if (!p.leftButtonDown()) this.mouseL = false;
    });
    scene.input.on("pointermove", (p: Phaser.Input.Pointer) => { if (!p.wasTouch) this.lastMove = performance.now(); });
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      window.removeEventListener("blur", blur);
      scene.game.canvas.removeEventListener("contextmenu", cm);
    });
  }

  private any(codes: string[]): boolean { return codes.some((c) => this.down.has(c)); }
  private took(codes: string[]): boolean { let hit = false; for (const c of codes) if (this.edge.has(c)) { hit = true; this.edge.delete(c); } return hit; }

  /** Pointer position in world logical units. */
  pointerWorld(): { x: number; y: number } {
    const p = this.scene.input.activePointer;
    const w = this.cam.getWorldPoint(p.x, p.y);
    return { x: w.x, y: w.y };
  }

  /** Reads gameplay input. `px, py` is the player's chest position, used to aim with the mouse. */
  poll(px: number, py: number): Input {
    let mx = (this.any(KEYS.right) ? 1 : 0) - (this.any(KEYS.left) ? 1 : 0);
    let my = (this.any(KEYS.down) ? 1 : 0) - (this.any(KEYS.up) ? 1 : 0);
    if (mx === 0 && my === 0 && Math.hypot(vin.axis.x, vin.axis.y) > 0.18) { mx = vin.axis.x; my = vin.axis.y; }
    if (mx === 0 && my === 0 && pad.active && Math.hypot(pad.axis.x, pad.axis.y) > 0) { mx = pad.axis.x; my = pad.axis.y; }
    const attackEdge = this.took(KEYS.attack) || this.mouseLEdge || takeV("attack");
    this.mouseLEdge = false;
    const mouseAim = performance.now() - this.lastMove < 1500 && !this.scene.input.activePointer.wasTouch;
    let aim: number | null = null;
    if (mouseAim && (this.mouseL || this.mouseR || attackEdge)) {
      const w = this.pointerWorld();
      aim = Math.atan2(w.y - py, w.x - px);
    }
    return {
      mx, my,
      attack: attackEdge,
      attackHeld: this.any(KEYS.attack) || this.mouseL || vin.hold.attack || pad.hold.attack,
      shield: this.any(KEYS.shield) || this.mouseR || vin.hold.shield || pad.hold.shield,
      dodge: this.took(KEYS.dodge) || takeV("dodge"),
      item: this.took(KEYS.item) || takeV("item"),
      interact: this.took(KEYS.interact) || takeV("confirm"),
      aim,
    };
  }

  /** Reads menu actions (edge-triggered). */
  ui(): Ui {
    return {
      up: this.took(KEYS.up) || takeV("up"), down: this.took(KEYS.down) || takeV("down"), left: this.took(KEYS.left) || takeV("left"), right: this.took(KEYS.right) || takeV("right"),
      confirm: this.took([...KEYS.interact, "Space", "KeyJ"]) || takeV("confirm"), cancel: this.took(["Backspace", "KeyB"]) || takeV("cancel"),
      menu: this.took(KEYS.menu) || takeV("menu"), map: this.took(KEYS.map) || takeV("map"), tonic: this.took(KEYS.tonic) || takeV("tonic"), cycle: this.took(KEYS.cycle) || takeV("cycle"), cycleBack: takeV("cycleBack"),
    };
  }

  /** Throws away queued presses (when switching between play and menus). */
  flush(): void { this.edge.clear(); for (const k of Object.keys(vin.queue)) vin.queue[k as keyof typeof vin.queue] = 0; this.mouseLEdge = false; }
}
