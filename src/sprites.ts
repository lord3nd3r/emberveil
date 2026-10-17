/** Procedural sprite painters. Every texture is drawn once at TEX x resolution from canvas calls; no image files. */
import Phaser from "phaser";
import { TEX, canvasOf } from "./gfx";
import { NPCS } from "./sim/data";
import type { Dir } from "./sim/types";

type Ctx = CanvasRenderingContext2D;
export const SPR = 32; // logical sprite canvas size
export const FOOT = 28; // y of the foot line inside a sprite canvas

function make(scene: Phaser.Scene, key: string, w: number, h: number, paint: (c: Ctx) => void): void {
  if (scene.textures.exists(key)) return;
  const cv = canvasOf(w * TEX, h * TEX);
  const c = cv.getContext("2d")!;
  c.scale(TEX, TEX);
  paint(c);
  scene.textures.addCanvas(key, cv)!.setFilter(Phaser.Textures.FilterMode.LINEAR);
}
const R = (c: Ctx, x: number, y: number, w: number, h: number, col: string) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
const E = (c: Ctx, x: number, y: number, rx: number, ry: number, col: string) => { c.fillStyle = col; c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.fill(); };
const RR = (c: Ctx, x: number, y: number, w: number, h: number, r: number, col: string) => { c.fillStyle = col; c.beginPath(); c.roundRect(x, y, w, h, r); c.fill(); };
const shadow = (c: Ctx, cx: number, rx: number) => E(c, cx, FOOT, rx, rx * 0.36, "rgba(0,0,0,0.28)");

export interface Look { skin: string; hair: string; cloth: string; trim: string; kind?: "person" | "hen" }
export const REN: Look = { skin: "#e8b88c", hair: "#a2482a", cloth: "#2f6f78", trim: "#ff8a3d" };

function person(c: Ctx, look: Look, dir: Dir, frame: number, extra = ""): void {
  shadow(c, 16, 6.5);
  const step = frame === 1 ? 1 : frame === 2 ? -1 : 0;
  const side = dir === "left" || dir === "right";
  const flip = dir === "right";
  c.save();
  if (flip) { c.translate(SPR, 0); c.scale(-1, 1); }
  // legs
  const legC = "#3a3050";
  if (side) { R(c, 13, 23 + (step > 0 ? -1 : 0), 3, 5 + (step > 0 ? 1 : 0), legC); R(c, 16, 23 + (step < 0 ? -1 : 0), 3, 5 + (step < 0 ? 1 : 0), legC); }
  else { R(c, 12.5, 23 - (step > 0 ? 1 : 0), 3.4, 5 + (step > 0 ? 1 : 0), legC); R(c, 16.1, 23 - (step < 0 ? 1 : 0), 3.4, 5 + (step < 0 ? 1 : 0), legC); }
  R(c, 12.5, 27, 3.4, 1.4, "#241c34"); R(c, 16.1, 27, 3.4, 1.4, "#241c34");
  // body
  RR(c, 11.5, 14.5, 9, 10, 2, look.cloth);
  R(c, 11.5, 21, 9, 1.6, look.trim);
  R(c, 11.5, 14.5, 9, 1.2, "rgba(255,255,255,0.16)");
  // arms
  if (side) { RR(c, 14, 16, 4, 6, 1.5, look.cloth); R(c, 14.4, 21, 3.2, 1.6, look.skin); }
  else { RR(c, 9.5, 15.5, 2.8, 6, 1.2, look.cloth); RR(c, 19.7, 15.5, 2.8, 6, 1.2, look.cloth); R(c, 9.6, 21, 2.6, 1.6, look.skin); R(c, 19.8, 21, 2.6, 1.6, look.skin); }
  // neck scarf
  R(c, 12.5, 14, 7, 2.2, look.trim);
  // head
  E(c, 16, 10.5, 5.2, 5.2, look.skin);
  if (dir === "up") { E(c, 16, 10.2, 5.4, 5.3, look.hair); R(c, 11, 12, 10, 2, look.hair); }
  else if (dir === "down") {
    c.fillStyle = look.hair; c.beginPath(); c.ellipse(16, 8.6, 5.6, 4, 0, Math.PI, 0); c.fill(); R(c, 10.4, 8.4, 2, 4, look.hair); R(c, 19.6, 8.4, 2, 4, look.hair);
    R(c, 13, 11, 1.4, 1.8, "#241830"); R(c, 17.6, 11, 1.4, 1.8, "#241830"); R(c, 14.8, 14, 2.4, 0.7, "rgba(160,60,50,0.7)");
  } else {
    c.fillStyle = look.hair; c.beginPath(); c.ellipse(16.4, 8.6, 5.6, 4.2, 0, Math.PI, 0); c.fill(); R(c, 16.6, 8.4, 4.8, 5, look.hair);
    R(c, 12.4, 11, 1.5, 1.9, "#241830");
  }
  if (extra === "hood") { E(c, 16, 9, 6.2, 5, look.cloth); R(c, 13, 10, 6, 3, look.skin); }
  c.restore();
}

function hen(c: Ctx, frame: number): void {
  shadow(c, 16, 6);
  E(c, 16, 21, 6.4, 5.2, "#fffbe8"); E(c, 13, 20, 3.4, 3, "#f0e8cc"); R(c, 14.5, 25, 1, 3 + frame * 0.6, "#e8a03a"); R(c, 17.5, 25, 1, 3 - frame * 0.6, "#e8a03a");
  E(c, 21.5, 15.5, 3.2, 3.4, "#fffbe8"); R(c, 24, 15.4, 2.6, 1.6, "#f0a030"); R(c, 21.3, 11.6, 1.6, 2.4, "#e0503a"); R(c, 22.4, 14.2, 1.1, 1.1, "#241830");
  c.fillStyle = "#fffbe8"; c.beginPath(); c.moveTo(10, 20); c.lineTo(7, 15); c.lineTo(11, 17); c.fill();
}

