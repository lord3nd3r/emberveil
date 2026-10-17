/**
 * Emberveil map generator. Composes the Aurelane region (4x4 chunks of 32x24 tiles), the interiors and the
 * Cistern Under-Hall rooms from hand-authored layout code plus seeded scatter, and writes plain JSON files
 * under public/world/. The game and the audit only ever read those JSON files.
 *   npm run mapgen
 */
import fs from "node:fs";
import path from "node:path";
import { CH, CW, FOG_HEX, FOG_W, REGION_COLS, REGION_ROWS } from "../src/tiles";
import { CONSUMABLES, EQUIPPABLE, FLAGS, LEVEL_XP, QUESTS, UNIQUE_ITEMS } from "../src/sim/data";

const OUT = path.resolve("public/world");
fs.mkdirSync(path.join(OUT, "aurelane"), { recursive: true });
fs.mkdirSync(path.join(OUT, "rooms"), { recursive: true });

function rngOf(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Obj = Record<string, unknown> & { t: string; x: number; y: number };

class Grid {
  rows: string[][];
  objs: Obj[] = [];
  constructor(public w: number, public h: number, fill: string) {
    this.rows = Array.from({ length: h }, () => Array.from({ length: w }, () => fill));
  }
  get(x: number, y: number): string {
    return this.rows[y]?.[x] ?? " ";
  }
  put(x: number, y: number, ch: string): void {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.rows[y][x] = ch;
  }
  rect(x0: number, y0: number, x1: number, y1: number, ch: string): void {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.put(x, y, ch);
  }
  ring(x0: number, y0: number, x1: number, y1: number, ch: string): void {
    for (let x = x0; x <= x1; x++) { this.put(x, y0, ch); this.put(x, y1, ch); }
    for (let y = y0; y <= y1; y++) { this.put(x0, y, ch); this.put(x1, y, ch); }
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, ch: string): void {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x - cx) / rx, dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.put(x, y, ch);
      }
  }
  /** Thick polyline. */
  path(pts: [number, number][], ch: string, wd = 2): void {
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
      for (let k = 0; k <= n; k++) {
        const x = Math.round(x0 + ((x1 - x0) * k) / n), y = Math.round(y0 + ((y1 - y0) * k) / n);
        for (let a = 0; a < wd; a++) for (let b = 0; b < wd; b++) this.put(x + a, y + b, ch);
      }
    }
  }
  scatter(x0: number, y0: number, x1: number, y1: number, ch: string, p: number, r: () => number, only = ".,*\"", margin = true): void {
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        if (!only.includes(this.get(x, y)) || r() >= p) continue;
        if (margin) {
          let near = false;
          for (let a = -1; a <= 1 && !near; a++) for (let b = -1; b <= 1; b++) if (":=[]DSC".includes(this.get(x + a, y + b))) near = true;
          if (near) continue;
        }
        this.put(x, y, ch);
      }
  }
  obj(o: Obj): void {
    this.objs.push(o);
  }
  lines(): string[] {
    return this.rows.map((r) => r.join(""));
  }
}

/* ===================================================================== AURELANE (128 x 96) */
const W = CW * 4, H = CH * 4;
const g = new Grid(CW * REGION_COLS, CH * REGION_ROWS, ".");
const R = rngOf(0xe3b3);

// grass texture
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const v = R(); if (v < 0.22) g.put(x, y, ","); else if (v < 0.245) g.put(x, y, "*"); else if (v < 0.30) g.put(x, y, '"'); }

// ---- southern coast
g.rect(0, 82, W - 1, 85, "s");
g.rect(0, 86, W - 1, 87, "u");
g.rect(0, 88, W - 1, H - 1, "~");
for (let x = 0; x < W; x++) for (let y = 82; y < 86; y++) if (R() < 0.12) g.put(x, y, ".");
for (let x = 0; x < W; x++) if (R() < 0.3) g.put(x, 81, "s");
g.rect(0, 92, W - 1, H - 1, "c");

// ---- (1,0) Ashfall Rise: mountain + plateau + cliff band with cave mouths and a ledge
g.rect(32, 0, 63, 9, "M");
g.rect(32, 3, 34, 16, "M");
g.rect(32, 16, 63, 16, "^");
g.rect(56, 16, 58, 16, "v");
g.put(46, 16, "C");
g.put(44, 9, "C");
g.scatter(33, 10, 63, 15, ":", 0.12, R, ".,", false);
for (const [x, y] of [[40, 12], [52, 11], [60, 13], [37, 14]] as [number, number][]) g.put(x, y, "G");
g.scatter(35, 17, 63, 23, "o", 0.04, R);
g.scatter(35, 17, 45, 23, "P", 0.22, R);
g.scatter(50, 17, 63, 23, "P", 0.18, R);
// ---- (0,0) Gloamwood Edge
g.rect(6, 6, 31, 23, "P");
g.scatter(6, 6, 31, 23, "T", 0.18, R, "P", false);
g.ellipse(18, 12, 5, 3.4, ",");
g.path([[31, 21], [24, 21], [18, 17], [16, 13]], ":", 2);
g.path([[20, 12], [31, 12]], ":", 2);
g.path([[16, 23], [16, 17]], ":", 2);
g.ellipse(18, 12, 4, 2.6, ".");
g.put(21, 13, "G");
// ---- (2,0) Beacon Hall grounds
g.rect(70, 3, 89, 3, "W"); g.rect(70, 4, 89, 4, "w");
g.rect(70, 3, 70, 12, "W"); g.rect(89, 3, 89, 12, "W");
g.rect(71, 5, 88, 11, "j");
g.rect(70, 12, 89, 12, "W");
g.rect(79, 12, 80, 12, "j"); g.rect(73, 12, 74, 12, "a"); g.rect(85, 12, 85, 12, "a"); g.rect(89, 8, 89, 9, "a");
g.put(70, 7, "a");
for (const [x, y] of [[74, 6], [85, 6], [76, 9], [83, 9]] as [number, number][]) g.put(x, y, "k");
g.rect(72, 13, 87, 20, "j");
g.rect(76, 15, 83, 15, "W"); g.rect(76, 16, 83, 16, "w"); g.rect(79, 16, 80, 16, "S");
g.rect(76, 17, 83, 17, "j");
g.put(76, 19, "k"); g.put(83, 19, "k"); g.put(72, 15, "k"); g.put(87, 15, "k");
g.path([[80, 23], [80, 20]], "=", 2);
g.path([[64, 14], [72, 14]], ":", 2);
g.path([[88, 14], [96, 14]], ":", 2);
g.scatter(64, 0, 95, 23, "P", 0.2, R, ".,\"*", true);
g.scatter(64, 14, 95, 23, "o", 0.02, R);
g.rect(70, 0, 89, 2, "M");
// ---- (3,0) Cinder Heights
g.rect(96, 0, 127, 12, "M");
g.rect(96, 6, 103, 8, ":");
g.rect(104, 4, 113, 9, ".");
g.rect(104, 10, 113, 10, "^"); g.rect(107, 10, 109, 10, "v");
g.rect(96, 11, 127, 13, ".");
g.scatter(97, 13, 127, 23, "o", 0.05, R);
g.rect(118, 3, 120, 29, "~"); // waterfall river into the lake
g.rect(118, 18, 120, 18, "["); // bridge
g.path([[96, 14], [110, 14], [110, 20]], ":", 2);
g.path([[121, 18], [124, 18]], ":", 2);
g.scatter(97, 14, 127, 23, "P", 0.1, R);
g.rect(121, 14, 126, 23, ".");
g.scatter(121, 14, 126, 23, '"', 0.4, R, ".", false);

// ---- (0,1) Whispering Grove
g.scatter(3, 24, 31, 47, "T", 0.28, R);
g.ellipse(6, 30, 3.4, 2.4, "s"); g.ellipse(6, 30, 2.4, 1.6, "~");
g.ellipse(14, 36, 3.2, 3.2, "*"); g.ellipse(14, 36, 1.6, 1.6, "a");
g.path([[14, 23], [14, 37], [31, 37]], ":", 2);
g.path([[14, 37], [14, 48]], ":", 2);
// ---- (1,1) Emberfen village
g.rect(42, 34, 53, 42, "=");
g.rect(46, 37, 47, 38, "q");
g.path([[46, 17], [46, 35]], ":", 2);
g.path([[32, 37], [42, 37]], "=", 2);
g.path([[53, 37], [64, 37]], "=", 2);
g.path([[46, 42], [46, 47]], "=", 2);
g.path([[41, 33], [41, 36]], "=", 2);
g.path([[52, 33], [52, 36]], "=", 2);
function house(x0: number, y0: number, w: number, doorX: number, windows: number[]): void {
  g.rect(x0, y0, x0 + w - 1, y0, "r"); g.rect(x0, y0 + 1, x0 + w - 1, y0 + 1, "R");
  g.rect(x0, y0 + 2, x0 + w - 1, y0 + 2, "H");
  for (const wx of windows) g.put(wx, y0 + 2, "N");
  g.put(doorX, y0 + 2, "D");
}
house(38, 29, 6, 41, [39, 43]);   // Ren's cottage, door (41,31)
house(49, 29, 7, 52, [50, 54]);   // Lampwright's shop, door (52,31)
house(56, 38, 6, 58, [57, 60]);   // closed house
house(34, 40, 6, 36, [35, 38]);   // closed house
g.path([[36, 43], [36, 41]], "=", 1);
g.path([[58, 41], [58, 40]], "=", 1);
g.rect(33, 31, 36, 31, "f"); g.rect(60, 33, 62, 33, "f"); g.rect(44, 29, 46, 29, "*");
g.rect(36, 36, 39, 36, "*"); g.rect(54, 41, 57, 41, "*");
g.scatter(33, 24, 63, 47, "T", 0.17, R);
g.rect(46, 24, 47, 28, ":");
// ---- (2,1) Lantern Road crossroads
g.rect(64, 37, 97, 38, "=");
g.rect(80, 24, 81, 47, ":");
g.rect(80, 37, 81, 38, "=");
g.rect(85, 32, 99, 34, "~"); g.rect(85, 32, 87, 71, "~"); // river from the lake, down to the sea
g.rect(85, 37, 87, 38, "["); // east road bridge
g.rect(85, 60, 87, 61, "[");
g.scatter(64, 24, 95, 47, "T", 0.10, R);
g.scatter(64, 24, 95, 47, "o", 0.015, R);
// ---- (3,1) Tidemarch lake
g.ellipse(112, 37, 12.5, 8.5, "s"); g.ellipse(112, 37, 10.5, 6.5, "~");
g.rect(118, 24, 120, 29, "~");
g.ellipse(112, 37, 3.5, 2.4, "."); g.put(112, 36, "L"); g.put(111, 38, "*");
g.rect(98, 40, 106, 40, "[");
g.path([[96, 37], [101, 41]], "=", 1);
g.put(100, 41, "s");
g.scatter(98, 24, 127, 47, "T", 0.06, R);
// ---- (0,2) Reedmarsh
g.scatter(2, 48, 31, 71, "T", 0.10, R);
for (const [cx, cy, rx, ry] of [[7, 54, 4.5, 3], [22, 56, 5, 3.4], [8, 66, 5, 3], [24, 66, 4, 2.8]] as number[][]) {
  g.ellipse(cx, cy, rx + 1.5, ry + 1.5, "-"); g.ellipse(cx, cy, rx, ry, "~");
}
g.ellipse(12, 60, 3.2, 2.6, "-"); g.ellipse(12, 60, 1.8, 1.4, ".");
g.scatter(2, 48, 31, 71, "y", 0.10, R, "-.,", false);
g.path([[14, 47], [14, 58], [19, 62], [31, 62]], ":", 2);
g.put(10, 64, "y");
// ---- (1,2) Orchard fields
g.rect(40, 52, 59, 52, "f"); g.rect(40, 67, 59, 67, "f"); g.rect(40, 52, 40, 67, "f"); g.rect(59, 52, 59, 67, "f");
g.rect(46, 52, 47, 52, ":"); g.rect(46, 67, 47, 67, ":");
for (let y = 56; y <= 64; y += 4) for (let x = 43; x <= 56; x += 3) if (x < 45 || x > 48) g.put(x, y, "T");
g.rect(55, 64, 58, 64, "f"); g.rect(55, 64, 55, 66, "f"); g.rect(58, 64, 58, 66, "f"); g.rect(56, 66, 57, 66, ".");
g.put(56, 64, "."); g.put(57, 64, ".");
g.path([[46, 47], [46, 70]], ":", 2);
house(33, 55, 6, 36, [34, 38]); // Granny's house, door (38,57)
g.path([[36, 58], [36, 60], [46, 60]], ":", 1);
g.path([[32, 62], [46, 62]], ":", 1);
g.scatter(33, 68, 63, 72, "T", 0.10, R);
// ---- (2,2) River ford
g.rect(64, 60, 96, 61, "=");
g.rect(70, 52, 76, 52, "W"); g.rect(70, 53, 76, 53, "w"); g.rect(70, 52, 70, 56, "W"); g.rect(76, 52, 76, 56, "W"); g.rect(73, 53, 73, 53, "a"); g.rect(71, 54, 75, 56, "a");
g.put(70, 56, "a"); g.put(76, 55, "a"); g.put(72, 56, "W"); g.rect(74, 56, 75, 56, "a");
g.path([[80, 47], [80, 60]], ":", 2);
g.path([[72, 57], [72, 60]], ":", 1);
g.scatter(64, 48, 95, 71, "T", 0.08, R);
g.scatter(64, 48, 95, 71, "o", 0.025, R);
// ---- (3,2) Dunereach
g.rect(97, 48, 127, 71, "s");
g.scatter(97, 48, 127, 71, "o", 0.06, R, "s");
g.scatter(97, 48, 127, 71, ".", 0.05, R, "s", false);
g.rect(100, 56, 122, 56, "^"); g.put(110, 56, "C");
g.path([[96, 61], [110, 61], [110, 58]], "=", 2);
g.rect(124, 48, 127, 71, "M");
// ---- southern meadow + pier
g.scatter(2, 72, 125, 81, "T", 0.05, R);
g.path([[46, 70], [46, 82]], ":", 2);
g.path([[80, 60], [80, 82]], ":", 2);
g.rect(62, 84, 63, 90, "]");
g.put(61, 84, "L");
g.scatter(2, 72, 125, 81, "*", 0.05, R, ".,");
// ---- world rim
g.rect(0, 0, 2, H - 1, "c"); g.rect(W - 3, 0, W - 1, H - 1, "c"); g.rect(0, 0, W - 1, 2, "c");
for (let y = 3; y < 82; y++) for (const x of [3, 4, W - 5, W - 4]) if (".,*\"".includes(g.get(x, y)) && R() < 0.8) g.put(x, y, "P");
for (const [x0, y0, x1, y1] of [[3, 3, 5, 82], [W - 6, 3, W - 4, 82]]) g.scatter(x0, y0, x1, y1, "P", 0.8, R, ".,*\"", false);
// plateau/lowland keep-clear zones after rim scatter
g.rect(98, 6, 103, 8, ":");
// make sure roads are intact after scatter
g.path([[46, 17], [46, 35]], ":", 2);
g.path([[32, 37], [42, 37]], "=", 2);
g.path([[14, 23], [14, 48]], ":", 2);
g.path([[14, 37], [31, 37]], ":", 2);
g.path([[53, 37], [64, 37]], "=", 2);

