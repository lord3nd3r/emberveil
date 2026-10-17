/**
 * Gamepad support (Gamepad API, "standard" mapping).
 *
 *   left stick / D-pad  move (menus: D-pad or stick, with key repeat)
 *   A  interact / talk / confirm        B  cancel / back
 *   X  sword (hold to charge)           Y  use item
 *   LB / RB  previous / next item       LT  shield (hold)      RT  roll / dash
 *   Start  pause menu                   Back / Select  map     R3  Ember Tonic
 *
 * Presses are fed into the same virtual input queue the touch buttons use (keys.ts), so every scene, menu and
 * shop already understands them. While the DOM settings panel or the sign-in form is open the pad drives that
 * instead (D-pad moves focus, A clicks, B closes) so the game underneath never sees the presses.
 */
import type Phaser from "phaser";
import { vin, type VName } from "./keys";
import { settings } from "./settings";

export type PadKind = "xbox" | "ps" | "generic";

export const pad = {
  /** at least one controller is plugged in */
  connected: false,
  /** the player is currently using a controller (touch UI hides, hints switch to button names) */
  active: false,
  id: "",
  kind: "xbox" as PadKind,
  /** movement, -1..1, dead zone already applied (stick, or D-pad as digital) */
  axis: { x: 0, y: 0 },
  hold: { attack: false, shield: false },
};

const B = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 } as const;

const NAMES: Record<PadKind, Record<string, string>> = {
  xbox: { confirm: "A", cancel: "B", attack: "X", item: "Y", cycle: "RB", cycleBack: "LB", shield: "LT", dodge: "RT", menu: "Menu", map: "View", tonic: "R3" },
  ps: { confirm: "✕", cancel: "○", attack: "□", item: "△", cycle: "R1", cycleBack: "L1", shield: "L2", dodge: "R2", menu: "Options", map: "Create", tonic: "R3" },
  generic: { confirm: "A", cancel: "B", attack: "X", item: "Y", cycle: "RB", cycleBack: "LB", shield: "LT", dodge: "RT", menu: "Start", map: "Select", tonic: "R3" },
};

/** Label for an action: the controller button while a pad is in use, otherwise the keyboard key given. */
export function hint(action: keyof (typeof NAMES)["xbox"], keyboard: string): string {
  return pad.active ? NAMES[pad.kind][action] ?? keyboard : keyboard;
}
export function padName(action: keyof (typeof NAMES)["xbox"]): string {
  return NAMES[pad.kind][action];
}

function cleanName(id: string): string {
  const n = id.replace(/\s*\([^)]*\)\s*/g, " ").replace(/^[0-9a-f]{4}-[0-9a-f]{4}-/i, "").replace(/\s+/g, " ").trim();
  return n || "Controller";
}
function kindOf(id: string): PadKind {
  if (/playstation|dualshock|dualsense|sony|054c|ps[345]\b/i.test(id)) return "ps";
  if (/xbox|xinput|microsoft|045e/i.test(id)) return "xbox";
  return "generic";
}

/* ------------------------------------------------------------------ change listeners (hints redraw) */
const listeners = new Set<() => void>();
export function onPadChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emit(): void { listeners.forEach((f) => f()); }

/* ------------------------------------------------------------------ toast */
let toastEl: HTMLDivElement | null = null;
let toastTimer = 0;
export function padToast(text: string): void {
  if (typeof document === "undefined") return;
  if (!toastEl) {
    toastEl = document.createElement("div");
    toastEl.className = "padtoast";
    toastEl.id = "padtoast";
    toastEl.setAttribute("role", "status");
    toastEl.setAttribute("aria-live", "polite");
    document.body.append(toastEl);
  }
  toastEl.textContent = text;
  toastEl.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl?.classList.remove("show"), 3200);
}

/* ------------------------------------------------------------------ state */
const known = new Set<number>();
let prev: boolean[] = [];
let lastIndex = -1;
const repeatAt: Record<"up" | "down" | "left" | "right", number> = { up: 0, down: 0, left: 0, right: 0 };
const dirsDown: Record<"up" | "down" | "left" | "right", boolean> = { up: false, down: false, left: false, right: false };

function setActive(on: boolean): void {
  if (pad.active === on) return;
  pad.active = on;
  document.body.classList.toggle("pad-ui", on);
  if (!on) { pad.axis.x = 0; pad.axis.y = 0; pad.hold.attack = false; pad.hold.shield = false; }
  emit();
}

function connect(gp: Gamepad): void {
  if (known.has(gp.index)) return;
  known.add(gp.index);
  pad.connected = true;
  pad.id = gp.id;
  pad.kind = kindOf(gp.id);
  lastIndex = gp.index;
  padToast(`Controller connected: ${cleanName(gp.id)}`);
  emit();
}
function disconnect(index: number, id: string): void {
  if (!known.delete(index)) return;
  pad.connected = known.size > 0;
  if (!pad.connected) { setActive(false); pad.id = ""; }
  prev = [];
  padToast(`Controller disconnected${id ? `: ${cleanName(id)}` : ""}`);
  emit();
}

function list(): Gamepad[] {
  let gps: (Gamepad | null)[] = [];
  try { gps = Array.from(navigator.getGamepads?.() ?? []); } catch { /* blocked by permissions policy */ }
  return gps.filter((g): g is Gamepad => !!g && g.connected !== false);
}

/** Radial dead zone with rescaling, so the stick eases in from zero instead of jumping at the edge. */
export function deadzone(x: number, y: number, dz: number): [number, number] {
  const m = Math.hypot(x, y);
  if (m <= dz) return [0, 0];
  const k = Math.min(1, (m - dz) / (1 - dz)) / m;
  return [x * k, y * k];
}

function pressed(b: GamepadButton | undefined): boolean { return !!b && (b.pressed || b.value > 0.5); }