function enemy(c: Ctx, kind: string, f: number): void {
  switch (kind) {
    case "slime": {
      shadow(c, 16, 6.6);
      const sq = f ? 1.1 : 0;
      E(c, 16, 22.5 + sq, 7.2 + sq * 0.8, 5.6 - sq, "#2e8a66"); E(c, 16, 21.5 + sq, 6.4 + sq * 0.7, 4.8 - sq, "#4cc08a"); E(c, 13.4, 19.4 + sq, 2.4, 1.4, "#a8f0c8");
      R(c, 12.4, 21.4 + sq, 1.8, 2.4, "#10281e"); R(c, 17.6, 21.4 + sq, 1.8, 2.4, "#10281e");
      return;
    }
    case "bat": {
      const up = f ? -3 : 2;
      c.fillStyle = "#3a2a5a"; c.beginPath(); c.moveTo(16, 16); c.quadraticCurveTo(8, 13 + up, 2, 15 + up * 1.5); c.quadraticCurveTo(7, 19, 10, 18); c.quadraticCurveTo(12, 21, 16, 19); c.fill();
      c.beginPath(); c.moveTo(16, 16); c.quadraticCurveTo(24, 13 + up, 30, 15 + up * 1.5); c.quadraticCurveTo(25, 19, 22, 18); c.quadraticCurveTo(20, 21, 16, 19); c.fill();
      E(c, 16, 17, 4, 4.4, "#54407a"); R(c, 12.4, 12.6, 2, 3, "#54407a"); R(c, 17.6, 12.6, 2, 3, "#54407a");
      R(c, 13.4, 16.4, 1.6, 1.6, "#ff5a4a"); R(c, 17, 16.4, 1.6, 1.6, "#ff5a4a");
      E(c, 16, FOOT, 4, 1.4, "rgba(0,0,0,0.2)");
      return;
    }
    case "crab": {
      shadow(c, 16, 8);
      const o = f ? 1.5 : 0;
      RR(c, 7, 18, 18, 8, 4, "#a8381e"); RR(c, 8, 17, 16, 7, 3.4, "#d8602a"); R(c, 10, 18, 12, 1.4, "#f0905a");
      E(c, 6 - o, 17 - o, 3.6, 3, "#d8602a"); R(c, 3.6 - o, 15 - o, 2, 2, "#10101a"); E(c, 26 + o, 17 - o, 3.6, 3, "#d8602a"); R(c, 26.4 + o, 15 - o, 2, 2, "#10101a");
      R(c, 12, 14, 1.4, 3, "#f0e0d0"); R(c, 18.6, 14, 1.4, 3, "#f0e0d0"); R(c, 12, 13.4, 1.4, 1.4, "#10101a"); R(c, 18.6, 13.4, 1.4, 1.4, "#10101a");
      R(c, 6, 26, 1.4, 2, "#a8381e"); R(c, 24.6, 26, 1.4, 2, "#a8381e");
      return;
    }
    case "wisp": {
      const fl = f ? 1 : 0;
      E(c, 16, FOOT, 4, 1.4, "rgba(0,0,0,0.18)");
      const g = c.createRadialGradient(16, 17, 1, 16, 17, 10); g.addColorStop(0, "rgba(255,230,160,0.9)"); g.addColorStop(1, "rgba(255,120,40,0)"); c.fillStyle = g; c.fillRect(4, 5, 24, 24);
      c.fillStyle = "#ff7a2a"; c.beginPath(); c.moveTo(16, 6 - fl); c.quadraticCurveTo(24, 15, 21, 21); c.quadraticCurveTo(16, 25, 11, 21); c.quadraticCurveTo(8, 15, 16, 6 - fl); c.fill();
      c.fillStyle = "#ffd060"; c.beginPath(); c.moveTo(16, 11); c.quadraticCurveTo(20.5, 17, 18.6, 21); c.quadraticCurveTo(16, 23, 13.4, 21); c.quadraticCurveTo(11.5, 17, 16, 11); c.fill();
      R(c, 13.4, 17, 1.6, 2.4, "#3a1a10"); R(c, 17, 17, 1.6, 2.4, "#3a1a10");
      return;
    }
    case "soldier": {
      shadow(c, 16, 7);
      R(c, 12, 23, 3.6, 5, "#3a3a4a"); R(c, 16.4, 23, 3.6, 5, "#3a3a4a");
      RR(c, 10.5, 14, 11, 11, 2, "#5a5e78"); R(c, 10.5, 20, 11, 1.6, "#2a2c3c"); R(c, 10.5, 14, 11, 1.2, "#8a90b0");
      RR(c, 9, 14, 3, 7, 1, "#4a4e68"); RR(c, 20, 14, 3, 7, 1, "#4a4e68");
      E(c, 16, 10.4, 5.4, 5.6, "#6a6e8a"); R(c, 11, 9.6, 10, 2.4, "#10101a"); R(c, 13, 9.8, 1.6, 1.6, "#ff5a4a"); R(c, 17.4, 9.8, 1.6, 1.6, "#ff5a4a"); R(c, 15.4, 3.8, 1.2, 3, "#b84a3a");
      R(c, 24, 6 + f, 1.6, 20, "#7a5a38"); c.fillStyle = "#c8ccd8"; c.beginPath(); c.moveTo(24.8, 3 + f); c.lineTo(27, 8 + f); c.lineTo(22.6, 8 + f); c.fill();
      return;
    }
    case "thornling": {
      shadow(c, 16, 6);
      const sw = f ? 1.2 : 0;
      E(c, 16, 22, 6.2, 5.4, "#3a6a2a"); E(c, 16, 21, 5.4, 4.6, "#5aa03a");
      for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i - 2) * 0.55; c.fillStyle = "#c83a58"; c.beginPath(); c.moveTo(16, 18); c.lineTo(16 + Math.cos(a) * (9 + sw), 14 + Math.sin(a) * (9 + sw)); c.lineTo(16 + Math.cos(a + 0.28) * 5, 16 + Math.sin(a + 0.28) * 5); c.fill(); }
      R(c, 13, 20, 1.8, 2.4, "#1a2a10"); R(c, 17.4, 20, 1.8, 2.4, "#1a2a10"); R(c, 14.2, 24, 3.6, 1.2, "#e8f0c0");
      return;
    }
    case "beetle": {
      shadow(c, 16, 8);
      const o = f ? 1.2 : 0;
      R(c, 7, 22, 2, 4 + o, "#1a1a3a"); R(c, 23, 22, 2, 4 - o, "#1a1a3a"); R(c, 6, 17, 2, 3, "#1a1a3a"); R(c, 24, 17, 2, 3, "#1a1a3a");
      E(c, 16, 20, 9, 7.5, "#243a78"); E(c, 16, 19, 8, 6.4, "#3a5ab0"); R(c, 15.4, 12, 1.2, 14, "#1a2a58"); E(c, 12.6, 16.6, 2.6, 1.5, "#8aa8f0");
      E(c, 16, 12, 4, 3.4, "#1a2a58"); c.fillStyle = "#e8d8a0"; c.beginPath(); c.moveTo(16, 3); c.lineTo(18, 10); c.lineTo(14, 10); c.fill();
      R(c, 13.4, 11.4, 1.4, 1.4, "#ff6a4a"); R(c, 17.2, 11.4, 1.4, 1.4, "#ff6a4a");
      return;
    }
    case "skipper": {
      shadow(c, 16, 6);
      const sq = f ? 2 : 0;
      E(c, 16, 21 - sq, 6, 5 + sq * 0.2, "#c8a04a"); E(c, 16, 20 - sq, 5, 4, "#e8c870"); E(c, 13.6, 18 - sq, 2, 1.2, "#fff0b0");
      R(c, 10.6, 24 - sq, 1.6, 4 + sq, "#9a7a30"); R(c, 19.8, 24 - sq, 1.6, 4 + sq, "#9a7a30");
      R(c, 12.2, 18.4 - sq, 1.6, 2.2, "#2a1a08"); R(c, 17.4, 18.4 - sq, 1.6, 2.2, "#2a1a08");
      return;
    }
    case "mirefly": {
      const fl = f ? 2 : -1;
      E(c, 16, FOOT, 3, 1.2, "rgba(0,0,0,0.16)");
      const g = c.createRadialGradient(16, 17, 1, 16, 17, 9); g.addColorStop(0, "rgba(170,255,220,0.85)"); g.addColorStop(1, "rgba(60,200,160,0)"); c.fillStyle = g; c.fillRect(5, 6, 22, 22);
      c.fillStyle = "rgba(200,255,240,0.75)"; c.beginPath(); c.ellipse(11, 14 + fl, 5, 2.4, -0.5, 0, Math.PI * 2); c.fill(); c.beginPath(); c.ellipse(21, 14 + fl, 5, 2.4, 0.5, 0, Math.PI * 2); c.fill();
      E(c, 16, 18, 3.2, 3.8, "#3aa88a"); R(c, 14.6, 17, 1.2, 1.2, "#0a2a20"); R(c, 17.2, 17, 1.2, 1.2, "#0a2a20");
      return;
    }
    case "archer": {
      shadow(c, 16, 7);
      R(c, 12, 23, 3.6, 5, "#3a3a4a"); R(c, 16.4, 23, 3.6, 5, "#3a3a4a");
      RR(c, 10.5, 14, 11, 11, 2, "#6a5a48"); R(c, 10.5, 20, 11, 1.6, "#3a2c20"); R(c, 10.5, 14, 11, 1.2, "#a08a68");
      E(c, 16, 10.4, 5.4, 5.6, "#5a4a3a"); R(c, 11, 9.6, 10, 2.4, "#10101a"); R(c, 13, 9.8, 1.6, 1.6, "#ffd05a"); R(c, 17.4, 9.8, 1.6, 1.6, "#ffd05a");
      c.strokeStyle = "#8a5a2a"; c.lineWidth = 1.6; c.beginPath(); c.arc(25, 16, 8, -1.2, 1.2); c.stroke(); c.strokeStyle = "#d8d0b0"; c.lineWidth = 0.6; c.beginPath(); c.moveTo(25 + Math.cos(-1.2) * 8, 16 + Math.sin(-1.2) * 8); c.lineTo(25 + Math.cos(1.2) * 8 - f * 1.6, 16 + Math.sin(1.2) * 8); c.stroke();
      return;
    }
    case "rootknight": {
      E(c, 20, 38, 10, 3.6, "rgba(0,0,0,0.28)");
      R(c, 14, 31, 5, 7, "#2a3a20"); R(c, 22, 31, 5, 7, "#2a3a20");
      RR(c, 11, 17, 18, 17, 3, "#4a6a3a"); R(c, 11, 28, 18, 2, "#243a1c"); R(c, 11, 17, 18, 1.6, "#8ab070"); R(c, 18, 19, 4, 11, "#7a4a28");
      RR(c, 7, 18, 5, 10, 1.6, "#5a7a46"); RR(c, 28, 18, 5, 10, 1.6, "#5a7a46");
      E(c, 20, 12.6, 7.4, 7.6, "#6a8a54"); R(c, 13.6, 11.4, 12.8, 3, "#0a1208"); R(c, 16, 11.8, 2, 2, "#ffd84a"); R(c, 22, 11.8, 2, 2, "#ffd84a");
      c.strokeStyle = "#7a5030"; c.lineWidth = 1.8; for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(14 + i * 6, 6); c.quadraticCurveTo(12 + i * 8, 1 + f, 16 + i * 6, -1 + f); c.stroke(); }
      return;
    }
    case "cloudmarshal": {
      E(c, 20, 38, 10, 3.6, "rgba(0,0,0,0.28)");
      R(c, 14, 31, 5, 7, "#2a3446"); R(c, 22, 31, 5, 7, "#2a3446");
      RR(c, 11, 17, 18, 17, 3, "#5a7aa8"); R(c, 11, 28, 18, 2, "#2c3e5c"); R(c, 11, 17, 18, 1.6, "#a8c8f0"); R(c, 18, 19, 4, 11, "#e8d878");
      RR(c, 7, 18, 5, 10, 1.6, "#6a8ab8"); RR(c, 28, 18, 5, 10, 1.6, "#6a8ab8");
      E(c, 20, 12.6, 7.4, 7.6, "#7a9ac8"); R(c, 13.6, 11.4, 12.8, 3, "#0a1020"); R(c, 16, 11.8, 2, 2, "#8affff"); R(c, 22, 11.8, 2, 2, "#8affff");
      c.fillStyle = "#e8f0ff"; c.beginPath(); c.moveTo(14, 6); c.lineTo(8, 0 + f); c.lineTo(17, 4); c.fill(); c.beginPath(); c.moveTo(26, 6); c.lineTo(32, 0 + f); c.lineTo(23, 4); c.fill();
      c.strokeStyle = "#8a5a2a"; c.lineWidth = 1.6; c.beginPath(); c.arc(33, 22, 8, -1.3, 1.3); c.stroke();
      return;
    }
    case "stormfinch": {
      const fl = f ? 4 : 0;
      E(c, 28, 50, 14, 4, "rgba(0,0,0,0.22)");
      c.fillStyle = "#2a4a78"; c.beginPath(); c.moveTo(28, 18); c.quadraticCurveTo(2, 8 - fl, 0, 30 - fl); c.quadraticCurveTo(14, 26, 22, 34); c.fill();
      c.beginPath(); c.moveTo(28, 18); c.quadraticCurveTo(54, 8 - fl, 56, 30 - fl); c.quadraticCurveTo(42, 26, 34, 34); c.fill();
      c.fillStyle = "#4a7ab8"; c.beginPath(); c.moveTo(28, 20); c.quadraticCurveTo(8, 14 - fl, 6, 28 - fl); c.quadraticCurveTo(16, 26, 23, 32); c.fill();
      c.beginPath(); c.moveTo(28, 20); c.quadraticCurveTo(48, 14 - fl, 50, 28 - fl); c.quadraticCurveTo(40, 26, 33, 32); c.fill();
      E(c, 28, 30, 9, 12, "#3a5a98"); E(c, 28, 33, 6, 8, "#e8d890");
      E(c, 28, 17, 6.4, 6, "#4a7ab8"); R(c, 24, 14.6, 2, 2.4, "#fff8a0"); R(c, 30, 14.6, 2, 2.4, "#fff8a0");
      c.fillStyle = "#f0a830"; c.beginPath(); c.moveTo(25, 18); c.lineTo(28, 25); c.lineTo(31, 18); c.fill();
      c.fillStyle = "#e8587a"; c.beginPath(); c.moveTo(28, 11); c.lineTo(25, 3); c.lineTo(31, 3); c.fill();
      R(c, 24, 42, 2, 7, "#f0a830"); R(c, 30, 42, 2, 7, "#f0a830");
      return;
    }
    case "barkwarden": {
      const ar = f ? 2 : 0;
      E(c, 28, 50, 20, 6, "rgba(0,0,0,0.25)");
      R(c, 14, 40, 8, 12, "#4a3220"); R(c, 34, 40, 8, 12, "#4a3220");
      c.fillStyle = "#6a4a30"; c.beginPath(); c.moveTo(10, 44); c.quadraticCurveTo(8, 14, 28, 8); c.quadraticCurveTo(48, 14, 46, 44); c.fill();
      c.fillStyle = "#8a6a44"; c.beginPath(); c.moveTo(15, 42); c.quadraticCurveTo(14, 18, 28, 13); c.quadraticCurveTo(42, 18, 41, 42); c.fill();
      for (let i = 0; i < 5; i++) R(c, 16 + i * 5, 20 + (i % 2) * 6, 1.4, 8, "#5a3e24");
      c.strokeStyle = "#5a7a34"; c.lineWidth = 3; c.beginPath(); c.moveTo(11, 24); c.quadraticCurveTo(2, 20 - ar, 3, 32 + ar); c.stroke(); c.beginPath(); c.moveTo(45, 24); c.quadraticCurveTo(54, 20 - ar, 53, 32 + ar); c.stroke();
      for (const [x, y] of [[10, 12], [44, 10], [24, 6], [34, 6]]) { E(c, x, y, 4.4, 3.8, "#5aa03a"); E(c, x, y - 1, 2.4, 2, "#e8587a"); }
      E(c, 21, 26, 3.2, 3.6, "#ffe06a"); E(c, 35, 26, 3.2, 3.6, "#ffe06a"); R(c, 20.4, 24.8, 1.6, 3.6, "#1a1008"); R(c, 34.4, 24.8, 1.6, 3.6, "#1a1008");
      R(c, 20, 35, 16, 3, "#2a1608"); for (let i = 0; i < 5; i++) R(c, 21 + i * 3, 35, 1.4, 2, "#e8e0b8");
      return;
    }
    case "marshal": {
      E(c, 20, 38, 10, 3.6, "rgba(0,0,0,0.28)");
      R(c, 14, 31, 5, 7, "#2a2a38"); R(c, 22, 31, 5, 7, "#2a2a38");
      RR(c, 11, 17, 18, 17, 3, "#4a4e6a"); R(c, 11, 28, 18, 2, "#242636"); R(c, 11, 17, 18, 1.6, "#8a90b4"); R(c, 18, 19, 4, 11, "#8a2a2a");
      RR(c, 7, 18, 5, 10, 1.6, "#5a5e7a"); RR(c, 28, 18, 5, 10, 1.6, "#5a5e7a");
      E(c, 20, 12.6, 7.4, 7.6, "#6a6e8e"); R(c, 13.6, 11.4, 12.8, 3, "#0a0a12"); R(c, 16, 11.8, 2, 2, "#ff4a3a"); R(c, 22, 11.8, 2, 2, "#ff4a3a");
      c.fillStyle = "#b8302a"; c.beginPath(); c.moveTo(20, 1); c.quadraticCurveTo(28, 2 + f, 25, 9); c.lineTo(20, 6); c.fill();
      return;
    }
    case "sluicejaw": {
      const open = f ? 7 : 2;
      E(c, 28, 50, 20, 6, "rgba(0,0,0,0.25)");
      // body
      c.fillStyle = "#1f5a78"; c.beginPath(); c.moveTo(6, 52); c.quadraticCurveTo(4, 24, 28, 14); c.quadraticCurveTo(52, 24, 50, 52); c.fill();
      c.fillStyle = "#2f8aa8"; c.beginPath(); c.moveTo(11, 50); c.quadraticCurveTo(10, 28, 28, 19); c.quadraticCurveTo(46, 28, 45, 50); c.fill();
      for (let i = 0; i < 5; i++) { R(c, 12 + i * 7, 26 + (i % 2) * 5, 4, 1.4, "#6ac8e0"); }
      // jaws
      c.fillStyle = "#e8f0f4"; for (let i = 0; i < 6; i++) { c.beginPath(); c.moveTo(14 + i * 5.6, 36); c.lineTo(16.8 + i * 5.6, 36 + open * 0.55); c.lineTo(19.6 + i * 5.6, 36); c.fill(); }
      R(c, 12, 36, 32, open, "#3a0a18"); R(c, 12, 36 + open, 32, 2.4, "#1f5a78");
      c.fillStyle = "#e8f0f4"; for (let i = 0; i < 6; i++) { c.beginPath(); c.moveTo(14 + i * 5.6, 36 + open); c.lineTo(16.8 + i * 5.6, 36 + open - 3.4); c.lineTo(19.6 + i * 5.6, 36 + open); c.fill(); }
      E(c, 19, 24, 3, 3.4, "#fff2a0"); E(c, 37, 24, 3, 3.4, "#fff2a0"); R(c, 18.4, 22.8, 1.6, 3.4, "#201010"); R(c, 36.4, 22.8, 1.6, 3.4, "#201010");
      c.fillStyle = "#6ac8e0"; c.beginPath(); c.moveTo(28, 14); c.lineTo(24, 4); c.lineTo(32, 4); c.fill();
      return;
    }
  }
}

