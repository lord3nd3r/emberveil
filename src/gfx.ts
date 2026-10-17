/**
 * Rendering geometry shared by every scene.
 *
 * Game logic and layout live in "logical" units (a tile is 16x16). Art is drawn at TEX
 * texture pixels per logical unit, and the camera zooms so one logical unit covers
 * view.z device pixels. The canvas always matches the size of its parent element (#game) in device pixels, so the
 * picture is crisp on HiDPI and the visible area (view.w x view.h logical units) grows or
 * shrinks with the window's aspect ratio instead of letterboxing. The zoom is derived from that CSS box and clamped so
 * at least 20 x 14 tiles are always visible; screen.* and a bare devicePixelRatio are never used to pick the zoom.
 */
import Phaser from "phaser";

export const TEX = 4;
/** Texture pixels per logical unit for streamed world chunks (rooms and sprites use TEX). 2 = a quarter of the memory of 4. */
export const CHUNK_TEX = 2;
export const BASE_W = 256;
export const BASE_H = 224;

export const view = { w: BASE_W, h: BASE_H, z: 1, pw: BASE_W, ph: BASE_H, ox: 0, oy: 0, dpr: 1, cw: BASE_W, ch: BASE_H, tilesW: 16, tilesH: 14 };

/** Smallest world area that must always be visible, in logical units (a tile is 16): 20 x 14 tiles. */
export const MIN_VIEW_W = 320;
export const MIN_VIEW_H = 224;
/** CSS pixels per logical unit that the three "View zoom" settings aim for (before the minimum-tiles clamp). */
export const ZOOM_TARGET: Record<"auto" | "closer" | "wider", number> = { auto: 4, closer: 5.25, wider: 3 };

export type ViewZoom = "auto" | "closer" | "wider";
let viewZoomPref: ViewZoom = "auto";
export function setViewZoomPref(v: ViewZoom): boolean {
  if (v === viewZoomPref) return false;
  viewZoomPref = v;
  return true;
}

/** Pure sizing maths (also used by the browser tests): CSS size + reported DPR + preference -> logical view. */
export function computeView(cssW: number, cssH: number, rawDpr: number, pref: ViewZoom = "auto") {
  // Never trust a single number: a hardened browser can report a fixed or odd DPR, and the CSS size can be rounded.
  const dpr = Number.isFinite(rawDpr) && rawDpr > 0 ? Math.min(3, Math.max(1, rawDpr)) : 1;
  const cw = Math.max(160, Math.round(Number.isFinite(cssW) ? cssW : BASE_W));
  const ch = Math.max(160, Math.round(Number.isFinite(cssH) ? cssH : BASE_H));
  const pw = Math.round(cw * dpr);
  const ph = Math.round(ch * dpr);
  // CSS pixels per logical unit: the preferred size, but never so big that fewer than 20 x 14 tiles fit.
  const t = Math.min(ZOOM_TARGET[pref] ?? 4, cw / MIN_VIEW_W, ch / MIN_VIEW_H);
  // Device pixels per unit, snapped down to quarter steps so tiles stay near whole pixels (down = a slightly larger view).
  const z = Math.max(0.25, Math.floor(t * dpr * 4 + 1e-6) / 4);
  const w = pw / z;
  const h = ph / z;
  return { dpr, cw, ch, pw, ph, z, w, h };
}

/** Size of the element the canvas lives in (CSS px). Uses the real layout box, not screen.* or a bare window size. */
function hostSize(): { w: number; h: number } {
  const host = document.getElementById("game");
  const r = host?.getBoundingClientRect();
  if (r && r.width >= 1 && r.height >= 1) return { w: r.width, h: r.height };
  const de = document.documentElement;
  const vv = window.visualViewport;
  return { w: de.clientWidth || vv?.width || window.innerWidth, h: de.clientHeight || vv?.height || window.innerHeight };
}

export function measure(): void {
  const s = hostSize();
  const m = computeView(s.w, s.h, window.devicePixelRatio, viewZoomPref);
  view.dpr = m.dpr;
  view.cw = m.cw;
  view.ch = m.ch;
  view.pw = m.pw;
  view.ph = m.ph;
  view.w = m.w;
  view.h = m.h;
  view.z = m.z;
  view.ox = (m.pw - m.w) / 2; // Phaser zooms about the viewport centre; this puts logical (0,0) at the top-left
  view.oy = (m.ph - m.h) / 2;
  view.tilesW = m.w / 16;
  view.tilesH = m.h / 16;
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

let lastKey = "";
export function applyView(game: Phaser.Game, force = false): void {
  measure();
  const key = `${view.cw}x${view.ch}@${view.dpr}/${view.z}`;
  if (!force && key === lastKey) return;
  lastKey = key;
  game.scale.resize(view.pw, view.ph);
  // Phaser sizes the canvas as backing pixels x zoom; pick the zoom that lands exactly on the CSS box.
  game.scale.setZoom(view.cw / view.pw);
  const cv = game.canvas;
  cv.style.width = `${view.cw}px`;
  cv.style.height = `${view.ch}px`;
  game.events.emit("viewchange");
}

/**
 * Keeps the view in step with the real size of the canvas's parent: ResizeObserver on #game, plus window and
 * visualViewport resizes and DPR changes (browser zoom, moving between monitors). Coalesced to one apply per frame.
 */
export function watchView(game: Phaser.Game): () => void {
  let raf = 0;
  const kick = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; applyView(game); });
  };
  const host = document.getElementById("game");
  const ro = typeof ResizeObserver !== "undefined" && host ? new ResizeObserver(kick) : null;
  if (ro && host) ro.observe(host);
  window.addEventListener("resize", kick);
  window.visualViewport?.addEventListener("resize", kick);
  let mq: MediaQueryList | null = null;
  const watchDpr = () => {
    mq?.removeEventListener?.("change", onDpr);
    try { mq = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`); mq.addEventListener?.("change", onDpr); } catch { mq = null; }
  };
  const onDpr = () => { watchDpr(); kick(); };
  watchDpr();
  // Last resort for browsers that report nothing useful: a cheap poll that only acts when the numbers changed.
  const poll = window.setInterval(() => { measure(); const k = `${view.cw}x${view.ch}@${view.dpr}/${view.z}`; if (k !== lastKey) kick(); }, 1000);
  return () => {
    ro?.disconnect();
    window.removeEventListener("resize", kick);
    window.visualViewport?.removeEventListener("resize", kick);
    mq?.removeEventListener?.("change", onDpr);
    window.clearInterval(poll);
    if (raf) cancelAnimationFrame(raf);
  };
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