/* ===================================================================== EXPANSION (8x8 chunks = 256 x 192 tiles) */
const R2 = rngOf(0x51ed);
const WW = CW * REGION_COLS, WH = CH * REGION_ROWS;
const grassAt = (x0: number, y0: number, x1: number, y1: number): void => {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const v = R2(); g.put(x, y, v < 0.22 ? "," : v < 0.245 ? "*" : v < 0.3 ? '"' : "."); }
};
// open the old eastern and southern rims (they were sea) into new land
grassAt(3, 82, WW - 1, WH - 1);
grassAt(128, 0, WW - 1, 81);
for (let y = 13; y <= 81; y++) for (let x = 118; x <= 127; x++) { const c = g.get(x, y); if (c === "P" || c === "c") g.put(x, y, ".,*\"".charAt(Math.floor(R2() * 3))); }
g.rect(125, 0, 127, 12, "M");
g.rect(124, 48, 127, 71, "s");
// world rim
g.rect(0, 96, 2, WH - 1, "c"); g.rect(WW - 3, 0, WW - 1, WH - 1, "c"); g.rect(128, 0, WW - 1, 2, "c"); g.rect(0, WH - 3, WW - 1, WH - 1, "c");
g.rect(3, WH - 5, WW - 4, WH - 4, "s"); g.rect(3, WH - 6, WW - 4, WH - 6, "u");
g.scatter(3, 82, 5, WH - 7, "P", 0.8, R2, ".,*\"", false);
g.scatter(WW - 8, 13, WW - 4, WH - 7, "P", 0.7, R2, ".,*\"", false);

// ---- northern range (Emberspine): mountain wall with a corridor road below it
g.rect(128, 0, WW - 4, 10, "M");
g.rect(125, 11, WW - 4, 21, ".");
grassAt(128, 11, WW - 4, 21);
g.rect(128, 22, WW - 4, 22, "^");
for (const x of [150, 151, 226, 227]) g.put(x, 22, ":");
for (const x of [182, 208]) g.put(x, 22, "v"); // hop-down shortcuts onto the plateau
// Skyreach Spire (the third wardstone's home, sealed for now)
g.rect(196, 1, 214, 10, "M");
g.rect(198, 2, 212, 8, "W"); g.rect(198, 9, 212, 9, "w"); g.rect(205, 9, 206, 9, "D");
g.rect(200, 10, 211, 10, "j"); g.put(199, 10, "k"); g.put(212, 10, "k");
g.path([[205, 22], [205, 10]], ":", 2);
// sealed pockets inside the range (a bush plugs each entrance)
for (const [px, py] of [[141, 5], [224, 5]] as number[][]) { g.rect(px - 1, py - 1, px + 2, py + 1, "."); g.rect(px, py + 2, px, 10, "."); }

// ---- west strip x128-131 joins Dunereach to the northern corridor
g.path([[129, 13], [129, 71]], ":", 2);
// ---- east plateau (Kestrel plateau): cliff walls with ramps and ledge hops
g.rect(131, 23, 131, 69, "^"); g.rect(131, 70, WW - 4, 70, "^");
for (const y of [34, 35]) g.put(131, y, ":");
for (const x of [160, 161]) g.put(x, 70, ":");
for (const x of [140, 172, 196, 232]) g.put(x, 70, "v");
g.path([[150, 13], [150, 26]], ":", 2); g.path([[226, 13], [226, 26]], ":", 2);
g.path([[160, 71], [160, 95]], ":", 2); g.path([[132, 34], [150, 34]], ":", 2); g.path([[150, 26], [150, 60], [160, 69]], ":", 2);
g.path([[226, 26], [226, 55], [238, 62]], ":", 2);
// pond, standing stones, quarry
g.ellipse(200, 46, 8, 5, "s"); g.ellipse(200, 46, 6, 3.4, "~");
g.ring(155, 46, 165, 54, "a"); g.rect(158, 49, 162, 51, ".");
g.rect(222, 52, 236, 66, "s"); g.scatter(222, 52, 236, 66, "o", 0.16, R2, "s", false);
g.rect(236, 58, 241, 58, "^"); g.put(238, 58, "C"); g.rect(237, 59, 237, 59, "o"); g.rect(239, 59, 239, 59, "o");
g.path([[238, 62], [238, 59]], "s", 1);
g.path([[226, 55], [233, 55]], ":", 2);
// the broken causeway: a chasm cuts the approach to a walled nook (dash across with the Spiral Boots)
g.rect(210, 29, 225, 40, "M"); g.rect(210, 31, 215, 38, "."); g.rect(213, 31, 215, 38, "O"); g.rect(216, 31, 224, 38, "a");
// plateau homestead: Kestrel Outpost
g.rect(147, 34, 156, 42, "="); 
function house2(x0: number, y0: number, w: number, doorX: number, windows: number[]): void {
  g.rect(x0, y0, x0 + w - 1, y0, "r"); g.rect(x0, y0 + 1, x0 + w - 1, y0 + 1, "R"); g.rect(x0, y0 + 2, x0 + w - 1, y0 + 2, "H");
  for (const wx of windows) g.put(wx, y0 + 2, "N"); g.put(doorX, y0 + 2, "D");
}
house2(148, 34, 7, 151, [149, 153]);
g.path([[151, 37], [151, 34]], "=", 1); g.path([[132, 38], [160, 38]], ":", 1);
g.scatter(132, 24, WW - 4, 69, "T", 0.04, R2); g.scatter(132, 24, WW - 4, 69, "P", 0.07, R2); g.scatter(132, 24, WW - 4, 69, "o", 0.012, R2);

// ---- Crownwatch Castle and its moat (centre of the world)
g.rect(130, 82, 157, 109, "~");
g.rect(133, 85, 154, 106, "."); grassAt(133, 85, 154, 106);
g.ring(135, 87, 152, 104, "W"); g.rect(136, 88, 151, 103, "j");
g.rect(135, 104, 152, 104, "w");
g.rect(142, 87, 145, 87, "j"); g.rect(142, 104, 145, 104, "j"); g.rect(135, 95, 135, 96, "j"); g.rect(152, 95, 152, 96, "j");
g.rect(141, 90, 146, 95, "W"); g.rect(141, 96, 146, 96, "w"); g.rect(143, 96, 144, 96, "D");
for (const [x, y] of [[138, 90], [149, 90], [138, 101], [149, 101]]) g.put(x, y, "k");
g.rect(143, 82, 144, 84, "]"); g.rect(143, 107, 144, 109, "]"); g.rect(130, 95, 132, 96, "["); g.rect(155, 95, 157, 96, "[");
g.scatter(130, 82, 157, 109, "l", 0.04, R2, "~", false);
g.path([[143, 71], [143, 81]], ":", 2); g.path([[143, 72], [160, 72]], ":", 2); g.path([[143, 110], [143, 186]], "=", 2);
g.path([[80, 60], [80, 95], [129, 95]], "=", 2); g.path([[133, 95], [134, 95]], "=", 2); g.path([[158, 95], [WW - 8, 95]], "=", 2);
g.path([[143, 85], [143, 87]], "=", 2); g.path([[143, 104], [143, 106]], "=", 2);

// ---- western heath and the south-west desert (Ashglass Dunes)
g.scatter(3, 96, 127, 117, "T", 0.05, R2); g.scatter(3, 96, 95, 117, "P", 0.04, R2);
g.rect(3, 118, 70, WH - 7, "s");
g.scatter(3, 108, 70, 117, "s", 0.3, R2, ".,\"*", false);
g.scatter(3, 118, 70, WH - 7, "o", 0.035, R2, "s", false);
for (const [cx, cy, rx, ry] of [[14, 130, 4, 3], [60, 128, 3, 2.4], [12, 160, 4, 3], [62, 176, 4, 2.6], [30, 178, 3, 2]] as number[][]) g.ellipse(cx, cy, rx, ry, "M");
g.ellipse(30, 152, 8, 5.5, "."); g.ellipse(30, 152, 6, 3.8, "-"); g.ellipse(30, 152, 3, 1.8, "~");
g.scatter(22, 146, 38, 158, "T", 0.22, R2, ".", false);
g.rect(46, 125, 60, 125, "^"); g.put(52, 125, "C"); g.path([[52, 126], [52, 128]], "s", 1);
g.path([[46, 70], [46, 130]], ":", 2); g.path([[46, 130], [30, 140]], "s", 2);
// slab-sealed tomb (Dune Gauntlet)
g.rect(48, 136, 58, 146, "M"); g.rect(50, 138, 56, 144, "+"); g.rect(53, 145, 53, 146, "s");
// chasm shrine (Spiral Boots)
g.rect(38, 164, 56, 176, "M"); g.rect(36, 168, 42, 173, "s"); g.rect(41, 168, 43, 173, "O"); g.rect(44, 168, 54, 173, "+");
g.path([[30, 140], [30, 170], [36, 170]], "s", 1);
// ---- southern swamp (Mirewick)
g.rect(64, 120, 127, WH - 7, ".");
grassAt(64, 120, 127, WH - 7);
for (let i = 0; i < 26; i++) {
  const cx = 66 + Math.floor(R2() * 60), cy = 122 + Math.floor(R2() * 60), rx = 2.5 + R2() * 3.5, ry = 1.8 + R2() * 2.4;
  g.ellipse(cx, cy, rx + 1.6, ry + 1.4, "-"); g.ellipse(cx, cy, rx, ry, "~");
}
g.scatter(64, 120, 127, WH - 7, "-", 0.18, R2, ".,", false);
g.scatter(64, 120, 127, WH - 7, "y", 0.16, R2, "-", false);
g.scatter(64, 120, 127, WH - 7, "T", 0.07, R2, ".,\"*", false);
g.rect(96, 143, 111, 152, "."); grassAt(96, 143, 111, 152);
house2(98, 144, 7, 101, [99, 103]);
g.path([[101, 147], [101, 148], [110, 148], [110, 142]], "=", 1);
g.path([[143, 140], [64, 140]], "=", 2);
g.path([[64, 140], [64, 118]], ":", 2);
g.path([[94, 142], [94, 162]], "]", 1);
g.path([[127, 112], [127, 140]], ":", 2);
// ---- south-east lake (Greatwater) with Heron Island
g.ellipse(205, 155, 41, 23, "s"); g.ellipse(205, 155, 38.5, 20.5, "-"); g.ellipse(205, 155, 35, 17, "~");
g.ellipse(205, 155, 6.5, 4.5, "s"); g.ellipse(205, 155, 4.5, 2.8, ".");
g.rect(204, 135, 205, 150, "]");
g.path([[205, 96], [205, 134]], ":", 2);
g.rect(156, 143, 168, 152, "."); grassAt(156, 143, 168, 152);
house2(158, 143, 6, 160, [159, 162]);
g.path([[144, 140], [170, 140]], ":", 2); g.path([[160, 146], [160, 148], [166, 148], [166, 141]], "=", 1);
g.rect(166, 156, 174, 157, "[");
g.scatter(160, 112, WW - 8, WH - 8, "T", 0.06, R2); g.scatter(160, 112, WW - 8, WH - 8, "P", 0.03, R2);
// river from the plateau cliffs to the lake, with road bridges
g.rect(186, 71, 187, 119, "~"); g.rect(186, 95, 187, 96, "[");
g.path([[186, 118], [187, 136]], "~", 2);
// ruins with a shard (east road, lake shore)
for (const [rx0, ry0] of [[225, 100], [240, 170], [180, 14]] as number[][]) { g.ring(rx0, ry0, rx0 + 6, ry0 + 5, "W"); g.rect(rx0 + 2, ry0 + 5, rx0 + 3, ry0 + 5, "."); g.rect(rx0 + 1, ry0 + 1, rx0 + 5, ry0 + 4, "a"); }
// wide dirt roads between regions (drawn last so scatter never blocks them)
g.path([[143, 140], [143, 186]], "=", 2); g.path([[205, 134], [205, 96]], ":", 2); g.path([[80, 95], [80, 125]], ":", 2);
g.path([[46, 82], [46, 125]], ":", 2);