function chest(c: Ctx, big: boolean, openState: boolean): void {
  const w = big ? 28 : 14;
  const ox = big ? 2 : 9;
  E(c, ox + w / 2, FOOT - 1, w / 2 + 1, 2.4, "rgba(0,0,0,0.3)");
  const body = big ? "#6a4a8a" : "#9a6a3a", dark = big ? "#3e2858" : "#5e3c1e", light = big ? "#a47ac8" : "#c8924e", trim = "#f2c85a";
  RR(c, ox, 16, w, 11, 1.6, dark); R(c, ox + 0.8, 17, w - 1.6, 9, body);
  if (openState) { RR(c, ox, 8, w, 8, 1.6, dark); R(c, ox + 0.8, 9, w - 1.6, 6, "#241a30"); R(c, ox + 1, 7, w - 2, 2, light); R(c, ox + 0.8, 17, w - 1.6, 2, "#f4e0a0"); }
  else { RR(c, ox, 10, w, 8, 2.4, dark); R(c, ox + 0.8, 11, w - 1.6, 6, light); R(c, ox + 0.8, 11, w - 1.6, 1.2, "rgba(255,255,255,0.3)"); }
  R(c, ox + w / 2 - 1.5, 15, 3, 5, trim); R(c, ox + w / 2 - 0.6, 17, 1.2, 1.8, "#7a5a10");
  R(c, ox, 22, w, 1, trim); if (big) { R(c, ox + 4, 12, 1.4, 14, trim); R(c, ox + w - 5.4, 12, 1.4, 14, trim); }
}

