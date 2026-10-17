/**
 * Touch controls: a virtual joystick (left) and confirm / cancel / menu buttons (right), plus
 * fullscreen and mute. Shown at once on touch-first devices; on a desktop with a touchscreen it
 * appears after the first real touch and hides again as soon as the keyboard or mouse is used.
 * Input flows through the same Controls taps the keyboard uses.
 */
import type Phaser from "phaser";
import { vin, type VName } from "./keys";
import { sfx } from "./audio";
import { view } from "./gfx";

type Dir = "up" | "down" | "left" | "right";

export function detectTouchFirst(): boolean {
  const nav = navigator as Navigator & { userAgentData?: { mobile?: boolean } };
  const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  const noHover = window.matchMedia?.("(hover: none)").matches ?? false;
  const mobileUA = nav.userAgentData?.mobile === true || /Android|iPhone|iPad|iPod|Mobile|Silk/i.test(nav.userAgent);
  // iPadOS reports itself as a Mac with touch points
  const ipad = nav.platform === "MacIntel" && nav.maxTouchPoints > 1;
  return (nav.maxTouchPoints > 0 && (coarse || noHover)) || mobileUA || ipad;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text) e.textContent = text;
  return e;
}

export function initTouch(game: Phaser.Game): void {
  const first = detectTouchFirst();
  const root = el("div", "touch");
  root.id = "touch";
  root.hidden = true;
  const pad = el("div", "pad");
  const base = el("div", "stick");
  const knob = el("div", "knob");
  base.append(knob);
  pad.append(base);
  const buttons = el("div", "btns");
  const mk = (cls: string, text: string, label: string, name: VName) => {
    const b = el("button", `tbtn ${cls}`, text);
    b.type = "button";
    b.setAttribute("aria-label", label);
    b.title = label;
    const down = (ev: PointerEvent) => {
      ev.preventDefault();
      b.setPointerCapture(ev.pointerId);
      b.classList.add("on");
      sfx.unlock();
      vin.press(name);
    };
    const up = () => b.classList.remove("on");
    b.addEventListener("pointerdown", down);
    b.addEventListener("pointerup", up);
    b.addEventListener("pointercancel", up);
    return b;
  };
  // Hold-style buttons (sword charge, shield) feed vin.hold; the rest are taps.
  const mkHold = (cls: string, text: string, label: string, key: "attack" | "shield") => {
    const b = el("button", `tbtn ${cls}`, text);
    b.type = "button";
    b.setAttribute("aria-label", label);
    b.title = label;
    b.addEventListener("pointerdown", (ev) => {
      ev.preventDefault();
      b.setPointerCapture(ev.pointerId);
      b.classList.add("on");
      sfx.unlock();
      vin.hold[key] = true;
      if (key === "attack") { vin.press("attack"); vin.press("confirm"); } else vin.press("cancel");
    });
    const up = () => { b.classList.remove("on"); vin.hold[key] = false; };
    b.addEventListener("pointerup", up);
    b.addEventListener("pointercancel", up);
    return b;
  };
  buttons.append(
    mkHold("a", "Sword", "Sword: tap to swing, hold to charge a spin (A)", "attack"),
    mkHold("b", "Shield", "Shield: hold to block (B)", "shield"),
    mk("r", "Roll", "Dodge roll (R)", "dodge"),
    mk("i", "Item", "Use equipped item (Q)", "item"),
    mk("p", "Map", "Open the map (M)", "map"),
    mk("m", "Menu", "Open menu (Menu)", "menu"),
  );
  const top = el("div", "tops");
  const fs = el("button", "tbtn small", "⛶");
  fs.type = "button";
  fs.setAttribute("aria-label", "Toggle fullscreen");
  fs.title = "Fullscreen";
  base.setAttribute("role", "application");
  base.setAttribute("aria-label", "Movement stick. Drag to move");
  base.title = "Move";
  const root2 = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
  const canFs = Boolean(root2.requestFullscreen || root2.webkitRequestFullscreen);
  fs.hidden = !canFs;
  fs.addEventListener("click", async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else {
        await (root2.requestFullscreen?.({ navigationUI: "hide" }) ?? root2.webkitRequestFullscreen?.());
        const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
        await o.lock?.("landscape").catch(() => undefined);
      }
    } catch {
      // fullscreen can be refused; nothing to do
    }
  });
  top.append(fs);
  const rotate = el("div", "rotate", "Turn your device sideways for the best view");
  root.append(pad, buttons, top, rotate);
  document.body.append(root);

  /* ---- joystick: 4-way digital with tap repeat for menus ---- */
  let active = -1;
  let cx = 0;
  let cy = 0;
  let radius = 50;
  const dirs: Record<Dir, boolean> = { up: false, down: false, left: false, right: false };
  const repeat: Record<Dir, number> = { up: 0, down: 0, left: 0, right: 0 };
  const setDir = (d: Dir, on: boolean) => {
    if (dirs[d] === on) return;
    dirs[d] = on;
    vin.held[d] = on;
    if (on) {
      vin.press(d);
      repeat[d] = performance.now() + 380;
    }
  };
  const clear = () => { vin.axis.x = 0; vin.axis.y = 0; (["up", "down", "left", "right"] as Dir[]).forEach((d) => setDir(d, false)); };
  const move = (ev: PointerEvent) => {
    if (ev.pointerId !== active) return;
    let dx = ev.clientX - cx;
    let dy = ev.clientY - cy;
    const len = Math.hypot(dx, dy);
    const lim = radius * 0.9;
    if (len > lim) {
      dx = (dx / len) * lim;
      dy = (dy / len) * lim;
    }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    vin.axis.x = dx / lim;
    vin.axis.y = dy / lim;
    const dz = radius * 0.28;
    // allow diagonals in the field; the dominant axis only is used for menu repeats
    setDir("left", dx < -dz);
    setDir("right", dx > dz);
    setDir("up", dy < -dz);
    setDir("down", dy > dz);
  };
  base.addEventListener("pointerdown", (ev) => {
    ev.preventDefault();
    sfx.unlock();
    active = ev.pointerId;
    base.setPointerCapture(ev.pointerId);
    const r = base.getBoundingClientRect();
    cx = r.left + r.width / 2;
    cy = r.top + r.height / 2;
    radius = r.width / 2;
    base.classList.add("on");
    move(ev);
  });
  base.addEventListener("pointermove", move);
  const release = (ev: PointerEvent) => {
    if (ev.pointerId !== active) return;
    active = -1;
    knob.style.transform = "translate(0px, 0px)";
    base.classList.remove("on");
    clear();
  };
  base.addEventListener("pointerup", release);
  base.addEventListener("pointercancel", release);
  window.setInterval(() => {
    const now = performance.now();
    (["up", "down", "left", "right"] as Dir[]).forEach((d) => {
      if (dirs[d] && now > repeat[d]) {
        vin.press(d);
        repeat[d] = now + 170;
      }
    });
  }, 40);

  /* ---- visibility rules ---- */
  let shown = false;
  let lastTouch = 0;
  const show = (on: boolean) => {
    if (on === shown) return;
    shown = on;
    root.hidden = !on;
    document.body.classList.toggle("touch-ui", on);
    if (!on) clear();
  };
  if (first) show(true);
  window.addEventListener(
    "pointerdown",
    (e) => {
      if (e.pointerType === "touch") {
        lastTouch = performance.now();
        show(true);
      } else if (!first && performance.now() - lastTouch > 600) show(false);
    },
    { passive: true, capture: true },
  );
  window.addEventListener(
    "pointermove",
    (e) => {
      if (!first && e.pointerType === "mouse" && performance.now() - lastTouch > 600) show(false);
    },
    { passive: true },
  );
  window.addEventListener(
    "keydown",
    (e) => {
      if (!first && !["Shift", "Control", "Alt", "Meta"].includes(e.key)) show(false);
    },
    { passive: true },
  );

  /* ---- layout hooks: scene name, free space above the battle windows, orientation ---- */
  const sync = () => {
    const s = game.scene.getScenes(true)[0]?.scene.key ?? "";
    document.body.dataset.scene = s;
    const portrait = window.innerHeight > window.innerWidth;
    document.body.classList.toggle("portrait", portrait);
    rotate.hidden = !(portrait && window.innerWidth < 640 && shown);
    // battle windows take 68 logical units from the bottom; keep the controls above them
    root.style.setProperty("--above", `${Math.round(((72 / view.h) * window.innerHeight))}px`);
  };
  window.setInterval(sync, 250);
  game.events.on("viewchange", sync);
  sync();
  // Dismiss the rotate hint when tapped
  rotate.addEventListener("click", () => (rotate.hidden = true));
  // iOS: block pinch zoom and double-tap zoom gestures
  document.addEventListener("gesturestart", (e) => e.preventDefault(), { passive: false } as AddEventListenerOptions);
  document.addEventListener("touchmove", (e) => { if ((e.target as HTMLElement).closest?.("#touch")) e.preventDefault(); }, { passive: false });
}