const NAMES: Record<string, string> = {
  "0,0": "Gloamwood Edge", "1,0": "Ashfall Rise", "2,0": "Beacon Hall Grounds", "3,0": "Cinder Heights",
  "0,1": "Whispering Grove", "1,1": "Emberfen", "2,1": "Lantern Road", "3,1": "Tidemarch Lake",
  "0,2": "Reedmarsh", "1,2": "Orchard Fields", "2,2": "River Ford", "3,2": "Dunereach",
  "0,3": "Saltwind Shore", "1,3": "Lamplight Pier", "2,3": "Ford Mouth", "3,3": "Sunken Dunes",
};
const MUSIC: Record<string, string> = { "0,0": "wood", "1,0": "highland", "2,0": "hall", "3,0": "highland", "0,1": "wood", "1,1": "village", "0,2": "marsh", "1,2": "meadow" };
Object.assign(NAMES, {
  "4,0": "Emberspine Range", "5,0": "Hollow Crag", "6,0": "Skyreach Spire", "7,0": "Far Spine",
  "4,1": "Windward Steps", "5,1": "Kestrel Plateau", "6,1": "Highmeadow", "7,1": "Eastern Bluffs",
  "4,2": "Kestrel Ridge", "5,2": "Standing Stones", "6,2": "Quarry Rise", "7,2": "Far Bluffs",
  "4,3": "Crownwatch Moat", "5,3": "Eastmarch Road", "6,3": "Tallow Bridge", "7,3": "Gullwatch",
  "0,3": "Saltwind Meadow", "1,3": "Lamplight Fields", "2,3": "Ford Mouth", "3,3": "Crownwatch West",
  "0,4": "Saltwind Heath", "1,4": "Pilgrim's Rest", "2,4": "Tollgate Meadow", "3,4": "Crownwatch Fields", "4,4": "Crownwatch Keep", "5,4": "Eastmarch Fields", "6,4": "Reedwater Run", "7,4": "Gullwatch Downs",
  "0,5": "Ashglass Dunes", "1,5": "Sandwyrm Reach", "2,5": "Mirewick Edge", "3,5": "Mirewick Swamp", "4,5": "Ember Downs", "5,5": "Greatwater Shore", "6,5": "Greatwater Lake", "7,5": "Reed Coast",
  "0,6": "Ashglass South", "1,6": "Glassmere", "2,6": "Mirewick Fen", "3,6": "Drowned Hollow", "4,6": "Downs South", "5,6": "Greatwater West", "6,6": "Heron Island", "7,6": "Greatwater East",
  "0,7": "Cinder Strand", "1,7": "Bleached Bones", "2,7": "Mirewick South", "3,7": "Mudflats", "4,7": "Southern Reach", "5,7": "Gullcove", "6,7": "Greatwater South", "7,7": "Farshore",
});
Object.assign(MUSIC, {
  "4,0": "highland", "5,0": "highland", "6,0": "highland", "7,0": "highland", "4,1": "highland", "5,1": "highland", "6,1": "highland", "7,1": "highland", "4,2": "highland", "5,2": "highland", "6,2": "highland", "7,2": "highland",
  "4,3": "hall", "4,4": "hall", "0,2": "marsh", "2,5": "marsh", "3,5": "marsh", "2,6": "marsh", "3,6": "marsh", "2,7": "marsh", "3,7": "marsh", "0,1": "wood",
  "5,5": "lake", "6,5": "lake", "5,6": "lake", "6,6": "lake", "7,6": "lake", "6,7": "lake", "7,5": "lake", "5,7": "lake", "7,7": "lake", "6,4": "lake", "7,4": "lake",
  "0,5": "desert", "1,5": "desert", "0,6": "desert", "1,6": "desert", "0,7": "desert", "1,7": "desert",
  "4,0": "mountain", "5,0": "mountain", "6,0": "mountain", "7,0": "mountain", "4,1": "mountain",
  "5,1": "plateau", "6,1": "plateau", "7,1": "plateau", "4,2": "plateau", "5,2": "plateau", "6,2": "plateau", "7,2": "plateau",
  "4,3": "castle", "4,4": "castle", "3,3": "castle", "5,3": "castle",
});

// ---------------------------------------------------------------- overworld objects (global tile coords)
const wo: Obj[] = [];
const add = (o: Obj) => wo.push(o);
const sign = (id: string, x: number, y: number, text: string[]) => add({ t: "sign", id, x, y, label: "Sign", text });
const npc = (id: string, x: number, y: number) => add({ t: "npc", id, x, y });
const enemy = (kind: string, x: number, y: number) => add({ t: "enemy", kind, x, y });
const warp = (o: Record<string, unknown>) => add({ t: "warp", ...o } as Obj);

// houses -> interiors (spawn tile in the interior is south of the door; the interior door leads back out)
warp({ id: "w_ren", x: 41, y: 31, w: 1, h: 1, to: "ren_house", tx: 8.5, ty: 9.6, dir: "up", label: "Ren's Cottage" });
warp({ id: "w_shop", x: 52, y: 31, w: 1, h: 1, to: "lamp_shop", tx: 8.5, ty: 9.6, dir: "up", label: "Lampwright's Shop" });
warp({ id: "w_granny", x: 36, y: 57, w: 1, h: 1, to: "granny_house", tx: 7.5, ty: 7.6, dir: "up", label: "Maple's House" });
warp({ id: "w_cave_s", x: 46, y: 16, w: 1, h: 1, to: "hermit_cave", tx: 13, ty: 15.4, dir: "up", label: "Hermit's Cave" });
warp({ id: "w_cave_n", x: 44, y: 9, w: 1, h: 1, to: "hermit_cave", tx: 13, ty: 2.8, dir: "down", label: "Hermit's Cave (north mouth)" });
warp({ id: "w_cache", x: 110, y: 56, w: 1, h: 1, to: "dune_cache", tx: 6, ty: 7.6, dir: "up", label: "Dune Cache" });
warp({ id: "w_cistern", x: 79, y: 16, w: 2, h: 1, to: "cistern_r1", tx: 12, ty: 13.0, dir: "up", label: "Cistern Under-Hall", needFlag: "metIsolde", msg: "The grate is sealed. Warden Isolde in Emberfen holds the key-seal. Speak with her first." });
add({ t: "warp", id: "w_closed1", x: 58, y: 40, w: 1, h: 1, to: "", tx: 0, ty: 0, label: "Locked door", msg: "Locked. A note reads: 'Cobbler away, back after the Veil mends.'" });
add({ t: "warp", id: "w_closed2", x: 36, y: 42, w: 1, h: 1, to: "", tx: 0, ty: 0, label: "Locked door", msg: "Nobody answers. The shutters are nailed tight." });
g.put(58, 40, "D"); g.put(36, 42, "D");

// signs
sign("sg_grove", 16, 38, ["Whispering Grove.", "Lamp-keepers say the trees hum when the Veil is thin. Today they are humming."]);
sign("sg_gloam", 20, 15, ["Gloamwood Edge.", "Beyond here the pines grow close. Turn back if you hear the bells."]);
sign("sg_village", 44, 36, ["EMBERFEN", "Home of the lamp-keepers. Mind the well, and keep your lantern lit."]);
sign("sg_cave", 48, 20, ["Hermit's Cave, north. A quick way over the cliffs, if you don't mind the dark.", "Cliff ledges only go one way: down."]);
sign("sg_cross", 79, 36, ["Lantern Road.", "North: Beacon Hall. West: Emberfen. East: Tidemarch Lake. South: Orchard & the ford."]);
sign("sg_hall", 78, 21, ["BEACON HALL", "Dark since the night the Veil tore. The cistern stairs lie beyond the courtyard."]);
sign("sg_lake", 99, 41, ["Tidemarch Lake.", "Oswin the ferryman keeps the pier. He pays well for a lost lantern."]);
sign("sg_orchard", 44, 51, ["Maple's Orchard.", "Please keep to the paths. The hens are skittish."]);
sign("sg_marsh", 14, 52, ["Reedmarsh.", "The shallows slow your steps. Dry mounds hide old lanterns."]);
sign("sg_dune", 104, 62, ["Dunereach.", "Sand shifts. A cache is said to lie under the long cliff."]);
sign("sg_heights", 98, 12, ["Cinder Heights shelf.", "A hop down the ledge saves the walk, but you cannot climb back."]);
sign("sg_ford", 78, 58, ["River Ford.", "The old mill fell with the Veil. Soldiers of hollow make walk the ruin."]);

// NPCs
npc("isolde", 49, 40); npc("marla", 40, 39); npc("tam", 55, 40); npc("pip", 57, 65);
npc("oswin", 105, 40); npc("hollowkid", 61, 36); npc("kit", 49, 43);

// enemies
for (const [k, x, y] of [
  ["slime", 20, 14], ["slime", 22, 10], ["slime", 10, 18],
  ["slime", 40, 20], ["bat", 52, 19], ["slime", 56, 21],
  ["soldier", 74, 17], ["soldier", 86, 17], ["slime", 78, 22], ["bat", 82, 9],
  ["wisp", 100, 20], ["slime", 114, 16], ["bat", 108, 21],
  ["slime", 8, 40], ["slime", 22, 30], ["slime", 24, 44],
  ["slime", 70, 30], ["soldier", 90, 42], ["bat", 74, 44],
  ["crab", 105, 45], ["crab", 119, 45], ["slime", 100, 28],
  ["slime", 20, 52], ["slime", 6, 62], ["crab", 25, 60], ["bat", 12, 68],
  ["slime", 44, 54], ["bat", 52, 62], ["slime", 36, 64],
  ["soldier", 73, 58], ["soldier", 90, 64], ["slime", 70, 66], ["crab", 92, 70],
  ["crab", 104, 62], ["crab", 116, 66], ["bat", 108, 52], ["wisp", 120, 60],
  ["crab", 20, 84], ["slime", 40, 77], ["crab", 70, 84], ["slime", 92, 76], ["crab", 112, 84],
] as [string, number, number][]) enemy(k, x, y);