function sign(c: Ctx): void {
  E(c, 16, FOOT - 1, 6, 2, "rgba(0,0,0,0.28)");
  R(c, 15, 19, 2, 9, "#6a4a2c"); RR(c, 7, 9, 18, 11, 1.6, "#7d5833"); RR(c, 8, 10, 16, 9, 1.2, "#c79a62");
  R(c, 10, 12.4, 12, 1, "#7d5833"); R(c, 10, 15, 9, 1, "#7d5833");
}
function bush(c: Ctx, cut: boolean): void {
  E(c, 16, FOOT - 1, 7.4, 2.4, "rgba(0,0,0,0.25)");
  if (cut) { R(c, 13, 24, 6, 3, "#6a8a3a"); R(c, 10, 26, 3, 1.4, "#3f7a2a"); R(c, 19, 26, 3, 1.4, "#3f7a2a"); return; }
  E(c, 16, 20, 8.4, 7.4, "#2a7a36"); E(c, 12.8, 20, 5, 5.4, "#3f9a46"); E(c, 19.6, 19.4, 5.2, 5.4, "#35903f"); E(c, 15, 16.4, 4.6, 3.4, "#68c864");
  R(c, 19, 17, 2, 2, "#e87a9a"); R(c, 11, 21, 2, 2, "#f0e060");
}
function crystal(c: Ctx, on: boolean): void {
  E(c, 16, FOOT - 1, 6.4, 2.2, "rgba(0,0,0,0.3)");
  R(c, 10, 23, 12, 4, "#4a4e68"); R(c, 10, 23, 12, 1, "#8a90b4");
  const a = on ? "#68e0a0" : "#e06a8a", b = on ? "#a8f8d0" : "#ff9ab8", d = on ? "#2f9a68" : "#9a3a58";
  c.fillStyle = d; c.beginPath(); c.moveTo(16, 4); c.lineTo(22, 14); c.lineTo(16, 24); c.lineTo(10, 14); c.fill();
  c.fillStyle = a; c.beginPath(); c.moveTo(16, 4); c.lineTo(10, 14); c.lineTo(16, 24); c.fill();
  c.fillStyle = b; c.beginPath(); c.moveTo(16, 7); c.lineTo(12.4, 13.4); c.lineTo(16, 12); c.fill();
}
function shopitem(c: Ctx): void {
  R(c, 8, 20, 16, 7, "#7d5833"); R(c, 8, 20, 16, 1.4, "#c79a62");
  E(c, 16, 16, 4.4, 5, "#d8402a"); R(c, 14.6, 10, 2.8, 3, "#f2c85a"); R(c, 13.4, 15, 1.6, 3, "rgba(255,255,255,0.5)");
}

