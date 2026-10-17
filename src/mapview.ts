/** Drawing helpers for the minimap, world map (with fog of war) and dungeon map. Pixel-per-tile canvases, scaled up with nearest-neighbour. */
import Phaser from "phaser";
import { MAP_COLOR, tileKey } from "./art";
import type { Sim } from "./sim/core";
import { DUNGEONS, dungeonOf } from "./sim/data";
import { CH, CW, FOG_CH, FOG_CW, FOG_H, FOG_W, REGION_COLS, REGION_ROWS, TS } from "./tiles";

export const WORLD_TW = REGION_COLS * CW;
export const WORLD_TH = REGION_ROWS * CH;

function ensure(scene: Phaser.Scene, key: string, w: number, h: number): Phaser.Textures.CanvasTexture {
  const have = scene.textures.exists(key) ? (scene.textures.get(key) as Phaser.Textures.CanvasTexture) : null;
  if (have && have.width === w && have.height === h) return have;
  if (have) scene.textures.remove(key);
  const t = scene.textures.createCanvas(key, w, h)!;
  t.setFilter(Phaser.Textures.FilterMode.NEAREST);
  return t;
}

/** One pixel per overworld tile; unrevealed 8x6 cells are fogged. Redrawn only when `sig` changes. */
export function drawWorldMap(scene: Phaser.Scene, sim: Sim, key = "worldmap"): string {
  const t = ensure(scene, key, WORLD_TW, WORLD_TH);
  const sig = `${sim.save.fog}|${sim.data.chunks.size}`;
  const prev = (t as unknown as { sig?: string }).sig;
  if (prev === sig) return key;
  (t as unknown as { sig?: string }).sig = sig;
  const c = t.getContext();
  c.fillStyle = "#0c0e24";
  c.fillRect(0, 0, WORLD_TW, WORLD_TH);
  const need = new Set<string>();
  for (let fy = 0; fy < FOG_H; fy++)
    for (let fx = 0; fx < FOG_W; fx++) {
      const x0 = fx * FOG_CW, y0 = fy * FOG_CH;
      if (x0 >= WORLD_TW || y0 >= WORLD_TH) continue;
      if (!sim.fogAt(fx, fy)) {
        c.fillStyle = (fx + fy) % 2 ? "#151836" : "#12152f";
        c.fillRect(x0, y0, FOG_CW, FOG_CH);
        continue;
      }
      const ccx = Math.floor(x0 / CW), ccy = Math.floor(y0 / CH);
      if (!sim.data.chunks.has(`${ccx},${ccy}`)) need.add(`${ccx},${ccy}`);
      for (let y = y0; y < y0 + FOG_CH; y++)
        for (let x = x0; x < x0 + FOG_CW; x++) {
          const id = sim.data.worldTile(x, y);
          c.fillStyle = MAP_COLOR[tileKey(id)] ?? "#444";
          c.fillRect(x, y, 1, 1);
        }
    }
  t.refresh();
  // explored ground whose chunk is not in memory yet (a loaded save): fetch it, the map repaints when it lands
  for (const k of need) { const [a, b] = k.split(",").map(Number); void sim.data.loadChunk(a, b); }
  return key;
}

export interface RoomSpot { id: string; name: string; gx: number; gy: number; fight: boolean; floor: number }

export function dungeonRooms(sim: Sim, prefix = "cistern_"): RoomSpot[] {
  const out: RoomSpot[] = [];
  for (const id of sim.data.roomIds) {
    if (!id.startsWith(prefix)) continue;
    const r = sim.data.rooms.get(id);
    if (!r?.grid) continue;
    out.push({ id, name: r.name, gx: r.grid[0], gy: r.grid[1], fight: !!r.fight, floor: r.floor ?? 0 });
  }
  return out;
}

/** Dungeon floor plan: visited rooms are filled, the Cistern Map shows every room, the Compass marks chests and the boss. */
export function drawDungeonMap(scene: Phaser.Scene, sim: Sim, key = "dunmap", cell = 24): { key: string; w: number; h: number; cell: number } {
  const dun = dungeonOf(sim.area.id) ?? DUNGEONS[0];
  const here0 = sim.data.rooms.get(sim.area.id);
  const floor = here0?.floor ?? 0;
  const rooms = dungeonRooms(sim, dun.prefix).filter((r) => r.floor === floor);
  const w = 4 * cell + 2, h = 3 * cell + 2;
  const t = ensure(scene, key, w, h);
  const c = t.getContext();
  c.clearRect(0, 0, w, h);
  const hasMap = sim.hasItem(dun.map), hasCompass = sim.hasItem(dun.compass);
  const here = sim.area.id;
  const seen = (id: string) => sim.save.visited.includes(id);
  for (const r of rooms) {
    const show = hasMap || seen(r.id);
    if (!show) continue;
    const x = r.gx * cell + 1, y = r.gy * cell + 1;
    c.fillStyle = r.id === here ? "#f2c85a" : seen(r.id) ? "#5a6aa8" : "#2e3560";
    c.fillRect(x + 1, y + 1, cell - 2, cell - 2);
    c.strokeStyle = "#0a0c24"; c.lineWidth = 1; c.strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1);
    const room = sim.data.rooms.get(r.id);
    if (room && (hasCompass || seen(r.id))) {
      for (const o of room.objects) {
        if (o.t === "chest" && hasCompass && !sim.save.chests.includes(o.id as string)) { c.fillStyle = "#ffd060"; c.fillRect(x + 3 + ((o.x as number) / room.w) * (cell - 8), y + 3 + ((o.y as number) / room.h) * (cell - 8), 3, 3); }
        if (o.t === "enemy" && o.kind === dun.boss && hasCompass && !sim.hasFlag(dun.bossFlag)) { c.fillStyle = "#ff4a4a"; c.fillRect(x + cell / 2 - 2, y + cell / 2 - 2, 5, 5); }
      }
    }
  }
  // links between neighbouring shown rooms
  c.fillStyle = "#8a90c4";
  for (const a of rooms) for (const b of rooms) {
    if (!(hasMap || (seen(a.id) && seen(b.id)))) continue;
    if (a.gx + 1 === b.gx && a.gy === b.gy) c.fillRect(a.gx * cell + cell - 1, a.gy * cell + cell / 2 - 1, 4, 3);
    if (a.gy + 1 === b.gy && a.gx === b.gx) c.fillRect(a.gx * cell + cell / 2 - 1, a.gy * cell + cell - 1, 3, 4);
  }
  t.refresh();
  return { key, w, h, cell };
}

/** Position of the player on the world map texture, in map pixels (tiles). */
export function playerOnMap(sim: Sim): { x: number; y: number } {
  return { x: sim.p.x / TS, y: sim.p.y / TS };
}

export function chunkLabelCells(sim: Sim): { name: string; x: number; y: number }[] {
  const out: { name: string; x: number; y: number }[] = [];
  for (const [k, name] of Object.entries(sim.data.meta.names)) {
    const [cx, cy] = k.split(",").map(Number);
    const fx = Math.floor((cx * CW + CW / 2) / FOG_CW), fy = Math.floor((cy * CH + CH / 2) / FOG_CH);
    if (sim.fogAt(fx, fy)) out.push({ name, x: cx * CW + CW / 2, y: cy * CH + CH / 2 });
  }
  return out;
}