// bushes (cuttable) in the orchard + scattered
g.scatter(44, 54, 54, 62, "~", 0, R); // no-op placeholder to keep rng stable
const bushR = rngOf(77);
for (let y = 53; y <= 66; y++) for (let x = 41; x <= 58; x++) {
  if (bushR() < 0.11 && ".,*\"".includes(g.get(x, y)) && !wo.some((o) => o.x === x && o.y === y) && Math.abs(x - 46.5) > 1.5) add({ t: "bush", x, y });
}
for (let i = 0; i < 70; i++) {
  const x = 6 + Math.floor(bushR() * 116), y = 6 + Math.floor(bushR() * 74);
  if (".,*\"".includes(g.get(x, y)) && !wo.some((o) => o.x === x && o.y === y)) {
    let near = false;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (":=[]DSC~".includes(g.get(x + a, y + b))) near = true;
    if (!near) add({ t: "bush", x, y });
  }
}

// chests / pickups
add({ t: "chest", id: "ch_heights", x: 108, y: 6, item: "heart_piece", label: "Chest" });
add({ t: "chest", id: "ch_lantern", x: 12, y: 60, item: "brass_lantern", label: "Chest" });
add({ t: "chest", id: "ch_dunes", x: 118, y: 52, item: "glints_50", label: "Chest" });
add({ t: "chest", id: "ch_meadow", x: 88, y: 76, item: "glints_20", label: "Chest" });
g.put(112, 36, "L");

// ---------------------------------------------------------------- expansion objects
const hint = (id: string, x: number, y: number, text: string[]) => add({ t: "sign", id, x, y, label: "Hint stone", text });
// sealed doors
add({ t: "warp", id: "w_keep", x: 143, y: 96, w: 2, h: 1, to: "", tx: 0, ty: 0, label: "Crownwatch Keep", msg: "The Keep's doors are barred with three wardstone seals. Light the wardstones of Aurelane, and the Keep will open." });
add({ t: "warp", id: "w_spire", x: 205, y: 9, w: 2, h: 1, to: "spire_a1", tx: 12, ty: 13.0, dir: "up", label: "Skyreach Spire", needFlag: "wardenDead", msg: "A cold seal hums across the Spire door. Light the second lamp, and the Spire will open." });
// houses and caves
warp({ id: "w_outpost", x: 151, y: 36, w: 1, h: 1, to: "kestrel_outpost", tx: 8.5, ty: 9.6, dir: "up", label: "Kestrel Outpost" });
warp({ id: "w_mire", x: 101, y: 146, w: 1, h: 1, to: "mire_hut", tx: 7.5, ty: 7.6, dir: "up", label: "Pell's Hut" });
warp({ id: "w_pier", x: 160, y: 145, w: 1, h: 1, to: "pier_house", tx: 7.5, ty: 7.6, dir: "up", label: "Nell's Pier House" });
warp({ id: "w_quarry", x: 238, y: 58, w: 1, h: 1, to: "quarry_cache", tx: 6, ty: 7.6, dir: "up", label: "Quarry Cache" });
warp({ id: "w_vault", x: 52, y: 125, w: 1, h: 1, to: "sand_vault", tx: 6, ty: 7.6, dir: "up", label: "Sand Vault" });
warp({ id: "w_moss", x: 13, y: 36, w: 1, h: 1, to: "moss_a1", tx: 12, ty: 13.0, dir: "up", label: "Mossgate Ruins", needFlag: "cisternCleared", msg: "Roots clog the stair. Mend the Veil's first wound, and the stair will wake." });
g.put(13, 36, "S");
// gates: items open terrain
add({ t: "slab", id: "sl_tomb", x: 53, y: 145 });
add({ t: "rubble", id: "rb_quarry", x: 238, y: 59 });
// signs and hint stones
sign("sg_steps", 134, 15, ["Windward Steps.", "The plateau ramps are at the ends of the range. The ledges only drop you downhill."]);
sign("sg_castle", 147, 79, ["CROWNWATCH CASTLE", "Seat of the Lantern-Crown. Its Keep stays barred until three wardstones burn again."]);
sign("sg_plateau", 153, 31, ["Kestrel Plateau.", "The outpost keeps a shop for travellers who've climbed this far."]);
sign("sg_spire", 203, 12, ["SKYREACH SPIRE", "Sealed. The spire's lamp is the third wardstone."]);
sign("sg_desert", 52, 123, ["Ashglass Dunes.", "A vault is cut into the long scarp. Mind the heat and the crabs."]);
sign("sg_oasis", 33, 143, ["The Oasis.", "A sweet pool, a good place to rest. They say a stone tomb lies east of here, sealed by a slab only a gauntlet could lift."]);
sign("sg_swamp", 66, 138, ["Mirewick Swamp.", "Mind the sinking mud. A boardwalk leads to the hut of a scholar."]);
sign("sg_greatwater", 163, 138, ["Greatwater.", "Heron Island sits in the middle, reached by the long bridge from the north shore."]);
sign("sg_moat", 134, 94, ["Crownwatch Moat.", "Three bridges cross the water: north, west and south. The east bridge leads to the road."]);
sign("sg_eastroad", 170, 93, ["Eastmarch Road.", "West to Crownwatch, east to the far bluffs. The river bridge is ahead."]);
sign("sg_quarry", 232, 50, ["Quarry Rise.", "Cracked rubble blocks the old cache. Something with a hard dash could break it."]);
hint("hs_chasm", 208, 36, ["A broken causeway lies ahead. Boots that spiral could carry you across three tiles of nothing."]);
hint("hs_slab", 53, 148, ["The slab will not budge. Gauntlets of the dunes lift what hands cannot."]);
hint("hs_stones", 160, 53, ["Stand where the stones stand. Something rests at the heart of the ring."]);
hint("hs_island", 205, 133, ["The bridge ends on Heron Island. A shard rests where the herons nest."]);
hint("hs_moss", 15, 33, ["Mossgate Ruins lie beneath the grove. The stair wakes only once the first lamp is lit."]);
hint("hs_pocket", 143, 13, ["Cut the bush. Not every wall of stone is a wall."]);
// shard and treasure chests
const shard = (id: string, x: number, y: number) => add({ t: "chest", id, x, y, item: "heart_piece", label: "Chest" });
for (const [id, x, y] of [
  ["ch_pocket_w", 141, 5], ["ch_pocket_e", 224, 5], ["ch_ruin_n", 183, 16], ["ch_chasm", 220, 34], ["ch_oasis", 37, 152], ["ch_tomb", 53, 140],
  ["ch_swamp_walk", 94, 164], ["ch_hut", 108, 150], ["ch_island", 205, 155], ["ch_pier", 172, 156], ["ch_castle", 139, 99], ["ch_east_ruin", 228, 102],
  ["ch_shore_ruin", 243, 172], ["ch_heath", 20, 105], ["ch_farm", 236, 86], ["ch_south", 118, 178], ["ch_stones", 160, 50], ["ch_downs", 112, 128],
  ["ch_gull", 230, 130], 
] as [string, number, number][]) shard(id, x, y);
for (const [id, x, y, item] of [
  ["ch_g1", 60, 100, "glints_20"], ["ch_g2", 200, 16, "glints_50"], ["ch_g3", 90, 170, "glints_30"], ["ch_g4", 160, 182, "glints_20"], ["ch_g5", 24, 176, "glints_50"], ["ch_g6", 190, 60, "glints_30"], ["ch_g7", 120, 100, "glints_20"], ["ch_far", 246, 60, "glints_100"], ["ch_feather", 207, 155, "heron_feather"],
] as [string, number, number, string][]) add({ t: "chest", id, x, y, item, label: "Chest" });
// bush rings around the hidden shards; bush plugs for the sealed pockets
for (const [cx, cy] of [[20, 105], [236, 86], [118, 178]] as number[][]) for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (a || b) add({ t: "bush", x: cx + a, y: cy + b });
add({ t: "bush", x: 141, y: 10 }); add({ t: "bush", x: 224, y: 10 });
// NPCs
npc("garrick", 153, 40); npc("ferris", 172, 98); npc("mossa", 36, 150);
// enemies by biome
const usedTiles = new Set(wo.map((o) => `${o.x},${o.y}`));
function spawnEnemies(x0: number, y0: number, x1: number, y1: number, kinds: string[], n: number): void {
  let placed = 0;
  for (let tries = 0; placed < n && tries < n * 80; tries++) {
    const x = x0 + Math.floor(R2() * (x1 - x0 + 1)), y = y0 + Math.floor(R2() * (y1 - y0 + 1));
    if (!".,*\"s".includes(g.get(x, y)) || usedTiles.has(`${x},${y}`)) continue;
    let nearPath = false;
    for (let a = -2; a <= 2 && !nearPath; a++) for (let b = -2; b <= 2; b++) if (":=[]DWwjk".includes(g.get(x + a, y + b))) { nearPath = true; break; }
    if (nearPath) continue;
    usedTiles.add(`${x},${y}`); enemy(kinds[Math.floor(R2() * kinds.length)], x, y); placed++;
  }
}
spawnEnemies(128, 12, 252, 21, ["bat", "wisp", "soldier"], 10);
spawnEnemies(132, 24, 252, 69, ["soldier", "bat", "wisp", "soldier"], 22);
spawnEnemies(136, 88, 151, 103, ["soldier"], 6);
spawnEnemies(160, 72, 250, 119, ["soldier", "slime", "bat"], 16);
spawnEnemies(3, 118, 70, 185, ["crab", "crab", "wisp", "bat"], 22);
spawnEnemies(64, 120, 127, 185, ["slime", "slime", "wisp", "bat"], 24);
spawnEnemies(160, 120, 250, 185, ["crab", "slime", "bat"], 18);
spawnEnemies(96, 96, 160, 190, ["slime", "bat", "soldier"], 14);
spawnEnemies(3, 96, 95, 117, ["slime", "bat", "crab"], 12);
// bushes
{
  const bushR2 = rngOf(404);
  for (let i = 0; i < 160; i++) {
    const x = 128 + Math.floor(bushR2() * 120), y = 6 + Math.floor(bushR2() * 170), x2 = bushR2() < 0.4 ? 6 + Math.floor(bushR2() * 120) : x, y2 = x2 === x ? y : 84 + Math.floor(bushR2() * 96);
    if (".,*\"".includes(g.get(x2, y2)) && !wo.some((o) => o.x === x2 && o.y === y2)) {
      let near = false;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (":=[]DWwjkCS~".includes(g.get(x2 + a, y2 + b))) near = true;
      if (!near) add({ t: "bush", x: x2, y: y2 });
    }
  }
}

const GROUND = ".,*\"s:=uja+[";
// nudge enemies/npcs/bushes off blocked tiles
for (const o of wo) {
  if (!["enemy", "npc", "bush", "chest", "sign"].includes(o.t)) continue;
  if (GROUND.includes(g.get(o.x, o.y))) continue;
  let done = false;
  for (let r = 1; r < 6 && !done; r++) for (let dy = -r; dy <= r && !done; dy++) for (let dx = -r; dx <= r && !done; dx++) if (GROUND.includes(g.get(o.x + dx, o.y + dy)) && !wo.some((q) => q !== o && q.x === o.x + dx && q.y === o.y + dy)) { o.x += dx; o.y += dy; done = true; }
}
// ---- write chunks
const world = { id: "aurelane", chunkW: CW, chunkH: CH, cols: REGION_COLS, rows: REGION_ROWS, names: NAMES, chunks: [] as string[] };
for (let cy = 0; cy < REGION_ROWS; cy++)
  for (let cx = 0; cx < REGION_COLS; cx++) {
    const rows: string[] = [];
    for (let y = 0; y < CH; y++) {
      let s = "";
      for (let x = 0; x < CW; x++) s += g.get(cx * CW + x, cy * CH + y);
      rows.push(s);
    }
    const objects = wo
      .filter((o) => Math.floor(o.x / CW) === cx && Math.floor(o.y / CH) === cy)
      .map((o) => ({ ...o, x: o.x - cx * CW, y: o.y - cy * CH, ...(o.t === "warp" || o.t === "door" ? { gx: o.x, gy: o.y } : {}) }));
    const file = `c_${cx}_${cy}.json`;
    world.chunks.push(file);
    fs.writeFileSync(path.join(OUT, "aurelane", file), JSON.stringify({ cx, cy, name: NAMES[`${cx},${cy}`], music: MUSIC[`${cx},${cy}`] ?? "meadow", rows, objects }) + "\n");
  }
fs.writeFileSync(path.join(OUT, "aurelane", "world.json"), JSON.stringify(world) + "\n");
fs.mkdirSync("data", { recursive: true });
fs.writeFileSync("data/aurelane-preview.txt", g.lines().join("\n") + "\n");

/* ===================================================================== ROOMS */
interface RoomOut { id: string; name: string; music: string; kind: string; w: number; h: number; rows: string[]; objects: Obj[]; grid?: [number, number]; fight?: boolean; dark?: boolean }
const rooms: RoomOut[] = [];
function finishRoom(id: string, name: string, music: string, kind: string, r: Grid, extra: Partial<RoomOut> = {}): void {
  rooms.push({ id, name, music, kind, w: r.w, h: r.h, rows: r.lines(), objects: r.objs, ...extra });
}