/** Door panel texture (w x h logical units), per kind. */
function doorPanel(c: Ctx, w: number, h: number, kind: string): void {
  const horiz = w >= h;
  const base = kind === "big" ? "#5a3a7a" : kind === "switch" ? "#2a5a68" : kind === "fight" ? "#6a2a2a" : "#6a5a48";
  R(c, 0, 0, w, h, "#1a1a28"); R(c, 1, 1, w - 2, h - 2, base);
  c.strokeStyle = "rgba(255,255,255,0.18)"; c.lineWidth = 1;
  if (horiz) for (let x = 8; x < w; x += 8) { c.beginPath(); c.moveTo(x, 1); c.lineTo(x, h - 1); c.stroke(); } else for (let y = 8; y < h; y += 8) { c.beginPath(); c.moveTo(1, y); c.lineTo(w - 1, y); c.stroke(); }
  R(c, 1, 1, w - 2, 2, "rgba(255,255,255,0.18)");
  const cx = w / 2, cy = h / 2;
  if (kind === "small") { E(c, cx, cy - 1, 3.6, 3.6, "#f2c85a"); R(c, cx - 1, cy, 2, 5, "#f2c85a"); R(c, cx - 0.6, cy - 1.6, 1.2, 2, "#2a1a08"); }
  else if (kind === "big") { E(c, cx, cy, 5.6, 5.6, "#f2c85a"); E(c, cx, cy, 3.6, 3.6, "#7a3aa8"); R(c, cx - 1, cy - 1, 2, 5, "#f2c85a"); c.fillStyle = "#f2c85a"; c.beginPath(); c.moveTo(cx, cy - 9); c.lineTo(cx + 3, cy - 5); c.lineTo(cx - 3, cy - 5); c.fill(); }
  else if (kind === "switch") { c.fillStyle = "#e06a8a"; c.beginPath(); c.moveTo(cx, cy - 5); c.lineTo(cx + 4, cy); c.lineTo(cx, cy + 5); c.lineTo(cx - 4, cy); c.fill(); }
}

