/** Tile ids, ASCII legend and collision flags. Phaser-free so map tools, audit and the headless bot can import it. */
export interface TileDef {
  id: number;
  ch: string;
  name: string;
  solid?: boolean; // blocks walking
  water?: boolean; // deep water (blocks walking; fins later)
  ledge?: boolean; // one-way hop south
  pit?: boolean; // fall = damage + respawn at room entry
  slow?: boolean; // shallow water
}

const D: TileDef[] = [
  { id: 0, ch: " ", name: "void", solid: true },
  { id: 1, ch: ".", name: "grass" },
  { id: 2, ch: ",", name: "grass2" },
  { id: 3, ch: "*", name: "flowers" },
  { id: 4, ch: '"', name: "tallgrass" },
  { id: 5, ch: ":", name: "dirt" },
  { id: 6, ch: "=", name: "cobble" },
  { id: 7, ch: "s", name: "sand" },
  { id: 8, ch: "~", name: "water", solid: true, water: true },
  { id: 9, ch: "-", name: "shallow", slow: true },
  { id: 10, ch: "^", name: "cliff", solid: true },
  { id: 11, ch: "M", name: "rock", solid: true },
  { id: 12, ch: "v", name: "ledge", ledge: true },
  { id: 13, ch: "T", name: "tree", solid: true },
  { id: 14, ch: "P", name: "pine", solid: true },
  { id: 15, ch: "o", name: "boulder", solid: true },
  { id: 16, ch: "f", name: "fence", solid: true },
  { id: 17, ch: "W", name: "ruinwall", solid: true },
  { id: 18, ch: "w", name: "ruinface", solid: true },
  { id: 19, ch: "R", name: "roof", solid: true },
  { id: 20, ch: "r", name: "eave", solid: true },
  { id: 21, ch: "H", name: "housewall", solid: true },
  { id: 22, ch: "D", name: "door" },
  { id: 23, ch: "N", name: "window", solid: true },
  { id: 24, ch: "_", name: "wood" },
  { id: 25, ch: "+", name: "stonefloor" },
  { id: 26, ch: "d", name: "darkfloor" },
  { id: 27, ch: "%", name: "rug" },
  { id: 28, ch: "t", name: "table", solid: true },
  { id: 29, ch: "b", name: "bed", solid: true },
  { id: 30, ch: "h", name: "shelf", solid: true },
  { id: 31, ch: "F", name: "hearth", solid: true },
  { id: 32, ch: "p", name: "crate", solid: true },
  { id: 33, ch: "C", name: "cavemouth" },
  { id: 34, ch: "S", name: "stairs" },
  { id: 35, ch: "X", name: "pit", pit: true },
  { id: 36, ch: "#", name: "dunwall", solid: true },
  { id: 37, ch: ";", name: "dunfloor" },
  { id: 38, ch: "Z", name: "dunwater", solid: true, water: true },
  { id: 39, ch: "I", name: "pillar", solid: true },
  { id: 40, ch: "B", name: "brazier", solid: true },
  { id: 41, ch: "[", name: "bridgeh" },
  { id: 42, ch: "]", name: "bridgev" },
  { id: 43, ch: "y", name: "reeds" },
  { id: 44, ch: "l", name: "lily", solid: true, water: true },
  { id: 45, ch: "q", name: "well", solid: true },
  { id: 46, ch: "c", name: "sea", solid: true, water: true },
  { id: 47, ch: "u", name: "wetsand" },
  { id: 48, ch: "j", name: "courtyard" },
  { id: 49, ch: "k", name: "beaconstand", solid: true },
  { id: 50, ch: "g", name: "arch", solid: true },
  { id: 51, ch: "a", name: "mossstone" },
  { id: 52, ch: "n", name: "dunfloor2" },
  { id: 53, ch: "m", name: "rune" },
  { id: 54, ch: "G", name: "stalagmite", solid: true },
  { id: 55, ch: "e", name: "hay" },
  { id: 56, ch: "L", name: "lamppost", solid: true },
  { id: 57, ch: "O", name: "chasm", pit: true },
];

export const TILES = D;
export const TILE_BY_CH: Record<string, TileDef> = Object.fromEntries(D.map((t) => [t.ch, t]));
export const TILE_BY_ID: TileDef[] = [];
for (const t of D) TILE_BY_ID[t.id] = t;
export const T: Record<string, number> = Object.fromEntries(D.map((t) => [t.name.toUpperCase(), t.id]));

export const TS = 16; // logical tile size
export const CW = 32; // chunk width (tiles)
export const CH = 24; // chunk height (tiles)

export const isSolid = (id: number): boolean => TILE_BY_ID[id]?.solid === true;
export const isLedge = (id: number): boolean => TILE_BY_ID[id]?.ledge === true;
export const isPit = (id: number): boolean => TILE_BY_ID[id]?.pit === true;
export const isWater = (id: number): boolean => TILE_BY_ID[id]?.water === true;
export const isSlow = (id: number): boolean => TILE_BY_ID[id]?.slow === true;

/** Overworld size in chunks (Aurelane is 8x8). Fog, minimap, map views and the server whitelist all derive from these. */
export const REGION_COLS = 8;
export const REGION_ROWS = 8;
export const FOG_CW = 8, FOG_CH = 6; // fog cell size in tiles
export const FOG_W = (REGION_COLS * CW) / FOG_CW, FOG_H = (REGION_ROWS * CH) / FOG_CH;
export const FOG_HEX = (FOG_W * FOG_H) / 4; // hex digits in a save's fog string
export const LEGACY_FOG_W = 16, LEGACY_FOG_HEX = 64; // the 4x4-chunk region used a 16x16 cell grid
