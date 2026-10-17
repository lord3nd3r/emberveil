export type Dir = "up" | "down" | "left" | "right";

export interface Input {
  mx: number; // -1..1
  my: number;
  attack: boolean; // pressed this frame
  attackHeld: boolean;
  shield: boolean; // held
  dodge: boolean; // pressed
  item: boolean; // pressed
  interact: boolean; // pressed
  aim: number | null; // radians, from the mouse; null = use facing
}

export const NO_INPUT: Input = { mx: 0, my: 0, attack: false, attackHeld: false, shield: false, dodge: false, item: false, interact: false, aim: null };

export type SfxName =
  | "swing" | "spin" | "charge" | "hit" | "kill" | "hurt" | "block" | "clang" | "roll" | "hop" | "land"
  | "pickup" | "glint" | "heart" | "chest" | "bigchest" | "key" | "unlock" | "door" | "shutter" | "switch" | "disc" | "fire"
  | "blip" | "select" | "buy" | "deny" | "fall" | "bush" | "splash" | "boss" | "fanfare" | "stairs" | "death" | "save" | "quest" | "levelup" | "lift" | "dash" | "crumble" | "arrow" | "burn" | "gust";

export type Ev =
  | { t: "sfx"; name: SfxName }
  | { t: "toast"; text: string }
  | { t: "music"; track: string | null }
  | { t: "area"; id: string; name: string; kind: "world" | "room" }
  | { t: "shake"; amt: number }
  | { t: "flash" }
  | { t: "spark"; x: number; y: number; color?: string; n?: number }
  | { t: "dmgtext"; x: number; y: number; text: string }
  | { t: "levelup"; x: number; y: number; lvl: number; who: string }
  | { t: "ending" }
  | { t: "saved" };

/** Legacy save (v1). Still read and migrated; never written. */
export interface SaveV1 {
  v: 1;
  area: string; // "world" or a room id
  x: number; // foot position in tiles
  y: number;
  facing: Dir;
  hp: number; // halves of a heart
  hearts: number; // max hearts
  pieces: number; // heart pieces 0..3
  magic: number;
  glints: number;
  items: string[]; // owned unique items (equipment, dungeon items, quest items)
  equipped: string; // "" or item id
  inv: Record<string, number>; // consumables
  keys: number; // small keys held
  flags: string[];
  quests: Record<string, number>;
  chests: string[];
  doors: string[];
  cleared: string[]; // fight rooms cleared
  visited: string[]; // chunk keys "cx,cy" and room ids
  fog: string; // hex bitset of revealed 8x6-tile cells for the region
  playTime: number;
}

/** Current save (v2): v1 plus experience. The level is derived from `xp` (see sim/data.ts), never stored. */
export interface SaveV2 extends Omit<SaveV1, "v"> {
  v: 2;
  xp: number; // total experience, 0..XP_CAP
  allies?: Record<string, number>; // recruited companions: id -> ally XP
}