function pickup(c: Ctx, kind: string): void {
  switch (kind) {
    case "glint": c.fillStyle = "#5ad8f0"; c.beginPath(); c.moveTo(16, 18); c.lineTo(21, 23); c.lineTo(16, 28); c.lineTo(11, 23); c.fill(); c.fillStyle = "#c8f6ff"; c.beginPath(); c.moveTo(16, 18); c.lineTo(11, 23); c.lineTo(16, 24); c.fill(); return;
    case "heart": heartShape(c, 16, 22, 6, "#e8384a", "#ff9aa4"); return;
    case "magic": E(c, 16, 23, 4.4, 4.4, "#3ab85a"); E(c, 15, 21.6, 1.8, 1.6, "#b8f8c8"); R(c, 14.6, 17, 2.8, 2, "#8a8a98"); return;
    case "key": E(c, 16, 20, 3.6, 3.6, "#f2c85a"); E(c, 16, 20, 1.5, 1.5, "#7a5a10"); R(c, 15, 22, 2, 7, "#f2c85a"); R(c, 17, 26, 3, 1.4, "#f2c85a"); R(c, 17, 28, 2, 1.4, "#f2c85a"); return;
  }
}

export function heartShape(c: Ctx, cx: number, cy: number, s: number, col: string, hi?: string): void {
  c.fillStyle = col;
  c.beginPath();
  c.moveTo(cx, cy + s * 0.9);
  c.bezierCurveTo(cx - s * 1.5, cy - s * 0.1, cx - s * 0.9, cy - s * 1.2, cx, cy - s * 0.3);
  c.bezierCurveTo(cx + s * 0.9, cy - s * 1.2, cx + s * 1.5, cy - s * 0.1, cx, cy + s * 0.9);
  c.fill();
  if (hi) { c.fillStyle = hi; c.beginPath(); c.ellipse(cx - s * 0.5, cy - s * 0.35, s * 0.22, s * 0.32, -0.6, 0, Math.PI * 2); c.fill(); }
}

