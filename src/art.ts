/**
 * Procedural tile painter. Every tile is drawn with 2D canvas calls at TEX x resolution straight into a chunk or room canvas,
 * so the world is painted once when a chunk streams in and then drawn by the GPU as a single image per chunk.
 */
import { TEX } from "./gfx";
import { TILE_BY_ID, TS } from "./tiles";

type Ctx = CanvasRenderingContext2D;
export type Kind = "world" | "interior" | "dungeon";

const hash = (x: number, y: number, s: number): number => {
  let h = (Math.imul(x + 1013, 374761393) ^ Math.imul(y + 7919, 668265263) ^ Math.imul(s + 31, 1274126177)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

const P = {
  grass: "#4c9a45", grass2: "#58a84e", grassD: "#3c8239", dirt: "#9a7448", dirtD: "#7e5c38", sand: "#e0cf94", sandD: "#c8b676",
  water: "#2f6fc0", waterD: "#25589e", waterL: "#6fb0ee", rock: "#8a8f9a", rockD: "#626874", rockL: "#b4bac4",
  cliff: "#7b5f48", cliffD: "#5a4332", cliffL: "#a58566", wood: "#a77c4c", woodD: "#7d5833", woodL: "#c79a62",
  stone: "#9a9ca8", stoneD: "#74768a", stoneL: "#bcbec8", dun: "#4a4e68", dunD: "#34374e", dunL: "#666b8c", dunF: "#2a2d40",
  roof: "#b4503e", roofD: "#8a3a2c", roofL: "#d87a5a", plaster: "#e8dcc0", plasterD: "#c8b890", leaf: "#2f7a3a", leafD: "#235c2c", leafL: "#4aa04c",
};

export function tileKey(id: number): string {
  return TILE_BY_ID[id]?.name ?? "void";
}

function R(c: Ctx, x: number, y: number, w: number, h: number, col: string): void {
  c.fillStyle = col;
  c.fillRect(x, y, w, h);
}
function specks(c: Ctx, tx: number, ty: number, seed: number, n: number, col: string, size = 1, alpha = 1): void {
  c.fillStyle = col;
  c.globalAlpha = alpha;
  for (let i = 0; i < n; i++) c.fillRect(Math.floor(hash(tx, ty, seed + i * 2) * (TS - size)), Math.floor(hash(tx, ty, seed + i * 2 + 1) * (TS - size)), size, size);
  c.globalAlpha = 1;
}
function ell(c: Ctx, x: number, y: number, rx: number, ry: number, col: string): void {
  c.fillStyle = col;
  c.beginPath();
  c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  c.fill();
}

function ground(c: Ctx, kind: Kind, tx: number, ty: number): void {
  if (kind === "world") {
    const v = hash(tx, ty, 1);
    R(c, 0, 0, TS, TS, v > 0.5 ? P.grass : P.grass2);
    specks(c, tx, ty, 10, 5, P.grassD, 1, 0.55);
    specks(c, tx, ty, 30, 3, "#7cc468", 1, 0.5);
  } else if (kind === "interior") {
    R(c, 0, 0, TS, TS, P.wood);
    R(c, 0, 0, TS, 1, P.woodD);
    R(c, 0, 8, TS, 1, P.woodD);
    R(c, 3 + ((ty * 5) % 7), 0, 1, 8, P.woodD);
    R(c, 9 - ((ty * 3) % 6), 8, 1, 8, P.woodD);
  } else {
    R(c, 0, 0, TS, TS, P.dun);
    R(c, 0, 0, TS, 1, P.dunD);
    R(c, 0, 0, 1, TS, P.dunD);
    specks(c, tx, ty, 5, 3, P.dunL, 1, 0.4);
  }
}

/** Paints one tile at logical tile coords (tx,ty) into a context already scaled by TEX and translated to the tile origin. nb(dx,dy) returns neighbour tile names. */
export function paintTile(c: Ctx, id: number, tx: number, ty: number, kind: Kind, nb: (dx: number, dy: number) => string): void {
  const n = tileKey(id);
  const rnd = (s: number) => hash(tx, ty, s);
  switch (n) {
    case "void": R(c, 0, 0, TS, TS, "#06061a"); return;
    case "grass": case "grass2": ground(c, "world", tx, ty); return;
    case "flowers": {
      ground(c, "world", tx, ty);
      const cols = ["#f4e04a", "#f08ab8", "#fff", "#8ab4ff"];
      for (let i = 0; i < 3; i++) {
        const x = 2 + Math.floor(rnd(50 + i) * 11), y = 2 + Math.floor(rnd(60 + i) * 11);
        R(c, x, y + 1, 1, 2, P.grassD);
        R(c, x - 1, y, 3, 1, cols[Math.floor(rnd(70 + i) * 4)]);
        R(c, x, y - 1, 1, 3, cols[Math.floor(rnd(70 + i) * 4)]);
      }
      return;
    }
    case "tallgrass": {
      ground(c, "world", tx, ty);
      for (let i = 0; i < 7; i++) {
        const x = 1 + i * 2 + (rnd(20 + i) > 0.5 ? 1 : 0), y = 5 + Math.floor(rnd(40 + i) * 6);
        R(c, x, y, 1, 7 - Math.floor(rnd(41 + i) * 3), i % 2 ? "#2f7a3a" : "#3f9446");
        R(c, x + (i % 2 ? -1 : 1), y - 1, 1, 2, "#6cc05a");
      }
      return;
    }
    case "dirt": R(c, 0, 0, TS, TS, P.dirt); specks(c, tx, ty, 3, 7, P.dirtD, 1, 0.7); specks(c, tx, ty, 20, 4, "#b8905c", 1, 0.6); return;
    case "cobble": case "courtyard": {
      R(c, 0, 0, TS, TS, n === "cobble" ? "#8e8a84" : "#a8a49a");
      for (const [x, y, w, h] of [[0, 0, 7, 5], [8, 0, 8, 5], [0, 6, 5, 5], [6, 6, 9, 5], [0, 12, 8, 4], [9, 12, 7, 4]]) {
        R(c, x, y, w - 1, h - 1, rnd(x + y) > 0.5 ? "#a09c94" : "#96928a");
        R(c, x, y, w - 1, 1, "#bab6ac");
      }
      return;
    }
    case "sand": R(c, 0, 0, TS, TS, P.sand); specks(c, tx, ty, 3, 6, P.sandD, 1, 0.6); specks(c, tx, ty, 13, 3, "#f4e8b8", 1, 0.7); return;
    case "wetsand": R(c, 0, 0, TS, TS, "#bca874"); specks(c, tx, ty, 3, 5, "#a08c58", 1, 0.7); R(c, 0, 0, TS, 1, "rgba(255,255,255,0.18)"); return;
    case "water": case "sea": case "dunwater": {
      const dun = n === "dunwater";
      R(c, 0, 0, TS, TS, dun ? "#1f4a82" : n === "sea" ? "#2a63b4" : P.water);
      for (let i = 0; i < 3; i++) {
        const y = 3 + i * 5 + Math.floor(rnd(4 + i) * 3), x = Math.floor(rnd(8 + i) * 8);
        R(c, x, y, 5, 1, dun ? "#3a72b0" : P.waterL);
      }
      R(c, 0, 0, TS, 2, "rgba(0,0,40,0.12)");
      const e = (name: string) => name !== "water" && name !== "sea" && name !== "dunwater" && name !== "lily";
      if (e(nb(0, -1))) R(c, 0, 0, TS, 2, "rgba(220,240,255,0.7)");
      if (e(nb(0, 1))) R(c, 0, TS - 2, TS, 2, "rgba(220,240,255,0.7)");
      if (e(nb(-1, 0))) R(c, 0, 0, 2, TS, "rgba(220,240,255,0.7)");
      if (e(nb(1, 0))) R(c, TS - 2, 0, 2, TS, "rgba(220,240,255,0.7)");
      return;
    }
    case "lily": {
      R(c, 0, 0, TS, TS, P.water);
      R(c, 2, 4, 5, 1, P.waterL);
      ell(c, 8, 9, 5, 3.4, "#3f9a4a"); R(c, 8, 9, 5, 1, P.water); ell(c, 7, 8, 3, 1.6, "#5ec060");
      R(c, 10, 6, 2, 2, "#f6b8d8");
      return;
    }
    case "shallow": {
      R(c, 0, 0, TS, TS, "#74bee0");
      for (let i = 0; i < 3; i++) R(c, Math.floor(rnd(8 + i) * 9), 2 + i * 5, 6, 1, "#b8e6f6");
      specks(c, tx, ty, 3, 4, "#d8c890", 1, 0.5);
      return;
    }
    case "cliff": {
      const up = nb(0, -1) !== "cliff", down = nb(0, 1) !== "cliff";
      if (up) {
        R(c, 0, 0, TS, TS, P.cliff);
        R(c, 0, 0, TS, 5, "#6aa84a"); R(c, 0, 5, TS, 1, P.cliffL);
        specks(c, tx, ty, 9, 4, "#8ac864", 1, 0.8);
        for (let i = 0; i < 6; i++) R(c, 1 + i * 3, 5 + Math.floor(rnd(i) * 3), 1, 6, P.cliffD);
      } else {
        R(c, 0, 0, TS, TS, P.cliff);
        for (let i = 0; i < 5; i++) R(c, 1 + i * 3 + Math.floor(rnd(i) * 2), 0, 1, TS, i % 2 ? P.cliffD : "#6b5240");
        for (let i = 0; i < 3; i++) R(c, Math.floor(rnd(30 + i) * 10), 3 + i * 5, 5, 1, P.cliffL);
      }
      if (down) { R(c, 0, TS - 3, TS, 3, P.cliffD); R(c, 0, TS - 1, TS, 1, "rgba(0,0,0,0.3)"); }
      return;
    }
    case "rock": {
      ground(c, kind, tx, ty);
      ell(c, 8, 14, 7, 2, "rgba(0,0,0,0.25)");
      ell(c, 8, 9, 7, 6.2, P.rockD); ell(c, 8, 8, 6.4, 5.5, P.rock); ell(c, 6, 6, 3.4, 2.4, P.rockL);
      R(c, 9, 10, 4, 1, P.rockD); R(c, 4, 9, 1, 3, P.rockD);
      return;
    }
    case "boulder": {
      ground(c, kind, tx, ty);
      ell(c, 8, 14, 7.4, 2, "rgba(0,0,0,0.28)");
      ell(c, 8, 8.5, 7.4, 6.8, "#76706a"); ell(c, 7.5, 7.6, 6.6, 5.8, "#948d86"); ell(c, 5.5, 5.5, 3.6, 2.4, "#bab2a8");
      R(c, 9, 9, 4, 1, "#6a645e"); R(c, 6, 11, 5, 1, "#6a645e");
      return;
    }
    case "ledge": {
      ground(c, "world", tx, ty);
      R(c, 0, 10, TS, 6, P.cliffL); R(c, 0, 10, TS, 2, "#6aa84a"); R(c, 0, 13, TS, 3, P.cliff); R(c, 0, 15, TS, 1, P.cliffD);
      for (let i = 0; i < 4; i++) R(c, 2 + i * 4, 12, 1, 2, P.cliffD);
      return;
    }
    case "tree": {
      ground(c, "world", tx, ty);
      ell(c, 8, 14, 7, 2, "rgba(0,0,0,0.28)");
      R(c, 6, 10, 4, 5, "#6a4a2c"); R(c, 6, 10, 1, 5, "#8a6238");
      ell(c, 8, 6.5, 8, 7, P.leafD); ell(c, 8, 6, 7.2, 6.2, P.leaf); ell(c, 5.6, 4, 3.6, 2.8, P.leafL); ell(c, 11, 8, 2.4, 1.6, P.leafD);
      specks(c, tx, ty, 7, 3, "#78c860", 1, 0.8);
      return;
    }
    case "pine": {
      ground(c, "world", tx, ty);
      ell(c, 8, 14.5, 6, 1.8, "rgba(0,0,0,0.28)");
      R(c, 7, 12, 2, 3, "#5a3e26");
      for (const [y, w] of [[10, 6.5], [6.5, 5.4], [3, 4]]) { c.fillStyle = "#1f6a4a"; c.beginPath(); c.moveTo(8, y - 4); c.lineTo(8 + w, y + 3); c.lineTo(8 - w, y + 3); c.fill(); c.fillStyle = "#2e8a5c"; c.beginPath(); c.moveTo(8, y - 4); c.lineTo(8 - w * 0.2, y + 3); c.lineTo(8 - w, y + 3); c.fill(); }
      return;
    }
    case "fence": {
      ground(c, "world", tx, ty);
      R(c, 1, 5, 2, 9, P.woodD); R(c, 13, 5, 2, 9, P.woodD);
      R(c, 0, 6, TS, 2, P.woodL); R(c, 0, 10, TS, 2, P.wood); R(c, 0, 8, TS, 1, P.woodD);
      return;
    }
    case "ruinwall": case "ruinface": case "mossstone": {
      if (n === "mossstone") { ground(c, kind, tx, ty); R(c, 0, 0, TS, TS, "#7e8a78"); specks(c, tx, ty, 3, 8, "#5a7a50", 2, 0.7); R(c, 0, 0, TS, 1, "#9aa692"); return; }
      R(c, 0, 0, TS, TS, "#8a8c88");
      const face = n === "ruinface";
      for (let y = 0; y < TS; y += 5) { R(c, 0, y, TS, 1, "#6a6c6a"); const o = (y / 5) % 2 ? 4 : 0; R(c, o, y, 1, 5, "#6a6c6a"); R(c, o + 8, y, 1, 5, "#6a6c6a"); }
      specks(c, tx, ty, 3, 6, "#5a7a50", 2, 0.6);
      if (!face) { R(c, 0, 0, TS, 2, "#b0b2ac"); } else R(c, 0, TS - 3, TS, 3, "#5a5c5a");
      return;
    }
    case "roof": {
      R(c, 0, 0, TS, TS, P.roof);
      for (let y = 0; y < TS; y += 4) { R(c, 0, y + 3, TS, 1, P.roofD); const o = (y / 4) % 2 ? 4 : 0; for (let x = o; x < TS; x += 8) R(c, x, y, 1, 3, P.roofD); }
      R(c, 0, 0, TS, 1, P.roofL);
      if (nb(-1, 0) !== "roof") R(c, 0, 0, 1, TS, P.roofD);
      if (nb(1, 0) !== "roof") R(c, TS - 1, 0, 1, TS, P.roofD);
      return;
    }
    case "eave": {
      R(c, 0, 0, TS, TS, P.plasterD); R(c, 0, 0, TS, 6, P.roof); R(c, 0, 5, TS, 2, P.roofD); R(c, 0, 7, TS, 3, "rgba(0,0,0,0.25)");
      for (let x = 0; x < TS; x += 4) R(c, x, 0, 1, 5, P.roofD);
      return;
    }
    case "housewall": {
      R(c, 0, 0, TS, TS, P.plaster); R(c, 0, TS - 2, TS, 2, P.plasterD); specks(c, tx, ty, 3, 4, P.plasterD, 1, 0.5);
      R(c, 0, 0, 1, TS, "#f4ecd8"); R(c, 0, 0, TS, 1, P.plasterD);
      return;
    }
    case "door": {
      R(c, 0, 0, TS, TS, P.plaster); R(c, 2, 1, 12, 15, P.woodD); R(c, 3, 2, 10, 14, P.wood); R(c, 3, 2, 10, 1, P.woodL);
      R(c, 7, 2, 1, 14, P.woodD); R(c, 10, 9, 2, 2, "#f2c85a");
      return;
    }
    case "window": {
      R(c, 0, 0, TS, TS, P.plaster); R(c, 3, 3, 10, 9, P.woodD); R(c, 4, 4, 8, 7, "#9ad0f0"); R(c, 4, 4, 8, 2, "#c8e8fa"); R(c, 7, 4, 2, 7, P.woodD); R(c, 4, 7, 8, 1, P.woodD);
      R(c, 2, 12, 12, 2, P.woodL);
      return;
    }
    case "wood": case "stonefloor": case "darkfloor": case "rug": {
      if (n === "wood") { ground(c, "interior", tx, ty); return; }
      if (n === "stonefloor") { R(c, 0, 0, TS, TS, "#a8a8b0"); R(c, 0, 0, TS, 1, "#8a8a94"); R(c, 0, 0, 1, TS, "#8a8a94"); specks(c, tx, ty, 3, 3, "#c4c4cc", 1, 0.5); return; }
      if (n === "darkfloor") { R(c, 0, 0, TS, TS, "#2e3046"); R(c, 0, 0, TS, 1, "#242638"); specks(c, tx, ty, 3, 3, "#44486a", 1, 0.5); return; }
      R(c, 0, 0, TS, TS, "#9a3a44"); R(c, 1, 1, TS - 2, TS - 2, "#b4505a"); R(c, 3, 3, TS - 6, TS - 6, "#d8a04a"); R(c, 4, 4, TS - 8, TS - 8, "#b4505a");
      return;
    }
    case "table": { ground(c, "interior", tx, ty); R(c, 1, 12, 14, 3, "rgba(0,0,0,0.2)"); R(c, 1, 3, 14, 9, P.woodL); R(c, 1, 3, 14, 1, "#e0b880"); R(c, 1, 10, 14, 2, P.woodD); R(c, 3, 12, 2, 3, P.woodD); R(c, 11, 12, 2, 3, P.woodD); return; }
    case "bed": { ground(c, "interior", tx, ty); R(c, 1, 1, 14, 14, P.woodD); R(c, 2, 2, 12, 12, "#d8d0e8"); R(c, 2, 2, 12, 4, "#f4f0fa"); R(c, 2, 7, 12, 7, "#4a6aa8"); R(c, 2, 7, 12, 1, "#7a9ae0"); return; }
    case "shelf": { ground(c, "interior", tx, ty); R(c, 0, 0, TS, TS, P.woodD); R(c, 1, 1, 14, 14, "#5a3c20"); for (const y of [2, 8]) { R(c, 1, y + 4, 14, 1, P.woodL); R(c, 2 + (y % 3), y, 3, 4, "#c85a5a"); R(c, 6, y + 1, 3, 3, "#5aa0c8"); R(c, 10, y, 3, 4, "#d8c85a"); } return; }
    case "hearth": { ground(c, "interior", tx, ty); R(c, 0, 0, TS, TS, "#6a6670"); R(c, 2, 4, 12, 12, "#2a2630"); R(c, 4, 9, 8, 6, "#ff8a3d"); R(c, 6, 7, 4, 8, "#ffd060"); R(c, 7, 5, 2, 4, "#ff5a2a"); R(c, 0, 0, TS, 3, "#8a8690"); return; }
    case "crate": { ground(c, kind === "world" ? "interior" : kind, tx, ty); R(c, 1, 2, 14, 13, P.woodD); R(c, 2, 3, 12, 11, P.wood); R(c, 2, 3, 12, 2, P.woodL); R(c, 2, 8, 12, 1, P.woodD); R(c, 7, 3, 2, 11, P.woodD); return; }
    case "cavemouth": {
      ground(c, "world", tx, ty);
      R(c, 0, 0, TS, TS, "#6a6258"); ell(c, 8, 16, 7, 12, "#14121a"); ell(c, 8, 16, 5, 9, "#050408");
      R(c, 0, 0, TS, 3, "#8a8176"); specks(c, tx, ty, 3, 4, "#4a443c", 2, 0.7);
      return;
    }
    case "stairs": {
      R(c, 0, 0, TS, TS, "#5a5c68");
      for (let i = 0; i < 4; i++) { R(c, 1 + i, i * 4, TS - 2 - i * 2, 3, i % 2 ? "#6e7080" : "#80829a"); R(c, 1 + i, i * 4 + 3, TS - 2 - i * 2, 1, "#2a2c38"); }
      return;
    }
    case "pit": { R(c, 0, 0, TS, TS, "#05040a"); R(c, 0, 0, TS, 2, "#1a1826"); R(c, 0, 0, 2, TS, "#12101c"); specks(c, tx, ty, 3, 3, "#1c1a2a", 1, 0.6); return; }
    case "dunwall": {
      R(c, 0, 0, TS, TS, P.dunD);
      const face = nb(0, 1) !== "dunwall";
      for (let y = 0; y < TS; y += 5) { R(c, 0, y + 4, TS, 1, P.dunF); const o = (y / 5) % 2 ? 5 : 0; R(c, o, y, 1, 5, P.dunF); R(c, o + 8, y, 1, 5, P.dunF); }
      if (face) { R(c, 0, 0, TS, TS, "#3e4160"); for (let y = 0; y < TS; y += 5) { R(c, 0, y + 4, TS, 1, "#2a2d40"); const o = (y / 5) % 2 ? 5 : 0; R(c, o, y, 1, 5, "#2a2d40"); R(c, o + 8, y, 1, 5, "#2a2d40"); } R(c, 0, 0, TS, 1, "#6a6e90"); R(c, 0, TS - 2, TS, 2, "rgba(0,0,0,0.3)"); }
      return;
    }
    case "dunfloor": ground(c, "dungeon", tx, ty); return;
    case "dunfloor2": ground(c, "dungeon", tx, ty); R(c, 0, 0, TS, TS, "rgba(120,140,200,0.12)"); R(c, 2, 2, TS - 4, TS - 4, "rgba(0,0,0,0.1)"); return;
    case "pillar": { ground(c, "dungeon", tx, ty); ell(c, 8, 14, 6, 2, "rgba(0,0,0,0.3)"); R(c, 3, 2, 10, 12, P.dunL); R(c, 3, 2, 3, 12, "#8a90b4"); R(c, 10, 2, 3, 12, P.dunD); R(c, 2, 1, 12, 2, "#8a90b4"); R(c, 2, 13, 12, 2, P.dunD); return; }
    case "brazier": {
      ground(c, kind, tx, ty);
      R(c, 4, 9, 8, 2, "#6a5a48"); R(c, 6, 11, 4, 4, "#4a4038"); R(c, 3, 14, 10, 2, "#4a4038");
      ell(c, 8, 8, 3.4, 4, "#ff6a2a"); ell(c, 8, 8.6, 2, 3, "#ffd060"); ell(c, 8, 9, 1, 1.6, "#fffbe0");
      return;
    }
    case "bridgeh": case "bridgev": {
      const h = n === "bridgeh";
      R(c, 0, 0, TS, TS, P.water); R(c, 0, 0, TS, 2, "rgba(0,0,40,0.15)");
      R(c, 0, 0, TS, TS, "rgba(0,0,0,0)");
      if (h) { R(c, 0, 1, TS, 14, P.woodL); for (let x = 0; x < TS; x += 4) R(c, x, 1, 1, 14, P.woodD); R(c, 0, 1, TS, 2, P.woodD); R(c, 0, 13, TS, 2, P.woodD); }
      else { R(c, 1, 0, 14, TS, P.woodL); for (let y = 0; y < TS; y += 4) R(c, 1, y, 14, 1, P.woodD); R(c, 1, 0, 2, TS, P.woodD); R(c, 13, 0, 2, TS, P.woodD); }
      return;
    }
    case "reeds": {
      ground(c, "world", tx, ty);
      R(c, 0, 0, TS, TS, "rgba(80,130,90,0.35)");
      for (let i = 0; i < 6; i++) { const x = 1 + i * 3, hgt = 7 + Math.floor(rnd(i) * 6); R(c, x, TS - hgt, 1, hgt, "#6a8a3a"); R(c, x - 1, TS - hgt, 3, 3, "#6a4a2a"); }
      return;
    }
    case "well": {
      ground(c, "world", tx, ty);
      ell(c, 8, 14, 7.4, 2, "rgba(0,0,0,0.25)");
      R(c, 2, 6, 12, 8, "#8a8a92"); R(c, 2, 6, 12, 2, "#b8b8c2"); ell(c, 8, 7, 5, 2, "#1a3a6a"); R(c, 2, 12, 12, 2, "#6a6a76");
      R(c, 3, 0, 1, 7, P.woodD); R(c, 12, 0, 1, 7, P.woodD); R(c, 2, 0, 12, 2, P.woodL);
      return;
    }
    case "beaconstand": {
      ground(c, "world", tx, ty);
      R(c, 3, 10, 10, 5, "#6a6c78"); R(c, 4, 6, 8, 5, "#8a8c98"); R(c, 5, 4, 6, 3, "#2a2a34");
      R(c, 7, 0, 2, 5, "#4a4a58");
      return;
    }
    case "arch": {
      ground(c, "world", tx, ty);
      R(c, 0, 0, TS, TS, "#9a9ca8"); R(c, 0, 0, TS, 3, "#bcbec8"); R(c, 0, TS - 2, TS, 2, "#6a6c78");
      for (let y = 4; y < TS; y += 5) R(c, 0, y, TS, 1, "#7a7c88");
      return;
    }
    case "rune": {
      ground(c, "dungeon", tx, ty);
      R(c, 0, 0, TS, TS, "#3a3e68"); ell(c, 8, 8, 5.4, 5.4, "rgba(120,200,255,0.25)");
      c.strokeStyle = "#8ad8ff"; c.lineWidth = 1; c.beginPath(); c.moveTo(8, 2); c.lineTo(13, 8); c.lineTo(8, 14); c.lineTo(3, 8); c.closePath(); c.stroke();
      R(c, 7, 7, 2, 2, "#d8f4ff");
      return;
    }
    case "stalagmite": {
      ground(c, "dungeon", tx, ty);
      ell(c, 8, 14, 6, 2, "rgba(0,0,0,0.3)");
      c.fillStyle = "#6a6a7a"; c.beginPath(); c.moveTo(8, 1); c.lineTo(13, 14); c.lineTo(3, 14); c.fill();
      c.fillStyle = "#8a8a9c"; c.beginPath(); c.moveTo(8, 1); c.lineTo(3, 14); c.lineTo(7, 14); c.fill();
      return;
    }
    case "hay": { R(c, 0, 0, TS, TS, "#c8a040"); for (let i = 0; i < 8; i++) R(c, Math.floor(rnd(i) * 14), Math.floor(rnd(20 + i) * 14), 3, 1, i % 2 ? "#e8c868" : "#a88030"); return; }
    case "chasm": {
      R(c, 0, 0, TS, TS, "#07060e"); R(c, 0, 0, TS, 3, "#2a2018"); R(c, 0, 3, TS, 1, "#14100c");
      const e = (name: string) => name !== "chasm";
      if (e(nb(-1, 0))) R(c, 0, 0, 2, TS, "#3a2c20"); if (e(nb(1, 0))) R(c, TS - 2, 0, 2, TS, "#3a2c20");
      if (e(nb(0, 1))) R(c, 0, TS - 3, TS, 3, "#3a2c20");
      specks(c, tx, ty, 3, 3, "#1a1626", 1, 0.8);
      return;
    }
    case "lamppost": {
      ground(c, "world", tx, ty);
      ell(c, 8, 14.5, 4, 1.4, "rgba(0,0,0,0.28)");
      R(c, 7, 6, 2, 9, "#3a3a46"); R(c, 5, 2, 6, 5, "#d8a03a"); R(c, 6, 3, 4, 3, "#fff0b0"); R(c, 4, 1, 8, 2, "#3a3a46"); R(c, 6, 14, 4, 1, "#2a2a34");
      return;
    }
    default: R(c, 0, 0, TS, TS, "#f0f"); return;
  }
}

/** Painted tiles are cached by (tile, look-variant, neighbour signature) so a chunk is mostly cheap drawImage calls. */
const ATLAS = new Map<string, HTMLCanvasElement>();
const SENSITIVE = new Set(["water", "sea", "dunwater", "lily", "cliff", "roof", "dunwall", "chasm"]);

function cachedTile(id: number, kind: Kind, tx: number, ty: number, nb: (dx: number, dy: number) => string, scale: number): HTMLCanvasElement {
  const name = tileKey(id);
  const variant = Math.floor(hash(tx, ty, 99) * 4);
  const sig = SENSITIVE.has(name) ? `${nb(0, -1)},${nb(0, 1)},${nb(-1, 0)},${nb(1, 0)}` : "";
  const key = `${scale}|${kind}|${id}|${variant}|${sig}`;
  let cv = ATLAS.get(key);
  if (!cv) {
    cv = document.createElement("canvas");
    cv.width = TS * scale;
    cv.height = TS * scale;
    const c = cv.getContext("2d")!;
    c.scale(scale, scale);
    c.beginPath();
    c.rect(0, 0, TS, TS);
    c.clip();
    paintTile(c, id, variant * 13 + 5, variant * 7 + 3, kind, nb);
    ATLAS.set(key, cv);
  }
  return cv;
}

/**
 * Paints a chunk or room. `scale` is texture pixels per logical unit (rooms use TEX; world chunks use a lower scale to cut memory 4x).
 * Pass `into` to reuse a pooled canvas (it must already be w*TS*scale by h*TS*scale).
 */
export function chunkCanvas(tiles: Uint8Array, w: number, h: number, kind: Kind, ox: number, oy: number, outside: (x: number, y: number) => number, scale = TEX, into?: HTMLCanvasElement): HTMLCanvasElement {
  const cv = into ?? document.createElement("canvas");
  if (!into) { cv.width = w * TS * scale; cv.height = h * TS * scale; }
  const c = cv.getContext("2d")!;
  c.imageSmoothingEnabled = false;
  if (into) c.clearRect(0, 0, cv.width, cv.height);
  const at = (x: number, y: number): number => (x >= 0 && y >= 0 && x < w && y < h ? tiles[y * w + x] : outside(x + ox, y + oy));
  const px = TS * scale;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const t = cachedTile(at(x, y), kind, x + ox, y + oy, (dx, dy) => tileKey(at(x + dx, y + dy)), scale);
      c.drawImage(t, x * px, y * px);
    }
  return cv;
}

/** One average colour per tile name, used by the minimap and world map. */
export const MAP_COLOR: Record<string, string> = {
  void: "#06061a", grass: "#4c9a45", grass2: "#58a84e", flowers: "#6aa85a", tallgrass: "#3f8a40", dirt: "#9a7448", cobble: "#8e8a84", sand: "#e0cf94", water: "#2f6fc0", shallow: "#74bee0",
  cliff: "#7b5f48", rock: "#8a8f9a", ledge: "#a58566", tree: "#2f7a3a", pine: "#1f6a4a", boulder: "#76706a", fence: "#a77c4c", ruinwall: "#8a8c88", ruinface: "#8a8c88", roof: "#b4503e", eave: "#8a3a2c",
  housewall: "#e8dcc0", door: "#a77c4c", window: "#9ad0f0", wood: "#a77c4c", stonefloor: "#a8a8b0", darkfloor: "#2e3046", rug: "#b4505a", table: "#c79a62", bed: "#4a6aa8", shelf: "#5a3c20", hearth: "#6a6670",
  crate: "#a77c4c", cavemouth: "#14121a", stairs: "#80829a", pit: "#05040a", dunwall: "#34374e", dunfloor: "#4a4e68", dunwater: "#1f4a82", pillar: "#666b8c", brazier: "#ff8a3d", bridgeh: "#c79a62", bridgev: "#c79a62",
  reeds: "#5f8a50", lily: "#3f9a4a", well: "#8a8a92", sea: "#2a63b4", wetsand: "#bca874", courtyard: "#a8a49a", beaconstand: "#8a8c98", arch: "#9a9ca8", mossstone: "#7e8a78", dunfloor2: "#4e5272", rune: "#3a3e68", stalagmite: "#6a6a7a", hay: "#c8a040", lamppost: "#d8a03a", chasm: "#07060e",
};
