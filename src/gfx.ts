/**
 * Rendering geometry shared by every scene.
 *
 * Game logic and layout live in "logical" units (a tile is 16x16). Art is drawn at TEX
 * texture pixels per logical unit, and the camera zooms so one logical unit covers
 * view.z device pixels. The canvas always matches the window in device pixels, so the
 * picture is crisp on HiDPI and the visible area (view.w x view.h logical units) grows or
 * shrinks with the window's aspect ratio instead of letterboxing.
 */
import Phaser from "phaser";

export const TEX = 4;
/** Texture pixels per logical unit for streamed world chunks (rooms and sprites use TEX). 2 = a quarter of the memory of 4. */
export const CHUNK_TEX = 2;
export const BASE_W = 256;
export const BASE_H = 224;

export const view = { w: BASE_W, h: BASE_H, z: 1, pw: BASE_W, ph: BASE_H, ox: 0, oy: 0, dpr: 1 };

export function measure(): void {
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const cssW = Math.max(240, window.innerWidth);
  const cssH = Math.max(200, window.innerHeight);
  const pw = Math.round(cssW * dpr);
  const ph = Math.round(cssH * dpr);
  const aspect = pw / ph;
  // Roughly 4 CSS pixels per logical unit on big windows, never less than a full 224-high screen.
  let vh = Math.max(BASE_H, Math.round(cssH / 4));
  let vw = vh * aspect;
  if (vw < BASE_W) {
    vw = BASE_W;
    vh = vw / aspect;
  }
  view.dpr = dpr;
  view.pw = pw;
  view.ph = ph;
  view.w = vw;
  view.h = vh;
  view.z = ph / vh;
  view.ox = (pw - vw) / 2;
  view.oy = (ph - vh) / 2;
}

/** Points the main camera at logical top-left (sx, sy). */
export function aim(scene: Phaser.Scene, sx = 0, sy = 0): void {
  scene.cameras.main.setScroll(sx - view.ox, sy - view.oy);
}

export function setupCamera(scene: Phaser.Scene, sx = 0, sy = 0): void {
  const cam = scene.cameras.main;
  cam.setViewport(0, 0, view.pw, view.ph);
  cam.setZoom(view.z);
  cam.roundPixels = false;
  aim(scene, sx, sy);
}

/** Run `fn` whenever the window (and so the logical view) changes, until the scene shuts down. */
export function onViewChange(scene: Phaser.Scene, fn: () => void, keepScroll = false): void {
  const handler = () => {
    const cam = scene.cameras.main;
    const sx = keepScroll ? cam.scrollX + view.ox : 0;
    const sy = keepScroll ? cam.scrollY + view.oy : 0;
    setupCamera(scene, keepScroll ? sx : 0, keepScroll ? sy : 0);
    fn();
  };
  scene.game.events.on("viewchange", handler);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.game.events.off("viewchange", handler));
}

export function applyView(game: Phaser.Game): void {
  measure();
  game.scale.resize(view.pw, view.ph);
  game.scale.setZoom(1 / view.dpr);
  const cv = game.canvas;
  cv.style.width = `${view.pw / view.dpr}px`;
  cv.style.height = `${view.ph / view.dpr}px`;
  game.events.emit("viewchange");
}

/* ------------------------------------------------------------------ colour + random helpers */

export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

export function rgb(hex: string): [number, number, number] {
  if (hex.startsWith("rgb")) {
    const m = hex.match(/\d+/g) ?? ["0", "0", "0"];
    return [Number(m[0]), Number(m[1]), Number(m[2])];
  }
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  return `rgb(${Math.round(r1 + (r2 - r1) * t)},${Math.round(g1 + (g2 - g1) * t)},${Math.round(b1 + (b2 - b1) * t)})`;
}

/** Lighten (t>0) or darken (t<0) towards white / a cool black. */
export function tone(hex: string, t: number): string {
  return t >= 0 ? mix(hex, "#ffffff", t) : mix(hex, "#10102a", -t);
}

export function alpha(hex: string, a: number): string {
  const [r, g, b] = rgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

export function canvasOf(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}