// ---- interiors
function interior(w: number, h: number): Grid {
  const r = new Grid(w, h, "H");
  r.rect(1, 2, w - 2, h - 2, "_");
  return r;
}
{ // Ren's cottage 16x12
  const r = interior(16, 12);
  r.put(8, 11, "D");
  r.rect(7, 10, 9, 10, "%");
  r.put(2, 2, "b"); r.put(2, 3, "b"); r.put(3, 2, "h"); r.put(13, 2, "h"); r.put(11, 2, "F"); r.put(12, 2, "F"); r.put(6, 1, "N"); r.put(10, 1, "N");
  r.put(6, 5, "t"); r.put(7, 5, "t"); r.put(13, 5, "p"); r.put(13, 6, "p");
  r.rect(6, 6, 9, 8, "%");
  r.obj({ t: "chest", id: "ch_blade", x: 3, y: 6, item: "keeper_blade", label: "Chest" });
  r.obj({ t: "sign", id: "sg_ren_desk", x: 5, y: 5, label: "Desk", text: ["Ren's desk. Wick trimmings, a ledger of lamps, and a note in your master's hand:", "'The chest by the bed is yours. Take the blade before you go anywhere near the Hall.'"] });
  r.obj({ t: "warp", id: "w_ren_out", x: 8, y: 11, w: 1, h: 1, to: "world", tx: 41.5, ty: 32.6, dir: "down", label: "Out to Emberfen" });
  finishRoom("ren_house", "Ren's Cottage", "village", "interior", r, { spawn: [8, 9] } as Partial<RoomOut>);
}
{ // Lampwright's shop 16x12
  const r = interior(16, 12);
  r.put(8, 11, "D"); r.rect(7, 10, 9, 10, "%");
  r.rect(3, 4, 12, 4, "t"); r.put(3, 2, "h"); r.put(4, 2, "h"); r.put(12, 2, "h"); r.put(13, 2, "h"); r.put(7, 1, "N");
  r.put(2, 8, "p"); r.put(13, 8, "p");
  r.rect(4, 5, 11, 7, "%");
  r.obj({ t: "npc", id: "tamsin", x: 8, y: 3 });
  r.obj({ t: "shopitem", id: "shop_tonic", x: 5, y: 5.2, item: "tonic", price: 30, label: "Ember Tonic" });
  r.obj({ t: "shopitem", id: "shop_soup", x: 8, y: 5.2, item: "soup", price: 10, label: "Hearth Soup" });
  r.obj({ t: "shopitem", id: "shop_mote", x: 11, y: 5.2, item: "mote", price: 12, label: "Mote Jar" });
  r.obj({ t: "sign", id: "sg_shop", x: 12, y: 6, label: "Price board", text: ["Tonic 30 glints: refills every heart, carried until needed.", "Soup 10: warms four hearts. Mote Jar 12: refills your magic."] });
  r.obj({ t: "warp", id: "w_shop_out", x: 8, y: 11, w: 1, h: 1, to: "world", tx: 52.5, ty: 32.6, dir: "down", label: "Out to Emberfen" });
  finishRoom("lamp_shop", "Lampwright's Shop", "village", "interior", r);
}
{ // Granny Maple's house 14x10
  const r = interior(14, 10);
  r.put(7, 9, "D"); r.rect(6, 8, 8, 8, "%");
  r.put(2, 2, "b"); r.put(2, 3, "b"); r.put(11, 2, "F"); r.put(10, 2, "F"); r.put(6, 1, "N");
  r.put(11, 5, "t"); r.put(11, 6, "p"); r.rect(5, 4, 8, 6, "%");
  r.obj({ t: "npc", id: "granny", x: 7, y: 4 });
  r.obj({ t: "warp", id: "w_granny_out", x: 7, y: 9, w: 1, h: 1, to: "world", tx: 36.5, ty: 58.6, dir: "down", label: "Out to the Orchard" });
  finishRoom("granny_house", "Maple's House", "village", "interior", r);
}
{ // Hermit cave 24x18, south mouth bottom, north mouth top, winding path
  const r = new Grid(24, 18, "M");
  r.rect(10, 13, 14, 16, "d"); r.rect(10, 15, 14, 16, "d");
  r.rect(11, 3, 13, 14, "d");
  r.rect(4, 9, 20, 11, "d");
  r.rect(15, 3, 20, 7, "d"); r.rect(15, 8, 16, 8, "d"); // hermit alcove
  r.rect(11, 1, 13, 3, "d");
  r.rect(3, 12, 8, 14, "d");
  r.put(12, 17, "C"); r.put(12, 0, "C"); r.put(13, 17, "C"); r.put(13, 0, "C");
  r.put(11, 16, "d"); r.put(11, 1, "d");
  for (const [x, y] of [[4, 10], [19, 10], [16, 4], [20, 6], [4, 13], [7, 13]] as number[][]) r.put(x, y, "G");
  r.put(12, 0, "C"); r.put(13, 0, "C");
  r.obj({ t: "npc", id: "bram", x: 17, y: 5 });
  r.obj({ t: "chest", id: "ch_hermit", x: 5, y: 12, item: "glints_30", label: "Chest" });
  r.obj({ t: "sign", id: "sg_cave_in", x: 13.5, y: 12, label: "Scratched stone", text: ["Someone scratched an arrow pointing north: 'LIGHT THIS WAY'."] });
  r.obj({ t: "warp", id: "w_cave_out_s", x: 12, y: 17, w: 2, h: 1, to: "world", tx: 46.5, ty: 17.6, dir: "down", label: "Out to Ashfall Rise (south)" });
  r.obj({ t: "warp", id: "w_cave_out_n", x: 12, y: 0, w: 2, h: 1, to: "world", tx: 44.5, ty: 10.6, dir: "down", label: "Out to the plateau (north)" });
  finishRoom("hermit_cave", "Hermit's Cave", "cave", "interior", r, { dark: false });
}
{ // dune cache 12x10
  const r = new Grid(12, 10, "M");
  r.rect(3, 2, 8, 8, "d"); r.rect(5, 8, 6, 9, "d");
  r.put(3, 2, "G"); r.put(8, 2, "G"); r.put(3, 8, "G");
  r.put(5, 9, "C"); r.put(6, 9, "C");
  r.obj({ t: "chest", id: "ch_cache", x: 6, y: 3, item: "glints_100", label: "Chest" });
  r.obj({ t: "sign", id: "sg_cache", x: 4, y: 5, label: "Carved stone", text: ["'What the dunes hide, the dunes keep warm.'"] });
  r.obj({ t: "warp", id: "w_cache_out", x: 5, y: 9, w: 2, h: 1, to: "world", tx: 110.5, ty: 57.6, dir: "down", label: "Out to Dunereach" });
  finishRoom("dune_cache", "Dune Cache", "cave", "interior", r);
}

{ // Kestrel Outpost 16x12
  const r = interior(16, 12);
  r.put(8, 11, "D"); r.rect(7, 10, 9, 10, "%");
  r.rect(3, 4, 12, 4, "t"); r.put(3, 2, "h"); r.put(4, 2, "h"); r.put(12, 2, "h"); r.put(13, 2, "h"); r.put(7, 1, "N"); r.put(10, 1, "N");
  r.put(2, 8, "p"); r.put(13, 8, "p"); r.rect(4, 5, 11, 7, "%");
  r.obj({ t: "npc", id: "garrick", x: 8, y: 3 });
  r.obj({ t: "shopitem", id: "shop_k_tonic", x: 5, y: 5.2, item: "tonic", price: 26, label: "Ember Tonic" });
  r.obj({ t: "shopitem", id: "shop_k_stew", x: 7.3, y: 5.2, item: "stew", price: 22, label: "Fenwick Stew" });
  r.obj({ t: "shopitem", id: "shop_k_elixir", x: 9.6, y: 5.2, item: "elixir", price: 75, label: "Ember Elixir" });
  r.obj({ t: "shopitem", id: "shop_k_mote", x: 12, y: 5.2, item: "mote", price: 10, label: "Mote Jar" });
  r.obj({ t: "sign", id: "sg_outpost", x: 12, y: 7, label: "Price board", text: ["Tonic 26, Fenwick Stew 22 (six hearts), Ember Elixir 75 (every heart and all your magic), Mote Jar 10. Garrick's prices beat the lowland shop."] });
  r.obj({ t: "warp", id: "w_outpost_out", x: 8, y: 11, w: 1, h: 1, to: "world", tx: 151.5, ty: 37.6, dir: "down", label: "Out to Kestrel Plateau" });
  finishRoom("kestrel_outpost", "Kestrel Outpost", "village", "interior", r);
}
{ // Pell's hut 14x10
  const r = interior(14, 10);
  r.put(7, 9, "D"); r.rect(6, 8, 8, 8, "%");
  r.put(2, 2, "h"); r.put(3, 2, "h"); r.put(10, 2, "h"); r.put(11, 2, "h"); r.put(6, 1, "N"); r.put(2, 5, "p"); r.put(11, 6, "p");
  r.rect(5, 4, 8, 6, "%"); r.put(9, 2, "F");
  r.obj({ t: "npc", id: "pell", x: 7, y: 4 });
  r.obj({ t: "sign", id: "sg_pell", x: 4, y: 3, label: "Scroll rack", text: ["Dozens of scrolls, all waterlogged. A neat label reads: 'MOSSGATE RUINS: do not enter without a lantern. Or a sword.'"] });
  r.obj({ t: "warp", id: "w_mire_out", x: 7, y: 9, w: 1, h: 1, to: "world", tx: 101.5, ty: 147.6, dir: "down", label: "Out to Mirewick" });
  finishRoom("mire_hut", "Pell's Hut", "village", "interior", r);
}
{ // Nell's pier house 14x10
  const r = interior(14, 10);
  r.put(7, 9, "D"); r.rect(6, 8, 8, 8, "%");
  r.put(2, 2, "b"); r.put(2, 3, "b"); r.put(11, 2, "F"); r.put(10, 2, "F"); r.put(6, 1, "N");
  r.put(11, 5, "t"); r.put(11, 6, "p"); r.rect(5, 4, 8, 6, "%");
  r.obj({ t: "npc", id: "nell", x: 7, y: 4 });
  r.obj({ t: "warp", id: "w_pier_out", x: 7, y: 9, w: 1, h: 1, to: "world", tx: 160.5, ty: 146.6, dir: "down", label: "Out to Greatwater" });
  finishRoom("pier_house", "Nell's Pier House", "village", "interior", r);
}
{ // Quarry cache 12x10 (behind rubble)
  const r = new Grid(12, 10, "M");
  r.rect(3, 2, 8, 8, "d"); r.rect(5, 8, 6, 9, "d");
  r.put(3, 2, "G"); r.put(8, 2, "G"); r.put(8, 8, "G");
  r.put(5, 9, "C"); r.put(6, 9, "C");
  r.obj({ t: "chest", id: "ch_quarry", x: 6, y: 3, item: "heart_piece", label: "Chest" });
  r.obj({ t: "sign", id: "sg_quarry_in", x: 4, y: 5, label: "Carved stone", text: ["'Dig where the dust is thickest.'"] });
  r.obj({ t: "warp", id: "w_quarry_out", x: 5, y: 9, w: 2, h: 1, to: "world", tx: 238.5, ty: 60.6, dir: "down", label: "Out to Quarry Rise" });
  finishRoom("quarry_cache", "Quarry Cache", "cave", "interior", r);
}
{ // Sand vault 14x10
  const r = new Grid(14, 10, "M");
  r.rect(3, 2, 10, 8, "d"); r.rect(6, 8, 7, 9, "d");
  r.put(3, 2, "G"); r.put(10, 2, "G"); r.put(10, 8, "G"); r.put(3, 8, "G");
  r.put(6, 9, "C"); r.put(7, 9, "C");
  r.obj({ t: "chest", id: "ch_vault", x: 7, y: 3, item: "glints_100", label: "Chest" });
  r.obj({ t: "chest", id: "ch_skin", x: 4, y: 7, item: "waterskin", label: "Chest" });
  r.obj({ t: "enemy", kind: "bat", x: 5, y: 4 }); r.obj({ t: "enemy", kind: "bat", x: 9, y: 5 });
  r.obj({ t: "sign", id: "sg_vault", x: 5, y: 6, label: "Carved stone", text: ["'The sand keeps no secret from a patient hand.'"] });
  r.obj({ t: "warp", id: "w_vault_out", x: 6, y: 9, w: 2, h: 1, to: "world", tx: 52.5, ty: 126.6, dir: "down", label: "Out to Ashglass Dunes" });
  finishRoom("sand_vault", "Sand Vault", "cave", "interior", r);
}