/** DOM focus navigation for the settings panel / sign-in form. Returns true when the DOM is in charge. */
function domNav(edge: (n: string) => boolean): boolean {
  const root = document.getElementById("settings") ?? document.getElementById("auth");
  if (!root) return false;
  const focusable = [...root.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex='-1'])")].filter((n) => !n.hidden && n.offsetParent !== null);
  const cur = document.activeElement as HTMLElement | null;
  const at = cur ? focusable.indexOf(cur) : -1;
  const go = (d: number) => { if (focusable.length) focusable[(at + d + focusable.length * 2) % focusable.length].focus(); };
  const range = cur instanceof HTMLInputElement && cur.type === "range" ? cur : null;
  const nudge = (d: number) => {
    if (!range) return false;
    range.value = String(Math.max(Number(range.min), Math.min(Number(range.max), Number(range.value) + d * (Number(range.step) || 1))));
    range.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  };
  if (edge("up")) go(-1);
  if (edge("down")) go(1);
  if (edge("left") && !nudge(-1)) go(-1);
  if (edge("right") && !nudge(1)) go(1);
  if (edge("confirm") && cur && at >= 0) cur.click();
  if (edge("cancel")) root.querySelector<HTMLElement>(".x, button.cancel")?.click();
  return true;
}

/**
 * Reads the controller once. Called every animation frame by initGamepad; exported so tests can step it.
 * Returns true when a pad was read.
 */
export function pollPad(now = performance.now()): boolean {
  const pads = list();
  // forget pads that vanished without an event
  for (const i of [...known]) if (!pads.some((g) => g.index === i)) disconnect(i, "");
  if (!pads.length) return false;
  for (const g of pads) connect(g);
  // prefer the pad that was used last; otherwise the first standard one
  const gp = pads.find((g) => g.index === lastIndex) ?? pads.find((g) => g.mapping === "standard") ?? pads[0];
  const dz = Math.max(0.05, Math.min(0.6, Number(settings.padDeadzone) || 0.25));
  const btn = (i: number) => pressed(gp.buttons[i]);
  const now2 = gp.buttons.map((_, i) => btn(i));
  const [sx, sy] = deadzone(gp.axes[0] ?? 0, gp.axes[1] ?? 0, dz);
  const dpx = (btn(B.RIGHT) ? 1 : 0) - (btn(B.LEFT) ? 1 : 0);
  const dpy = (btn(B.DOWN) ? 1 : 0) - (btn(B.UP) ? 1 : 0);
  const anyButton = now2.some(Boolean);
  const moved = Math.hypot(sx, sy) > 0 || dpx !== 0 || dpy !== 0;
  if (anyButton || moved) { lastIndex = gp.index; pad.kind = kindOf(gp.id); pad.id = gp.id; setActive(true); }
  if (!pad.active) { prev = now2; return true; }

  // movement vector
  if (dpx !== 0 || dpy !== 0) {
    const n = Math.hypot(dpx, dpy);
    pad.axis.x = dpx / n;
    pad.axis.y = dpy / n;
  } else { pad.axis.x = sx; pad.axis.y = sy; }

  const edge = (i: number) => now2[i] === true && prev[i] !== true;
  // digital directions for menus (D-pad, or the stick past 55%), with repeat
  const want = {
    up: btn(B.UP) || sy < -0.55, down: btn(B.DOWN) || sy > 0.55,
    left: btn(B.LEFT) || sx < -0.55, right: btn(B.RIGHT) || sx > 0.55,
  };
  const dirEdge: Record<string, boolean> = {};
  for (const d of ["up", "down", "left", "right"] as const) {
    let fire = false;
    if (want[d] && !dirsDown[d]) { fire = true; repeatAt[d] = now + 380; }
    else if (want[d] && now >= repeatAt[d]) { fire = true; repeatAt[d] = now + 150; }
    dirsDown[d] = want[d];
    dirEdge[d] = fire;
  }
  const actions: Record<string, boolean> = {
    ...dirEdge, confirm: edge(B.A), cancel: edge(B.B), attack: edge(B.X), item: edge(B.Y), cycle: edge(B.RB), cycleBack: edge(B.LB),
    dodge: edge(B.RT), menu: edge(B.START), map: edge(B.BACK), tonic: edge(B.R3),
  };
  if (domNav((n) => actions[n] === true)) {
    pad.hold.attack = false; pad.hold.shield = false; pad.axis.x = 0; pad.axis.y = 0;
  } else {
    for (const n of Object.keys(actions)) if (actions[n]) vin.press(n as VName);
    pad.hold.attack = btn(B.X);
    pad.hold.shield = btn(B.LT);
  }
  prev = now2;
  return true;
}

export function initGamepad(game?: Phaser.Game): void {
  if (typeof window === "undefined" || typeof navigator === "undefined") return;
  window.addEventListener("gamepadconnected", (e) => {
    const gp = (e as GamepadEvent).gamepad;
    if (gp) connect(gp);
  });
  window.addEventListener("gamepaddisconnected", (e) => {
    const gp = (e as GamepadEvent).gamepad;
    if (gp) disconnect(gp.index, gp.id);
  });
  // keyboard, mouse or touch takes over again
  const takeover = (e: Event) => {
    if (e instanceof KeyboardEvent && ["Shift", "Control", "Alt", "Meta"].includes(e.key)) return;
    if (pad.active) setActive(false);
  };
  window.addEventListener("keydown", takeover, { capture: true, passive: true });
  window.addEventListener("pointerdown", takeover, { capture: true, passive: true });
  const loop = () => {
    try { pollPad(); } catch { /* a misbehaving pad must never stop the game */ }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  void game;
  (window as unknown as { __pad: typeof pad }).__pad = pad;
}
