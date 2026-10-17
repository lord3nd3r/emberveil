import Phaser from "phaser";
import { FONT, fs, WHITE } from "./cast";
import { TEX, canvasOf, view } from "./gfx";

/** Anti-aliased HD text (Inter) with a soft drop shadow and thin outline. */
export function label(
  scene: Phaser.Scene,
  x: number,
  y: number,
  str: string,
  color: string = WHITE,
  wrap = 0,
): Phaser.GameObjects.Text {
  const t = scene.add.text(x, y, str, {
    fontFamily: FONT,
    fontSize: fs(),
    fontStyle: "600",
    color,
    lineSpacing: 4.5,
    wordWrap: wrap ? { width: wrap, useAdvancedWrap: true } : undefined,
    stroke: "#0a0a28",
    strokeThickness: 1.8,
  });
  t.setShadow(0, 1, "rgba(4,4,24,0.95)", 2.4, true, true);
  t.setResolution(Math.min(6, Math.max(3, Math.ceil(view.z))));
  return t;
}

/** Shrinks a label (never grows it) so long strings fit a window instead of spilling out. */
export function fit(t: Phaser.GameObjects.Text, maxW: number): Phaser.GameObjects.Text {
  t.setScale(1);
  if (t.width > maxW) t.setScale(maxW / t.width);
  return t;
}

const PAD = 3;

/**
 * Modern JRPG window: soft vertical gradient, glossy top, double rounded border and a
 * blurred drop shadow, painted at TEX x resolution. (x, y) is the panel's top-left.
 */
export function windowImage(scene: Phaser.Scene, x: number, y: number, w: number, h: number): Phaser.GameObjects.Image {
  const key = `win-${Math.round(w * 4)}x${Math.round(h * 4)}`;
  const tw = w + PAD * 2;
  const th = h + PAD * 2;
  if (!scene.textures.exists(key)) {
    const cv = canvasOf(tw * TEX, th * TEX);
    const c = cv.getContext("2d")!;
    c.scale(TEX, TEX);
    const r = Math.min(4, h / 3);
    c.save();
    c.shadowColor = "rgba(4,4,24,0.65)";
    c.shadowBlur = 2.6 * TEX;
    c.shadowOffsetY = 1.1 * TEX;
    c.fillStyle = "#101a60";
    c.beginPath();
    c.roundRect(PAD, PAD, w, h, r);
    c.fill();
    c.restore();
    const g = c.createLinearGradient(0, PAD, 0, PAD + h);
    g.addColorStop(0, "#3b5fd2");
    g.addColorStop(0.5, "#1f3598");
    g.addColorStop(1, "#0d1666");
    c.fillStyle = g;
    c.beginPath();
    c.roundRect(PAD, PAD, w, h, r);
    c.fill();
    // gloss
    c.save();
    c.beginPath();
    c.roundRect(PAD + 0.6, PAD + 0.6, w - 1.2, h - 1.2, r - 0.4);
    c.clip();
    const gl = c.createLinearGradient(0, PAD, 0, PAD + h * 0.5);
    gl.addColorStop(0, "rgba(255,255,255,0.20)");
    gl.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = gl;
    c.fillRect(PAD, PAD, w, h * 0.5);
    const vg = c.createLinearGradient(0, PAD + h * 0.7, 0, PAD + h);
    vg.addColorStop(0, "rgba(0,0,30,0)");
    vg.addColorStop(1, "rgba(0,0,30,0.35)");
    c.fillStyle = vg;
    c.fillRect(PAD, PAD + h * 0.7, w, h * 0.3);
    c.restore();
    // borders
    c.strokeStyle = "#f4f7ff";
    c.lineWidth = 0.9;
    c.beginPath();
    c.roundRect(PAD + 0.45, PAD + 0.45, w - 0.9, h - 0.9, r);
    c.stroke();
    c.strokeStyle = "rgba(150,164,226,0.9)";
    c.lineWidth = 0.6;
    c.beginPath();
    c.roundRect(PAD + 1.5, PAD + 1.5, w - 3, h - 3, Math.max(0.5, r - 1));
    c.stroke();
    c.strokeStyle = "rgba(0,0,40,0.55)";
    c.lineWidth = 0.5;
    c.beginPath();
    c.roundRect(PAD - 0.1, PAD - 0.1, w + 0.2, h + 0.2, r + 0.1);
    c.stroke();
    scene.textures.addCanvas(key, cv)!.setFilter(Phaser.Textures.FilterMode.LINEAR);
  }
  return scene.add
    .image(x, y, key)
    .setOrigin(PAD / tw, PAD / th)
    .setScale(1 / TEX);
}