// ---- Cistern Under-Hall (24x16 rooms; interior x 2..21, y 2..13)
function droom(): Grid {
  const r = new Grid(24, 16, "#");
  r.rect(2, 2, 21, 13, ";");
  for (let x = 2; x <= 21; x++) for (let y = 2; y <= 13; y++) if (((x >> 1) + (y >> 1)) % 5 === 0) r.put(x, y, "n");
  return r;
}
type Side = "N" | "S" | "E" | "W";
const GAP: Record<Side, [number, number, number, number]> = { N: [11, 0, 2, 2], S: [11, 14, 2, 2], W: [0, 7, 2, 2], E: [22, 7, 2, 2] };
const OPP: Record<Side, Side> = { N: "S", S: "N", E: "W", W: "E" };
const ENTER: Record<Side, [number, number]> = { N: [12, 2.7], S: [12, 13.3], W: [2.7, 8], E: [21.3, 8] };
function gap(r: Grid, side: Side): void {
  const [x, y, w, h] = GAP[side];
  r.rect(x, y, x + w - 1, y + h - 1, ";");
}
/** A door on `side` of room `from` leading to `to`. */
function door(r: Grid, from: string, side: Side, to: string, kind: string, id: string, label: string, extra: Record<string, unknown> = {}): void {
  gap(r, side);
  const [x, y, w, h] = GAP[side];
  const [tx, ty] = ENTER[OPP[side]];
  r.obj({ t: "door", id, x, y, w, h, kind, to, tx, ty, label, side, from, ...extra });
}
function pits(r: Grid, x0: number, y0: number, x1: number, y1: number): void { r.rect(x0, y0, x1, y1, "X"); }
function pillar(r: Grid, x: number, y: number): void { r.put(x, y, "I"); }
function braziers(r: Grid): void { for (const [x, y] of [[2, 2], [21, 2], [2, 13], [21, 13]]) r.put(x, y, "B"); }

const D0 = (g2: [number, number]) => ({ grid: g2 });
{ // R1 vestibule
  const r = droom(); braziers(r);
  r.rect(4, 4, 5, 11, "Z");
  for (const [x, y] of [[9, 5], [15, 5], [9, 10], [15, 10]]) pillar(r, x, y);
  r.put(11, 14, ";"); r.put(12, 14, ";");
  gap(r, "S");
  r.obj({ t: "warp", id: "w_c_exit", x: 11, y: 14, w: 2, h: 2, to: "world", tx: 80, ty: 17.6, dir: "down", label: "Stairs up to Beacon Hall" });
  door(r, "cistern_r1", "N", "cistern_r2", "open", "d_r1r2", "Door to Sump Corridor");
  door(r, "cistern_r1", "E", "cistern_r3", "open", "d_r1r3", "Door to Pump Room");
  r.obj({ t: "enemy", kind: "slime", x: 8, y: 7 }); r.obj({ t: "enemy", kind: "slime", x: 17, y: 8 });
  r.obj({ t: "chest", id: "ch_map", x: 19, y: 4, item: "cistern_map", label: "Chest" });
  r.obj({ t: "sign", id: "sg_c1", x: 14, y: 12, label: "Etched plaque", text: ["CISTERN UNDER-HALL", "Here the Hall's lamp-oil was kept, and the tide let in to cool it. The tide is still here."] });
  finishRoom("cistern_r1", "Flooded Vestibule", "cistern", "dungeon", r, D0([1, 2]));
}
{ // R2 sump corridor
  const r = droom(); braziers(r);
  pits(r, 6, 5, 8, 8); pits(r, 14, 7, 16, 10); pits(r, 11, 3, 12, 4);
  for (const [x, y] of [[4, 11], [19, 4]]) pillar(r, x, y);
  door(r, "cistern_r2", "S", "cistern_r1", "open", "d_r1r2", "Door to Vestibule");
  door(r, "cistern_r2", "N", "cistern_r5", "small", "L_r2r5", "Locked door (small key)");
  door(r, "cistern_r2", "E", "cistern_r4", "open", "d_r2r4", "Door to Gallery");
  r.obj({ t: "enemy", kind: "bat", x: 7, y: 11 }); r.obj({ t: "enemy", kind: "bat", x: 18, y: 4 }); r.obj({ t: "enemy", kind: "bat", x: 12, y: 8 });
  r.obj({ t: "chest", id: "ch_compass", x: 3.5, y: 4, item: "cistern_compass", label: "Chest" });
  finishRoom("cistern_r2", "Sump Corridor", "cistern", "dungeon", r, D0([1, 1]));
}
{ // R3 pump room (fight room)
  const r = droom(); braziers(r);
  r.rect(8, 5, 15, 5, "Z"); r.rect(8, 10, 15, 10, "Z");
  for (const [x, y] of [[6, 7], [17, 7], [6, 9], [17, 9]]) pillar(r, x, y);
  door(r, "cistern_r3", "W", "cistern_r1", "open", "d_r1r3", "Door to Vestibule");
  door(r, "cistern_r3", "N", "cistern_r4", "open", "d_r3r4", "Door to Gallery");
  r.obj({ t: "enemy", kind: "crab", x: 8, y: 8 }); r.obj({ t: "enemy", kind: "crab", x: 16, y: 8 }); r.obj({ t: "enemy", kind: "slime", x: 12, y: 12 });
  r.obj({ t: "chest", id: "ch_keyA", x: 19.5, y: 4, item: "small_key", label: "Chest" });
  finishRoom("cistern_r3", "Pump Room", "cistern", "dungeon", r, { ...D0([2, 2]), fight: true });
}
{ // R4 gallery
  const r = droom(); braziers(r);
  r.rect(13, 2, 13, 4, "#"); pits(r, 14, 5, 21, 6); // the crystal nook is cut off by a pit band
  r.rect(14, 2, 21, 4, ";");
  r.rect(6, 4, 7, 4, "I"); r.rect(6, 10, 7, 10, "I");
  door(r, "cistern_r4", "W", "cistern_r2", "open", "d_r2r4", "Door to Sump Corridor");
  door(r, "cistern_r4", "S", "cistern_r3", "open", "d_r3r4", "Door to Pump Room");
  door(r, "cistern_r4", "N", "cistern_r7", "small", "L_r4r7", "Locked door (small key)");
  door(r, "cistern_r4", "E", "cistern_r6", "switch", "S_r4r6", "Sealed gate (crystal)", { crystal: "cr_r4" });
  r.obj({ t: "crystal", id: "cr_r4", opens: "S_r4r6", x: 17.5, y: 3.5, label: "Crystal switch (needs a ranged strike)" });
  r.obj({ t: "enemy", kind: "wisp", x: 8, y: 6 }); r.obj({ t: "enemy", kind: "wisp", x: 9, y: 11 });
  r.obj({ t: "chest", id: "ch_keyB", x: 3.5, y: 11.5, item: "small_key", label: "Chest" });
  finishRoom("cistern_r4", "Cistern Gallery", "cistern", "dungeon", r, D0([2, 1]));
}
{ // R5 reliquary (mini-boss, fight room)
  const r = droom(); braziers(r);
  for (const [x, y] of [[6, 4], [17, 4], [6, 11], [17, 11]]) pillar(r, x, y);
  r.rect(10, 6, 13, 9, "m");
  door(r, "cistern_r5", "S", "cistern_r2", "small", "L_r2r5", "Locked door (small key)");
  r.obj({ t: "enemy", kind: "marshal", x: 12, y: 7 });
  r.obj({ t: "chest", id: "ch_bigkey", x: 12, y: 4.2, item: "big_key", label: "Chest", reveal: "marshalDead" });
  finishRoom("cistern_r5", "Reliquary of Wicks", "cistern", "dungeon", r, { ...D0([1, 0]), fight: true, dark: true });
}
{ // R6 sluice gate
  const r = droom(); braziers(r);
  r.rect(6, 2, 7, 9, "Z"); r.rect(6, 12, 7, 13, "Z"); r.rect(13, 5, 14, 12, "Z");
  r.put(15, 4, "I"); r.put(18, 11, "I");
  door(r, "cistern_r6", "W", "cistern_r4", "switch", "S_r4r6", "Sealed gate (crystal)", { crystal: "cr_r4" });
  door(r, "cistern_r6", "N", "cistern_r8", "big", "B_r6r8", "Great door (big key)");
  r.obj({ t: "enemy", kind: "wisp", x: 18, y: 6 }); r.obj({ t: "enemy", kind: "bat", x: 10, y: 6 }); r.obj({ t: "enemy", kind: "bat", x: 17, y: 10 }); r.obj({ t: "enemy", kind: "crab", x: 10, y: 11 });
  r.obj({ t: "sign", id: "sg_c6", x: 9, y: 12.5, label: "Etched plaque", text: ["Past this gate the old sluice thrums. Something in the tide does not like the dark to be disturbed."] });
  finishRoom("cistern_r6", "Sluice Gate", "cistern", "dungeon", r, D0([3, 1]));
}
{ // R7 disc hall (big chest)
  const r = droom(); braziers(r);
  r.rect(9, 4, 14, 4, "I"); r.rect(9, 9, 14, 9, "I"); r.rect(9, 5, 9, 8, "I"); r.rect(14, 5, 14, 8, "I"); r.rect(10, 5, 13, 8, "m");
  door(r, "cistern_r7", "S", "cistern_r4", "small", "L_r4r7", "Locked door (small key)");
  r.rect(11, 9, 12, 9, ";"); // gap in the south colonnade
  r.obj({ t: "chest", id: "ch_disc", x: 11, y: 6, item: "gale_disc", big: true, label: "Big chest" });
  r.obj({ t: "enemy", kind: "soldier", x: 6, y: 6 }); r.obj({ t: "enemy", kind: "soldier", x: 18, y: 6 });
  finishRoom("cistern_r7", "Hall of the Gale Disc", "cistern", "dungeon", r, D0([2, 0]));
}
{ // R8 boss arena
  const r = droom(); braziers(r);
  r.rect(8, 4, 15, 8, "Z");
  door(r, "cistern_r8", "S", "cistern_r6", "big", "B_r6r8", "Great door (big key)");
  r.obj({ t: "enemy", kind: "sluicejaw", x: 12, y: 6 });
  r.obj({ t: "warp", id: "w_c_exit2", x: 20, y: 3, w: 1, h: 1, to: "world", tx: 80, ty: 17.6, dir: "down", label: "Stairs up to Beacon Hall", reveal: "bossDead" });
  r.put(20, 3, "S");
  finishRoom("cistern_r8", "Sluice Throne", "boss", "dungeon", r, D0([3, 0]));
}