export function buildSprites(scene: Phaser.Scene): void {
  const dirs: Dir[] = ["down", "up", "left", "right"];
  for (const d of dirs) for (let f = 0; f < 3; f++) make(scene, `ren_${d}_${f}`, SPR, SPR, (c) => person(c, REN, d, f));
  for (const [id, n] of Object.entries(NPCS)) {
    if (n.look.kind === "hen") { for (let f = 0; f < 2; f++) make(scene, `npc_${id}_${f}`, SPR, SPR, (c) => hen(c, f)); continue; }
    for (let f = 0; f < 2; f++) make(scene, `npc_${id}_${f}`, SPR, SPR, (c) => person(c, n.look, "down", f * 0, id === "bram" ? "hood" : ""));
  }
  for (const k of ["slime", "bat", "crab", "wisp", "soldier", "thornling", "beetle", "skipper", "mirefly", "archer"]) for (let f = 0; f < 2; f++) make(scene, `en_${k}_${f}`, SPR, SPR, (c) => enemy(c, k, f));
  for (let f = 0; f < 2; f++) make(scene, `en_marshal_${f}`, 40, 40, (c) => enemy(c, "marshal", f));
  for (let f = 0; f < 2; f++) make(scene, `en_sluicejaw_${f}`, 56, 56, (c) => enemy(c, "sluicejaw", f));
  for (let f = 0; f < 2; f++) make(scene, `en_rootknight_${f}`, 40, 40, (c) => enemy(c, "rootknight", f));
  for (let f = 0; f < 2; f++) make(scene, `en_cloudmarshal_${f}`, 40, 40, (c) => enemy(c, "cloudmarshal", f));
  for (let f = 0; f < 2; f++) make(scene, `en_stormfinch_${f}`, 56, 56, (c) => enemy(c, "stormfinch", f));
  for (let f = 0; f < 2; f++) make(scene, `en_barkwarden_${f}`, 56, 56, (c) => enemy(c, "barkwarden", f));
  make(scene, "chest_0", SPR, SPR, (c) => chest(c, false, false));
  make(scene, "chest_1", SPR, SPR, (c) => chest(c, false, true));
  make(scene, "bigchest_0", SPR, SPR, (c) => chest(c, true, false));
  make(scene, "bigchest_1", SPR, SPR, (c) => chest(c, true, true));
  make(scene, "sign", SPR, SPR, sign);
  make(scene, "bush_0", SPR, SPR, (c) => bush(c, false));
  make(scene, "bush_1", SPR, SPR, (c) => bush(c, true));
  make(scene, "crystal_0", SPR, SPR, (c) => crystal(c, false));
  make(scene, "crystal_1", SPR, SPR, (c) => crystal(c, true));
  make(scene, "shopitem", SPR, SPR, shopitem);
  for (const k of ["glint", "heart", "magic", "key"]) make(scene, `pk_${k}`, SPR, SPR, (c) => pickup(c, k));
  // HUD hearts (full / half / empty), 12x12 logical
  for (const [name, fill] of [["full", 1], ["half", 0.5], ["empty", 0]] as const)
    make(scene, `heart_${name}`, 12, 12, (c) => {
      heartShape(c, 6, 6.4, 4.6, "#2a1830");
      c.save(); c.beginPath(); c.rect(0, 0, 12 * fill, 12); c.clip();
      if (fill > 0) heartShape(c, 6, 6.4, 4.2, "#e8384a", "#ff9aa4");
      c.restore();
      if (fill < 1) { c.save(); c.beginPath(); c.rect(12 * fill, 0, 12, 12); c.clip(); heartShape(c, 6, 6.4, 4.2, "#4a3050"); c.restore(); }
    });
  // item icons, 16x16
  make(scene, "icon_disc", 16, 16, (c) => { E(c, 8, 8, 6.2, 6.2, "#8aa0b8"); E(c, 8, 8, 4.6, 4.6, "#c8dcf0"); E(c, 8, 8, 1.6, 1.6, "#4a5a78"); c.strokeStyle = "#4a5a78"; c.lineWidth = 0.9; for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; c.beginPath(); c.arc(8, 8, 3.2, a, a + 0.9); c.stroke(); } });
  make(scene, "icon_tonic", 16, 16, (c) => { RR(c, 5, 5, 6, 8, 2, "#d8402a"); R(c, 6.6, 2, 2.8, 3.4, "#c8b890"); R(c, 6, 7, 1.4, 4, "rgba(255,255,255,0.45)"); });
  make(scene, "icon_blade", 16, 16, (c) => { c.fillStyle = "#d8e0f0"; c.beginPath(); c.moveTo(12.5, 1.5); c.lineTo(14.2, 3.2); c.lineTo(6, 11.4); c.lineTo(4.6, 10); c.fill(); R(c, 3, 11, 4.4, 1.4, "#f2c85a"); c.save(); c.translate(4, 12); c.rotate(-0.78); R(c, -0.8, 0, 1.6, 4, "#7d5833"); c.restore(); });
  make(scene, "icon_buckler", 16, 16, (c) => { E(c, 8, 8, 6, 6.4, "#7d5833"); E(c, 8, 8, 4.6, 5, "#c79a62"); R(c, 7.4, 3, 1.2, 10, "#7d5833"); R(c, 3.6, 7.4, 8.8, 1.2, "#7d5833"); E(c, 8, 8, 1.4, 1.4, "#f2c85a"); });
  make(scene, "icon_map", 16, 16, (c) => { R(c, 2, 3, 12, 10, "#e8d8a8"); R(c, 2, 3, 12, 1, "#c8b070"); R(c, 4, 6, 3, 2, "#7a5a30"); R(c, 8, 8, 4, 2, "#7a5a30"); R(c, 6, 10, 1, 1, "#d8402a"); });
  make(scene, "icon_compass", 16, 16, (c) => { E(c, 8, 8, 6, 6, "#c8a040"); E(c, 8, 8, 4.8, 4.8, "#f4ecd0"); c.fillStyle = "#d8402a"; c.beginPath(); c.moveTo(8, 3.4); c.lineTo(9.4, 8); c.lineTo(6.6, 8); c.fill(); c.fillStyle = "#4a4e68"; c.beginPath(); c.moveTo(8, 12.6); c.lineTo(9.4, 8); c.lineTo(6.6, 8); c.fill(); });
  make(scene, "icon_bigkey", 16, 16, (c) => { E(c, 5, 5, 3.4, 3.4, "#f2c85a"); E(c, 5, 5, 1.4, 1.4, "#7a3aa8"); R(c, 6.6, 6.6, 1.8, 8, "#f2c85a"); c.save(); c.translate(0, 0); c.rotate(-0.78); c.restore(); R(c, 8, 11, 3.4, 1.4, "#f2c85a"); R(c, 8, 13.4, 2.4, 1.4, "#f2c85a"); });
  make(scene, "icon_lantern", 16, 16, (c) => { R(c, 5, 3, 6, 1.6, "#6a5030"); RR(c, 4.6, 4.6, 6.8, 7, 1.4, "#d8a03a"); R(c, 6, 6, 4, 4.6, "#fff0b0"); R(c, 4.6, 12, 6.8, 1.6, "#6a5030"); R(c, 7, 1, 2, 2, "#6a5030"); });
  make(scene, "icon_key", 16, 16, (c) => { E(c, 5.4, 5.4, 3, 3, "#f2c85a"); E(c, 5.4, 5.4, 1.2, 1.2, "#7a5a10"); R(c, 6.8, 6.8, 1.8, 7, "#f2c85a"); R(c, 8.6, 10, 3, 1.4, "#f2c85a"); R(c, 8.6, 12.4, 2, 1.4, "#f2c85a"); });
  make(scene, "icon_glint", 16, 16, (c) => { c.fillStyle = "#5ad8f0"; c.beginPath(); c.moveTo(8, 2); c.lineTo(13, 8); c.lineTo(8, 14); c.lineTo(3, 8); c.fill(); c.fillStyle = "#c8f6ff"; c.beginPath(); c.moveTo(8, 2); c.lineTo(3, 8); c.lineTo(8, 9); c.fill(); });
  make(scene, "icon_shard", 16, 16, (c) => { c.fillStyle = "#e8384a"; c.beginPath(); c.moveTo(8, 2); c.lineTo(12, 9); c.lineTo(6, 14); c.lineTo(3, 7); c.fill(); c.fillStyle = "#ff9aa4"; c.beginPath(); c.moveTo(8, 2); c.lineTo(3, 7); c.lineTo(7, 8); c.fill(); });
  // light glow for darkness / fire
  make(scene, "glow", 64, 64, (c) => { const g = c.createRadialGradient(32, 32, 2, 32, 32, 32); g.addColorStop(0, "rgba(255,230,160,0.55)"); g.addColorStop(1, "rgba(255,160,60,0)"); c.fillStyle = g; c.fillRect(0, 0, 64, 64); });
  // darkness mask: opaque everywhere except a soft hole in the centre (scaled to cover the screen)
  make(scene, "darkhole", 128, 128, (c) => { const g = c.createRadialGradient(64, 64, 14, 64, 64, 60); g.addColorStop(0, "rgba(4,4,20,0)"); g.addColorStop(1, "rgba(4,4,20,0.86)"); c.fillStyle = g; c.fillRect(0, 0, 128, 128); });
  make(scene, "slab", SPR, SPR, (c) => { E(c, 16, 28, 11, 3, "rgba(0,0,0,0.3)"); R(c, 6, 12, 20, 15, "#6a6e7c"); R(c, 6, 12, 20, 4, "#9a9eae"); R(c, 6, 24, 20, 3, "#4a4e5c"); R(c, 9, 17, 14, 1, "#4a4e5c"); R(c, 15, 12, 1, 12, "#4a4e5c"); R(c, 12, 14, 3, 2, "#c8b676"); R(c, 18, 20, 3, 2, "#c8b676"); R(c, 13, 19, 6, 1, "#d8c88a"); });
  make(scene, "rubble", SPR, SPR, (c) => { E(c, 16, 28, 11, 3, "rgba(0,0,0,0.3)"); E(c, 16, 21, 10, 8, "#7a6a58"); E(c, 15, 20, 8.6, 6.6, "#9a8a76"); E(c, 12, 17, 3.6, 2.6, "#c0b09a"); c.strokeStyle = "#3a2e22"; c.lineWidth = 1.2; c.beginPath(); c.moveTo(16, 13); c.lineTo(14, 19); c.lineTo(18, 22); c.lineTo(15, 28); c.stroke(); c.beginPath(); c.moveTo(22, 18); c.lineTo(19, 21); c.stroke(); });
  make(scene, "thicket", SPR, SPR, (c) => { E(c, 16, 28, 11, 3, "rgba(0,0,0,0.3)"); E(c, 16, 20, 11, 9, "#3a2a1c"); E(c, 15, 19, 9.6, 7.4, "#5a3e24"); c.strokeStyle = "#241408"; c.lineWidth = 1.2; for (let i = 0; i < 6; i++) { c.beginPath(); c.moveTo(7 + i * 3.4, 26); c.quadraticCurveTo(10 + i * 2.4, 14, 6 + i * 4, 9 + (i % 2) * 3); c.stroke(); } c.fillStyle = "#8a2a28"; for (const [x, y] of [[9, 12], [15, 10], [21, 13], [12, 20], [19, 19]]) { c.beginPath(); c.moveTo(x, y - 2); c.lineTo(x + 1.6, y + 1); c.lineTo(x - 1.6, y + 1); c.fill(); } });
  make(scene, "icon_bow", 16, 16, (c) => { c.strokeStyle = "#a8683a"; c.lineWidth = 1.6; c.beginPath(); c.arc(5, 8, 7, -1.2, 1.2); c.stroke(); c.strokeStyle = "#f0e8c8"; c.lineWidth = 0.7; c.beginPath(); c.moveTo(5 + Math.cos(-1.2) * 7, 8 + Math.sin(-1.2) * 7); c.lineTo(5 + Math.cos(1.2) * 7, 8 + Math.sin(1.2) * 7); c.stroke(); R(c, 5, 7.4, 9, 1.2, "#e8d8a8"); c.fillStyle = "#ff7a2a"; c.beginPath(); c.moveTo(15, 8); c.lineTo(12, 5.4); c.lineTo(12, 10.6); c.fill(); });
  make(scene, "icon_gauntlet", 16, 16, (c) => { R(c, 4, 7, 8, 7, "#c8923a"); R(c, 4, 7, 8, 2, "#e8b860"); R(c, 3, 12, 10, 3, "#8a5a24"); R(c, 4, 3, 2, 5, "#e0a850"); R(c, 7, 2, 2, 6, "#e0a850"); R(c, 10, 3, 2, 5, "#e0a850"); R(c, 5, 10, 6, 1, "#7a4a1c"); });
  make(scene, "icon_boots", 16, 16, (c) => { R(c, 4, 3, 5, 8, "#2a8a9a"); R(c, 4, 10, 9, 4, "#2a8a9a"); R(c, 4, 13, 9, 2, "#14505c"); R(c, 4, 3, 5, 2, "#6ad8e8"); c.strokeStyle = "#e8f8ff"; c.lineWidth = 1; c.beginPath(); c.arc(11, 8, 2.4, 0.5, 5.2); c.stroke(); R(c, 1, 8, 2, 1, "#9ae8f4"); R(c, 0, 11, 3, 1, "#9ae8f4"); });
  make(scene, "icon_folio", 16, 16, (c) => { R(c, 3, 2, 10, 12, "#e8dcc0"); R(c, 3, 2, 10, 2, "#c8b890"); R(c, 3, 13, 10, 1, "#a89870"); R(c, 5, 5, 6, 1, "#7a6a50"); R(c, 5, 7, 5, 1, "#7a6a50"); R(c, 5, 9, 6, 1, "#7a6a50"); R(c, 2, 2, 2, 12, "#3a8a4a"); });
  make(scene, "dot", 4, 4, (c) => { c.fillStyle = "#fff"; c.beginPath(); c.arc(2, 2, 2, 0, Math.PI * 2); c.fill(); });
  // level-up effect pieces: soft light pillar, ring, star spark, light mask for dark rooms
  make(scene, "lvl_pillar", 16, 64, (c) => { const g = c.createLinearGradient(0, 64, 0, 0); g.addColorStop(0, "rgba(255,236,160,0.95)"); g.addColorStop(0.5, "rgba(255,220,120,0.45)"); g.addColorStop(1, "rgba(255,220,120,0)"); c.fillStyle = g; c.fillRect(0, 0, 16, 64); const h = c.createLinearGradient(0, 0, 16, 0); h.addColorStop(0, "rgba(0,0,0,1)"); h.addColorStop(0.5, "rgba(0,0,0,0)"); h.addColorStop(1, "rgba(0,0,0,1)"); c.globalCompositeOperation = "destination-out"; c.fillStyle = h; c.fillRect(0, 0, 16, 64); });
  make(scene, "lvl_ring", 32, 32, (c) => { c.strokeStyle = "#fff4c0"; c.lineWidth = 1.6; c.beginPath(); c.arc(16, 16, 14, 0, Math.PI * 2); c.stroke(); c.strokeStyle = "rgba(255,230,140,0.4)"; c.lineWidth = 4; c.beginPath(); c.arc(16, 16, 13, 0, Math.PI * 2); c.stroke(); });
  make(scene, "lvl_star", 8, 8, (c) => { c.fillStyle = "#fff"; c.beginPath(); c.moveTo(4, 0); c.lineTo(5, 3); c.lineTo(8, 4); c.lineTo(5, 5); c.lineTo(4, 8); c.lineTo(3, 5); c.lineTo(0, 4); c.lineTo(3, 3); c.fill(); });
  make(scene, "lightmask", 64, 64, (c) => { const g = c.createRadialGradient(32, 32, 4, 32, 32, 32); g.addColorStop(0, "rgba(0,0,0,1)"); g.addColorStop(0.55, "rgba(0,0,0,0.75)"); g.addColorStop(1, "rgba(0,0,0,0)"); c.fillStyle = g; c.fillRect(0, 0, 64, 64); });
  make(scene, "shadow", 16, 8, (c) => E(c, 8, 4, 7, 3, "rgba(0,0,0,0.3)"));
}

export function doorTexture(scene: Phaser.Scene, key: string, w: number, h: number, kind: string): void {
  make(scene, key, w, h, (c) => doorPanel(c, w, h, kind));
}