/** Pointing glove and bobbing arrow, drawn once at boot. */
export function buildUiTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists("hand")) return;
  {
    const cv = canvasOf(14 * TEX, 10 * TEX);
    const c = cv.getContext("2d")!;
    c.scale(TEX, TEX);
    c.translate(1, 1);
    c.lineJoin = "round";
    c.fillStyle = "#fbfbff";
    c.strokeStyle = "#1a1226";
    c.lineWidth = 0.9;
    c.beginPath();
    c.moveTo(0.4, 2);
    c.quadraticCurveTo(0.4, 0.4, 2.2, 0.4);
    c.lineTo(5.6, 0.4);
    c.quadraticCurveTo(6.4, 0.4, 6.6, 1.2);
    c.lineTo(11, 3.4);
    c.quadraticCurveTo(12.2, 4, 11, 4.8);
    c.lineTo(6.6, 6.8);
    c.quadraticCurveTo(6.2, 8, 4.8, 8);
    c.lineTo(2.2, 8);
    c.quadraticCurveTo(0.4, 8, 0.4, 6.4);
    c.closePath();
    c.fill();
    c.stroke();
    const g = c.createLinearGradient(0, 0, 0, 8);
    g.addColorStop(0, "rgba(255,255,255,0.9)");
    g.addColorStop(1, "rgba(150,160,210,0.45)");
    c.fillStyle = g;
    c.fill();
    c.strokeStyle = "rgba(26,18,38,0.5)";
    c.lineWidth = 0.4;
    c.beginPath();
    c.moveTo(3, 2.6);
    c.lineTo(6.2, 2.6);
    c.moveTo(3, 4.6);
    c.lineTo(6.2, 4.6);
    c.stroke();
    scene.textures.addCanvas("hand", cv)!.setFilter(Phaser.Textures.FilterMode.LINEAR);
  }
  {
    const cv = canvasOf(9 * TEX, 6 * TEX);
    const c = cv.getContext("2d")!;
    c.scale(TEX, TEX);
    c.translate(1, 0.8);
    c.lineJoin = "round";
    c.beginPath();
    c.moveTo(0.4, 0.4);
    c.lineTo(6.6, 0.4);
    c.lineTo(3.5, 4.4);
    c.closePath();
    const g = c.createLinearGradient(0, 0, 0, 4.4);
    g.addColorStop(0, "#fff6c0");
    g.addColorStop(1, "#f0b830");
    c.fillStyle = g;
    c.fill();
    c.strokeStyle = "#1a1226";
    c.lineWidth = 0.8;
    c.stroke();
    scene.textures.addCanvas("arrow", cv)!.setFilter(Phaser.Textures.FilterMode.LINEAR);
  }
  {
    // iris-wipe mask: opaque everywhere except a soft-edged hole in the middle
    const S = 1024;
    const cv = canvasOf(S, S);
    const c = cv.getContext("2d")!;
    c.fillStyle = "#06061a";
    c.fillRect(0, 0, S, S);
    c.globalCompositeOperation = "destination-out";
    const g = c.createRadialGradient(S / 2, S / 2, 40, S / 2, S / 2, 78);
    g.addColorStop(0, "rgba(0,0,0,1)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, S, S);
    scene.textures.addCanvas("iris", cv)!.setFilter(Phaser.Textures.FilterMode.LINEAR);
  }
}

const ease = (t: number) => t * t * (3 - 2 * t);

/**
 * Screen transition: a smooth iris that closes ("out") or opens ("in") with a soft fade at
 * the very end, covering the whole window at any aspect ratio.
 */
export function wipe(scene: Phaser.Scene, mode: "in" | "out", done?: () => void, ms = 520): void {
  const cx = view.ox + view.w / 2;
  const cy = view.oy + view.h / 2;
  const iris = scene.add.image(cx, cy, "iris").setScrollFactor(0).setDepth(100000);
  const cover = scene.add.rectangle(cx, cy, view.pw * 2, view.ph * 2, 0x06061a, 1).setScrollFactor(0).setDepth(100000);
  const big = (Math.hypot(view.w, view.h) / 2 + 12) / 40; // hole radius is ~52px of the 1024 texture
  const state = { p: mode === "out" ? 0 : 1 };
  const draw = () => {
    const e = ease(state.p);
    const holeScale = big * (1 - e) + 0.02;
    iris.setScale(holeScale);
    iris.setVisible(state.p < 0.995);
    cover.setAlpha(Math.max(0, (state.p - 0.82) / 0.18));
    cover.setVisible(state.p > 0.82);
  };
  draw();
  scene.tweens.add({
    targets: state,
    p: mode === "out" ? 1 : 0,
    duration: ms,
    ease: "Linear",
    onUpdate: draw,
    onComplete: () => {
      if (mode === "in") {
        iris.destroy();
        cover.destroy();
      }
      done?.();
    },
  });
}

/**
 * Mouse helper: hover/click zone. Pass fixed=true for zones inside screen-fixed (scroll
 * factor 0) containers.
 */
export function zone(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  onOver: () => void,
  onClick: () => void,
  fixed = false,
): Phaser.GameObjects.Zone {
  const z = scene.add.zone(x, y, w, h).setOrigin(0, 0).setInteractive({ useHandCursor: true });
  if (fixed) z.setScrollFactor(0);
  z.on("pointerover", onOver);
  z.on("pointerdown", (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
    ev.stopPropagation();
    onClick();
  });
  return z;
}

let live: HTMLElement | null = null;

/** Speaks a short description through a polite live region, so menus drawn on the canvas are still readable by assistive tech. */
export function announce(text: string): void {
  if (typeof document === "undefined") return;
  if (!live) {
    live = document.createElement("div");
    live.id = "sr-live";
    live.setAttribute("role", "status");
    live.setAttribute("aria-live", "polite");
    live.setAttribute("aria-label", "Game menu announcements");
    const st = live.style;
    st.position = "absolute";
    st.width = "1px";
    st.height = "1px";
    st.overflow = "hidden";
    st.clip = "rect(0 0 0 0)";
    st.whiteSpace = "nowrap";
    document.body.appendChild(live);
  }
  const clean = text.replace(/\s+/g, " ").trim();
  if (live.textContent !== clean) live.textContent = clean;
}