// ---- Mossgate Ruins: three floors (ground, upper, cellar), two small keys, a Warden's Key, a big chest (Dune Gauntlet), a slab-sealed boss door
const R3 = rngOf(0x6055);
function mroom(): Grid {
  const r = new Grid(24, 16, "#");
  r.rect(2, 2, 21, 13, "+");
  for (let y = 2; y <= 13; y++) for (let x = 2; x <= 21; x++) if (R3() < 0.2) r.put(x, y, "a");
  return r;
}
const MF = (grid: [number, number], floor: number, extra: Record<string, unknown> = {}) => ({ grid, floor, ...extra }) as Partial<RoomOut>;
const stairs = (r: Grid, id: string, x: number, y: number, to: string, tx: number, ty: number, label: string, extra: Record<string, unknown> = {}) => { r.put(x, y, "S"); r.obj({ t: "warp", id, x, y, w: 1, h: 1, to, tx, ty, label, ...extra }); };
const en = (r: Grid, kind: string, x: number, y: number) => r.obj({ t: "enemy", kind, x, y });
{ // A1 root-choked gate
  const r = mroom(); braziers(r);
  r.put(11, 14, "+"); r.put(12, 14, "+"); gap(r, "S"); r.rect(11, 14, 12, 15, "S");
  r.obj({ t: "warp", id: "w_moss_exit", x: 11, y: 14, w: 2, h: 2, to: "world", tx: 13.5, ty: 37.6, dir: "down", label: "Stairs up to Whispering Grove" });
  for (const [x, y] of [[8, 5], [15, 5], [8, 10], [15, 10]]) pillar(r, x, y);
  door(r, "moss_a1", "N", "moss_a2", "open", "d_a1a2", "Door to Fern Hall");
  door(r, "moss_a1", "E", "moss_a3", "open", "d_a1a3", "Door to Beetle Pit");
  en(r, "thornling", 6, 7); en(r, "thornling", 17, 8); en(r, "beetle", 12, 7);
  r.obj({ t: "chest", id: "ch_mmap", x: 19, y: 4, item: "moss_map", label: "Chest" });
  r.obj({ t: "sign", id: "sg_m1", x: 14, y: 12, label: "Etched plaque", text: ["MOSSGATE RUINS", "A gatehouse of the old lamp-keepers, swallowed by roots. Three floors, two locks, and one very patient warden."] });
  finishRoom("moss_a1", "Root-choked Gate", "moss", "dungeon", r, MF([1, 2], 0));
}
{ // A2 fern hall
  const r = mroom(); braziers(r);
  r.rect(6, 5, 7, 10, "a"); r.rect(16, 5, 17, 10, "a");
  for (const [x, y] of [[9, 4], [14, 4], [9, 11], [14, 11]]) pillar(r, x, y);
  door(r, "moss_a2", "S", "moss_a1", "open", "d_a1a2", "Door to the Gate");
  door(r, "moss_a2", "E", "moss_a4", "open", "d_a2a4", "Door to Moss Gallery");
  en(r, "thornling", 7, 4); en(r, "thornling", 16, 12); en(r, "thornling", 4, 9); en(r, "mirefly", 12, 8); en(r, "mirefly", 11, 6);
  r.obj({ t: "chest", id: "ch_mkeyA", x: 3.5, y: 11.5, item: "small_key", label: "Chest" });
  finishRoom("moss_a2", "Fern Hall", "moss", "dungeon", r, MF([1, 1], 0));
}
{ // A3 beetle pit
  const r = mroom(); braziers(r);
  pits(r, 8, 6, 15, 9); r.rect(11, 6, 12, 9, "+");
  door(r, "moss_a3", "W", "moss_a1", "open", "d_a1a3", "Door to the Gate");
  door(r, "moss_a3", "N", "moss_a4", "open", "d_a3a4", "Door to Moss Gallery");
  stairs(r, "w_a3_down", 20, 3, "moss_c1", 3.5, 11.4, "Stairs down to the Cellar", { dir: "up" });
  en(r, "beetle", 5, 11); en(r, "beetle", 18, 11); en(r, "archer", 18, 5);
  r.obj({ t: "chest", id: "ch_mcompass", x: 19.5, y: 12, item: "moss_compass", label: "Chest" });
  finishRoom("moss_a3", "Beetle Pit", "moss", "dungeon", r, MF([2, 2], 0));
}
{ // A4 moss gallery (stairs up)
  const r = mroom(); braziers(r);
  r.rect(6, 4, 7, 4, "I"); r.rect(6, 11, 7, 11, "I"); r.rect(16, 4, 17, 4, "I"); r.rect(16, 11, 17, 11, "I");
  door(r, "moss_a4", "W", "moss_a2", "open", "d_a2a4", "Door to Fern Hall");
  door(r, "moss_a4", "S", "moss_a3", "open", "d_a3a4", "Door to Beetle Pit");
  stairs(r, "w_a4_up", 20, 3, "moss_b1", 20.5, 11.4, "Stairs up to the Upper floor", { dir: "up" });
  en(r, "archer", 7, 8); en(r, "archer", 16, 8); en(r, "thornling", 12, 11);
  r.obj({ t: "sign", id: "sg_m4", x: 12, y: 12.5, label: "Etched plaque", text: ["The stair at the north-east corner climbs to the upper hall. The scholar's study lies behind a lock."] });
  finishRoom("moss_a4", "Moss Gallery", "moss", "dungeon", r, MF([2, 1], 0));
}
{ // B1 upper landing
  const r = mroom(); braziers(r);
  r.rect(9, 6, 14, 9, "a");
  stairs(r, "w_b1_down", 20, 12, "moss_a4", 20.5, 4.6, "Stairs down to the Gallery", { dir: "down" });
  door(r, "moss_b1", "N", "moss_b4", "small", "L_b1b4", "Locked door (small key)");
  door(r, "moss_b1", "W", "moss_b2", "small", "L_b1b2", "Locked door (small key)");
  door(r, "moss_b1", "E", "moss_b3", "open", "d_b1b3", "Door to the Terrace");
  en(r, "archer", 8, 5); en(r, "archer", 16, 11); en(r, "mirefly", 12, 7); en(r, "mirefly", 11, 9);
  finishRoom("moss_b1", "Upper Landing", "moss", "dungeon", r, MF([2, 1], 1));
}
{ // B2 archivist's study
  const r = mroom(); braziers(r);
  r.rect(4, 4, 7, 4, "t"); r.rect(16, 4, 19, 4, "t"); r.rect(4, 11, 7, 11, "t"); r.rect(16, 11, 19, 11, "t");
  door(r, "moss_b2", "E", "moss_b1", "small", "L_b1b2", "Locked door (small key)");
  r.obj({ t: "chest", id: "ch_folio", x: 12, y: 5, item: "archivist_folio", label: "Chest" });
  r.obj({ t: "sign", id: "sg_b2", x: 10, y: 9, label: "Waterlogged desk", text: ["Pell's desk. A note, half-dissolved: 'If I leave the folio here, the damp will have it. If I carry it, the roots will. Either way, someone should come.'"] });
  finishRoom("moss_b2", "Archivist's Study", "moss", "dungeon", r, MF([1, 1], 1));
}
{ // B3 overgrown terrace
  const r = mroom(); braziers(r);
  pits(r, 5, 5, 8, 10); pits(r, 15, 5, 18, 10); r.rect(5, 7, 8, 8, "+"); r.rect(15, 7, 18, 8, "+");
  door(r, "moss_b3", "W", "moss_b1", "open", "d_b1b3", "Door to the Landing");
  en(r, "beetle", 12, 5); en(r, "beetle", 12, 11); en(r, "thornling", 4, 12); en(r, "thornling", 19, 4); en(r, "thornling", 19, 12);
  r.obj({ t: "chest", id: "ch_mkeyB", x: 19.5, y: 8, item: "small_key", label: "Chest" });
  finishRoom("moss_b3", "Overgrown Terrace", "moss", "dungeon", r, MF([3, 1], 1));
}
{ // B4 rootknight chamber (mini-boss)
  const r = mroom(); braziers(r);
  for (const [x, y] of [[6, 4], [17, 4], [6, 11], [17, 11]]) pillar(r, x, y);
  r.rect(10, 6, 13, 9, "m");
  door(r, "moss_b4", "S", "moss_b1", "small", "L_b1b4", "Locked door (small key)");
  en(r, "rootknight", 12, 7);
  r.obj({ t: "chest", id: "ch_mkey", x: 12, y: 4.2, item: "moss_key", label: "Chest", reveal: "rootknightDead" });
  finishRoom("moss_b4", "Rootknight's Chamber", "moss", "dungeon", r, { ...MF([2, 0], 1), fight: true, dark: true });
}
{ // C1 cellar landing
  const r = mroom(); braziers(r);
  stairs(r, "w_c1_up", 3, 12, "moss_a3", 20.5, 4.6, "Stairs up to the Beetle Pit", { dir: "down" });
  r.rect(8, 6, 15, 6, "I"); r.rect(8, 10, 15, 10, "I");
  door(r, "moss_c1", "N", "moss_c2", "open", "d_c1c2", "Door to the Gauntlet Hall");
  door(r, "moss_c1", "E", "moss_c3", "big", "B_c1c3", "Great door (Warden's Key)", { key: "moss_key" });
  r.obj({ t: "slab", id: "sl_c1a", x: 21, y: 7 }); r.obj({ t: "slab", id: "sl_c1b", x: 21, y: 8 });
  r.obj({ t: "sign", id: "sg_c1m", x: 18, y: 12.5, label: "Heavy slabs", text: ["Two slabs block the great door's threshold. No hands can shift them; only the Gauntlet of the dunes could."] });
  en(r, "beetle", 10, 8); en(r, "beetle", 16, 8); en(r, "thornling", 6, 4); en(r, "thornling", 18, 12);
  finishRoom("moss_c1", "Cellar Landing", "moss", "dungeon", r, { ...MF([2, 1], 2), dark: true });
}
{ // C2 hall of the gauntlet (big chest)
  const r = mroom(); braziers(r);
  r.rect(9, 4, 14, 4, "I"); r.rect(9, 9, 14, 9, "I"); r.rect(9, 5, 9, 8, "I"); r.rect(14, 5, 14, 8, "I"); r.rect(10, 5, 13, 8, "m");
  r.rect(11, 9, 12, 9, "+");
  door(r, "moss_c2", "S", "moss_c1", "open", "d_c1c2", "Door to the Landing");
  r.obj({ t: "chest", id: "ch_gauntlet", x: 11, y: 6, item: "dune_gauntlet", big: true, key: "moss_key", label: "Big chest" });
  en(r, "archer", 5, 6); en(r, "archer", 18, 6);
  finishRoom("moss_c2", "Hall of the Gauntlet", "moss", "dungeon", r, { ...MF([2, 0], 2), dark: true });
}
{ // C3 warden's court (boss)
  const r = mroom(); braziers(r);
  r.rect(8, 4, 15, 8, "m");
  door(r, "moss_c3", "W", "moss_c1", "big", "B_c1c3", "Great door (Warden's Key)", { key: "moss_key", tx: 19.8, ty: 8 });
  en(r, "barkwarden", 12, 6);
  r.obj({ t: "warp", id: "w_moss_exit2", x: 20, y: 3, w: 1, h: 1, to: "world", tx: 13.5, ty: 37.6, dir: "down", label: "Stairs up to Whispering Grove", reveal: "wardenDead" });
  r.put(20, 3, "S");
  finishRoom("moss_c3", "The Warden's Court", "moss", "dungeon", r, MF([3, 1], 2));
}


