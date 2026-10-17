/** Map data: chunked overworld + rooms, loaded from the JSON written by tools/mapgen.ts. Phaser-free. */
import { CH, CW, TILE_BY_CH, T } from "../tiles";

export interface RawObj {
  t: string;
  x: number;
  y: number;
  [k: string]: unknown;
}
export interface Chunk {
  cx: number;
  cy: number;
  name: string;
  music: string;
  tiles: Uint8Array;
  objects: RawObj[];
}
export interface Room {
  id: string;
  name: string;
  music: string;
  kind: "interior" | "dungeon";
  w: number;
  h: number;
  tiles: Uint8Array;
  objects: RawObj[];
  grid?: [number, number];
  floor?: number;
  fight?: boolean;
  dark?: boolean;
}
export interface WorldMeta {
  id: string;
  chunkW: number;
  chunkH: number;
  cols: number;
  rows: number;
  names: Record<string, string>;
  chunks: string[];
}
/** Returns parsed JSON for a path under world/, e.g. "aurelane/world.json". */
export type Loader = (rel: string) => Promise<unknown>;

function decode(rows: string[], w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const def = TILE_BY_CH[rows[y]?.[x] ?? " "];
      out[y * w + x] = def ? def.id : T.VOID;
    }
  return out;
}

export class WorldData {
  meta!: WorldMeta;
  roomIds: string[] = [];
  chunks = new Map<string, Chunk>();
  rooms = new Map<string, Room>();
  private pending = new Map<string, Promise<Chunk | null>>();
  constructor(private load: Loader) {}

  async init(): Promise<void> {
    this.meta = (await this.load("aurelane/world.json")) as WorldMeta;
    this.roomIds = (await this.load("rooms/index.json")) as string[];
  }

  chunkKey(cx: number, cy: number): string {
    return `${cx},${cy}`;
  }

  inRegion(cx: number, cy: number): boolean {
    return cx >= 0 && cy >= 0 && cx < this.meta.cols && cy < this.meta.rows;
  }

  /** Loads (once) and caches one chunk. Out-of-region chunks resolve to null. */
  loadChunk(cx: number, cy: number): Promise<Chunk | null> {
    if (!this.inRegion(cx, cy)) return Promise.resolve(null);
    const key = this.chunkKey(cx, cy);
    const have = this.chunks.get(key);
    if (have) return Promise.resolve(have);
    let p = this.pending.get(key);
    if (!p) {
      p = this.load(`aurelane/c_${cx}_${cy}.json`).then((raw) => {
        const r = raw as { cx: number; cy: number; name: string; music: string; rows: string[]; objects: RawObj[] };
        const c: Chunk = { cx: r.cx, cy: r.cy, name: r.name, music: r.music, tiles: decode(r.rows, CW, CH), objects: r.objects };
        this.chunks.set(key, c);
        this.pending.delete(key);
        return c;
      });
      this.pending.set(key, p);
    }
    return p;
  }

  async loadRoom(id: string): Promise<Room> {
    const have = this.rooms.get(id);
    if (have) return have;
    const r = (await this.load(`rooms/${id}.json`)) as { id: string; name: string; music: string; kind: "interior" | "dungeon"; w: number; h: number; rows: string[]; objects: RawObj[]; grid?: [number, number]; floor?: number; fight?: boolean; dark?: boolean };
    const room: Room = { id: r.id, name: r.name, music: r.music, kind: r.kind, w: r.w, h: r.h, tiles: decode(r.rows, r.w, r.h), objects: r.objects, grid: r.grid, floor: r.floor, fight: r.fight, dark: r.dark };
    this.rooms.set(id, room);
    return room;
  }

  /** Tile id in world tile coordinates; unloaded or out-of-region cells read as VOID (solid). */
  worldTile(tx: number, ty: number): number {
    if (tx < 0 || ty < 0) return T.VOID;
    const cx = Math.floor(tx / CW), cy = Math.floor(ty / CH);
    const c = this.chunks.get(`${cx},${cy}`);
    if (!c) return T.VOID;
    return c.tiles[(ty - cy * CH) * CW + (tx - cx * CW)];
  }
}