// ---- Skyreach Spire: five floors (foundation, gallery, library, belfry, roost), three small keys, a Belfry Key (Cloudmarshal Vesk), big chest (Ember Bow), thicket-sealed great door, Stormfinch Mol on the roost
const R4 = rngOf(0x5b17e);
function sroom(): Grid {
  const r = new Grid(24, 16, "#");
  r.rect(2, 2, 21, 13, "_");
  for (let y = 2; y <= 13; y++) for (let x = 2; x <= 21; x++) if (R4() < 0.14) r.put(x, y, "+");
  return r;
}
const SF = (grid: [number, number], floor: number, extra: Record<string, unknown> = {}) => ({ grid, floor, ...extra }) as Partial<RoomOut>;
const SM = "spire"; // track id
{ // F0 foundation
  let r = sroom(); braziers(r);
  r.put(11, 14, "_"); r.put(12, 14, "_"); gap(r, "S"); r.rect(11, 14, 12, 15, "S");
  r.obj({ t: "warp", id: "w_spire_exit", x: 11, y: 14, w: 2, h: 2, to: "world", tx: 205.5, ty: 11.6, dir: "down", label: "Out to Skyreach" });
  for (const [x, y] of [[7, 6], [16, 6], [7, 10], [16, 10]]) pillar(r, x, y);
  door(r, "spire_a1", "N", "spire_a2", "open", "d_sa1a2", "Door to the Windcellar");
  door(r, "spire_a1", "E", "spire_a3", "open", "d_sa1a3", "Door to the Gear Room");
  en(r, "archer", 6, 8); en(r, "mirefly", 17, 8); en(r, "mirefly", 12, 5);
  r.obj({ t: "sign", id: "sg_s1", x: 14, y: 12, label: "Etched plaque", text: ["SKYREACH SPIRE", "Five floors of lamp-keepers' work, climbed by wind and by stair. The belfry's key is held by the one who keeps the bells."] });
  finishRoom("spire_a1", "Spire Foot", SM, "dungeon", r, SF([1, 2], 0));
  r = sroom(); braziers(r);
  r.rect(6, 5, 7, 10, "I"); r.rect(16, 5, 17, 10, "I");
  door(r, "spire_a2", "S", "spire_a1", "open", "d_sa1a2", "Door to the Foot");
  door(r, "spire_a2", "E", "spire_a4", "small", "L_sa2a4", "Locked door (small key)");
  en(r, "beetle", 10, 8); en(r, "thornling", 4, 4); en(r, "thornling", 19, 12); en(r, "mirefly", 12, 11);
  r.obj({ t: "chest", id: "ch_skeyA", x: 3.5, y: 11.5, item: "small_key", label: "Chest" });
  finishRoom("spire_a2", "Windcellar", SM, "dungeon", r, SF([1, 1], 0));
  r = sroom(); braziers(r);
  pits(r, 8, 6, 15, 9); r.rect(11, 6, 12, 9, "_");
  door(r, "spire_a3", "W", "spire_a1", "open", "d_sa1a3", "Door to the Foot");
  en(r, "archer", 5, 11); en(r, "archer", 18, 11); en(r, "beetle", 18, 4);
  r.obj({ t: "chest", id: "ch_smap", x: 19.5, y: 12, item: "spire_map", label: "Chest" });
  finishRoom("spire_a3", "Gear Room", SM, "dungeon", r, SF([2, 2], 0));
  r = sroom(); braziers(r);
  r.rect(6, 4, 7, 4, "I"); r.rect(16, 4, 17, 4, "I");
  door(r, "spire_a4", "W", "spire_a2", "small", "L_sa2a4", "Locked door (small key)");
  stairs(r, "w_sa4_up", 20, 3, "spire_b1", 20.5, 11.4, "Stairs up to the Gallery", { dir: "up" });
  en(r, "soldier", 8, 8); en(r, "soldier", 15, 8); en(r, "archer", 12, 11);
  finishRoom("spire_a4", "Stair Hall", SM, "dungeon", r, SF([2, 1], 0));
}
{ // F1 gallery
  let r = sroom(); braziers(r);
  stairs(r, "w_sb1_down", 20, 12, "spire_a4", 20.5, 4.6, "Stairs down to the Stair Hall", { dir: "down" });
  door(r, "spire_b1", "W", "spire_b2", "open", "d_sb1b2", "Door to the Reading Gallery");
  door(r, "spire_b1", "E", "spire_b3", "open", "d_sb1b3", "Door to the Wind Terrace");
  door(r, "spire_b1", "N", "spire_b4", "small", "L_sb1b4", "Locked door (small key)");
  en(r, "archer", 7, 5); en(r, "archer", 17, 11); en(r, "skipper", 12, 8); en(r, "mirefly", 10, 10);
  finishRoom("spire_b1", "Gallery Landing", SM, "dungeon", r, SF([2, 1], 1));
  r = sroom(); braziers(r);
  r.rect(4, 5, 8, 5, "h"); r.rect(15, 5, 19, 5, "h"); r.rect(4, 10, 8, 10, "h"); r.rect(15, 10, 19, 10, "h");
  door(r, "spire_b2", "E", "spire_b1", "open", "d_sb1b2", "Door to the Landing");
  en(r, "thornling", 6, 7); en(r, "thornling", 17, 7); en(r, "beetle", 12, 11);
  r.obj({ t: "chest", id: "ch_scompass", x: 3.5, y: 11.5, item: "spire_compass", label: "Chest" });
  finishRoom("spire_b2", "Reading Gallery", SM, "dungeon", r, SF([1, 1], 1));
  r = sroom(); braziers(r);
  pits(r, 5, 5, 8, 10); pits(r, 15, 5, 18, 10); r.rect(5, 7, 8, 8, "_"); r.rect(15, 7, 18, 8, "_");
  door(r, "spire_b3", "W", "spire_b1", "open", "d_sb1b3", "Door to the Landing");
  en(r, "wisp", 12, 5); en(r, "wisp", 12, 11); en(r, "archer", 19, 4); en(r, "archer", 19, 12);
  r.obj({ t: "chest", id: "ch_skeyB", x: 19.5, y: 8, item: "small_key", label: "Chest" });
  finishRoom("spire_b3", "Wind Terrace", SM, "dungeon", r, SF([3, 1], 1));
  r = sroom(); braziers(r);
  for (const [x, y] of [[6, 5], [17, 5], [6, 10], [17, 10]]) pillar(r, x, y);
  door(r, "spire_b4", "S", "spire_b1", "small", "L_sb1b4", "Locked door (small key)");
  stairs(r, "w_sb4_up", 12, 3, "spire_c1", 12.5, 11.4, "Stairs up to the Library", { dir: "up" });
  en(r, "soldier", 8, 8); en(r, "soldier", 16, 8); en(r, "wisp", 12, 7);
  finishRoom("spire_b4", "Winding Stair", SM, "dungeon", r, SF([2, 0], 1));
}
{ // F2 library
  let r = sroom(); braziers(r);
  r.rect(9, 6, 14, 9, "+");
  stairs(r, "w_sc1_down", 12, 12, "spire_b4", 12.5, 4.6, "Stairs down to the Winding Stair", { dir: "down" });
  door(r, "spire_c1", "W", "spire_c2", "open", "d_sc1c2", "Door to the Stacks");
  door(r, "spire_c1", "E", "spire_c3", "open", "d_sc1c3", "Door to the Chime Room");
  door(r, "spire_c1", "N", "spire_c4", "switch", "S_sc1c4", "Sealed gate (crystal)", { crystal: "cr_sc3" });
  en(r, "archer", 6, 5); en(r, "archer", 18, 5); en(r, "beetle", 12, 11);
  finishRoom("spire_c1", "Library Landing", SM, "dungeon", r, SF([2, 1], 2));
  r = sroom(); braziers(r);
  r.rect(4, 4, 7, 4, "h"); r.rect(16, 4, 19, 4, "h"); r.rect(4, 11, 7, 11, "h"); r.rect(16, 11, 19, 11, "h");
  door(r, "spire_c2", "E", "spire_c1", "open", "d_sc1c2", "Door to the Landing");
  en(r, "thornling", 6, 8); en(r, "thornling", 17, 8); en(r, "skipper", 12, 6); en(r, "skipper", 12, 10);
  r.obj({ t: "chest", id: "ch_skeyC", x: 3.5, y: 8, item: "small_key", label: "Chest" });
  finishRoom("spire_c2", "The Stacks", SM, "dungeon", r, SF([1, 1], 2));
  r = sroom(); braziers(r);
  r.rect(12, 2, 12, 6, "#"); pits(r, 13, 7, 21, 8); r.rect(13, 2, 21, 6, "_");
  door(r, "spire_c3", "W", "spire_c1", "open", "d_sc1c3", "Door to the Landing");
  r.obj({ t: "crystal", id: "cr_sc3", opens: "S_sc1c4", x: 17.5, y: 3.5, label: "Crystal switch (needs a ranged strike)" });
  en(r, "wisp", 7, 6); en(r, "wisp", 8, 11); en(r, "archer", 17, 12);
  finishRoom("spire_c3", "Chime Room", SM, "dungeon", r, SF([3, 1], 2));
  r = sroom(); braziers(r);
  for (const [x, y] of [[6, 5], [17, 5], [6, 10], [17, 10]]) pillar(r, x, y);
  door(r, "spire_c4", "S", "spire_c1", "switch", "S_sc1c4", "Sealed gate (crystal)", { crystal: "cr_sc3" });
  stairs(r, "w_sc4_up", 12, 3, "spire_d1", 12.5, 11.4, "Stairs up to the Belfry", { dir: "up" });
  en(r, "soldier", 9, 8); en(r, "soldier", 15, 8); en(r, "archer", 12, 6);
  finishRoom("spire_c4", "Library Stair", SM, "dungeon", r, SF([2, 0], 2));
}
{ // F3 belfry
  let r = sroom(); braziers(r);
  stairs(r, "w_sd1_down", 12, 12, "spire_c4", 12.5, 4.6, "Stairs down to the Library Stair", { dir: "down" });
  r.rect(8, 6, 15, 6, "I"); r.rect(8, 10, 15, 10, "I");
  door(r, "spire_d1", "N", "spire_d2", "small", "L_sd1d2", "Locked door (small key)");
  door(r, "spire_d1", "W", "spire_d3", "open", "d_sd1d3", "Door to the Bow Hall");
  door(r, "spire_d1", "E", "spire_d4", "big", "B_sd1d4", "Great door (Belfry Key)", { key: "spire_key" });
  r.obj({ t: "thicket", id: "th_d1a", x: 21, y: 7 }); r.obj({ t: "thicket", id: "th_d1b", x: 21, y: 8 });
  r.obj({ t: "sign", id: "sg_sd1", x: 18, y: 12.5, label: "Scorched plaque", text: ["Thorns have grown across the Stormgate's threshold. Only fire will clear them."] });
  en(r, "archer", 7, 8); en(r, "beetle", 16, 8); en(r, "soldier", 12, 4);
  finishRoom("spire_d1", "Belfry Landing", SM, "dungeon", r, SF([2, 1], 3));
  r = sroom(); braziers(r);
  for (const [x, y] of [[6, 4], [17, 4], [6, 11], [17, 11]]) pillar(r, x, y);
  r.rect(10, 6, 13, 9, "m");
  door(r, "spire_d2", "S", "spire_d1", "small", "L_sd1d2", "Locked door (small key)");
  en(r, "cloudmarshal", 12, 8);
  r.obj({ t: "chest", id: "ch_skey", x: 12, y: 4.2, item: "spire_key", label: "Chest", reveal: "cloudmarshalDead" });
  finishRoom("spire_d2", "Bellringer's Court", SM, "dungeon", r, { ...SF([2, 0], 3), fight: true });
  r = sroom(); braziers(r);
  r.rect(9, 4, 14, 4, "I"); r.rect(9, 9, 14, 9, "I"); r.rect(9, 5, 9, 8, "I"); r.rect(14, 5, 14, 8, "I"); r.rect(10, 5, 13, 8, "m"); r.rect(11, 9, 12, 9, "_");
  door(r, "spire_d3", "E", "spire_d1", "open", "d_sd1d3", "Door to the Landing");
  r.obj({ t: "chest", id: "ch_bow", x: 11, y: 6, item: "ember_bow", big: true, key: "spire_key", label: "Big chest" });
  en(r, "soldier", 5, 6); en(r, "archer", 18, 6); en(r, "wisp", 6, 11);
  finishRoom("spire_d3", "Bow Hall", SM, "dungeon", r, SF([1, 1], 3));
  r = sroom(); braziers(r);
  door(r, "spire_d4", "W", "spire_d1", "big", "B_sd1d4", "Great door (Belfry Key)", { key: "spire_key", tx: 19.8, ty: 8 });
  stairs(r, "w_sd4_up", 20, 3, "spire_e1", 3.5, 8, "Stairs up to the Roost", { dir: "right" });
  r.obj({ t: "sign", id: "sg_sd4", x: 12, y: 8, label: "Stormgate", text: ["The wind roars up the stair. Mol does not come down for sword-work: strike the wing with fire, and it will fall."] });
  finishRoom("spire_d4", "Stormgate", SM, "dungeon", r, SF([3, 1], 3));
}
{ // F4 roost
  const r = sroom(); braziers(r);
  r.rect(7, 5, 16, 10, "_");
  stairs(r, "w_se1_down", 2, 8, "spire_d4", 19.5, 4.6, "Stairs down to the Stormgate", { dir: "down" });
  en(r, "stormfinch", 12, 8);
  r.obj({ t: "warp", id: "w_spire_exit2", x: 20, y: 3, w: 1, h: 1, to: "world", tx: 205.5, ty: 11.6, dir: "down", label: "Stairs down to Skyreach", reveal: "stormfinchDead" });
  r.put(20, 3, "S");
  finishRoom("spire_e1", "The Roost", "spire", "dungeon", r, SF([2, 1], 4));
}

for (const rm of rooms) fs.writeFileSync(path.join(OUT, "rooms", `${rm.id}.json`), JSON.stringify(rm) + "\n");
fs.writeFileSync(path.join(OUT, "rooms", "index.json"), JSON.stringify(rooms.map((r) => r.id)) + "\n");
// whitelist for the account server's save validation (server/content.json)
{
  const chestIds = [...wo.filter((o) => o.t === "chest"), ...rooms.flatMap((r) => r.objects.filter((o) => o.t === "chest"))].map((o) => o.id as string);
  const doorIds = [...new Set([...rooms.flatMap((r) => r.objects.filter((o) => o.t === "door").map((o) => o.id as string)), ...wo.filter((o) => o.t === "slab" || o.t === "rubble").map((o) => o.id as string)])];
  const content = {
    rooms: rooms.map((r) => r.id), chunks: Array.from({ length: REGION_COLS * REGION_ROWS }, (_, i) => `${i % REGION_COLS},${Math.floor(i / REGION_COLS)}`), fogHex: FOG_HEX, fogW: FOG_W,
    chests: chestIds, doors: doorIds, fightRooms: rooms.filter((r) => r.fight).map((r) => r.id),
    items: UNIQUE_ITEMS, flags: FLAGS, quests: QUESTS, consumables: CONSUMABLES, levelXp: LEVEL_XP, equippable: EQUIPPABLE,
  };
  fs.writeFileSync("server/content.json", JSON.stringify(content, null, 1) + "\n");
}
console.log(`mapgen: wrote ${world.chunks.length} chunks and ${rooms.length} rooms to public/world`);
