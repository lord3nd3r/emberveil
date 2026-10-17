/** Static content tables: items, quests, NPCs, enemies. Phaser-free. */
export interface ItemDef {
  id: string;
  name: string;
  desc: string;
  kind: "equip" | "dungeon" | "quest" | "tool" | "consumable" | "instant";
}

export const ITEMS: Record<string, ItemDef> = {
  keeper_blade: { id: "keeper_blade", name: "Keeper's Blade", desc: "A lamp-keeper's short sword. Tap to slash; hold to charge a spin.", kind: "equip" },
  wicker_buckler: { id: "wicker_buckler", name: "Wicker Buckler", desc: "Hold the guard button to block what comes from the front.", kind: "equip" },
  gale_disc: { id: "gale_disc", name: "Gale Disc", desc: "A spinning disc of wind-forged tin. Throw it to stun foes and strike far switches. Costs magic.", kind: "tool" },
  cistern_map: { id: "cistern_map", name: "Cistern Map", desc: "Shows every room of the Cistern Under-Hall.", kind: "dungeon" },
  cistern_compass: { id: "cistern_compass", name: "Cistern Compass", desc: "Marks the chests and the boss on the Cistern map.", kind: "dungeon" },
  moss_map: { id: "moss_map", name: "Mossgate Map", desc: "Shows every room of the Mossgate Ruins.", kind: "dungeon" },
  moss_compass: { id: "moss_compass", name: "Mossgate Compass", desc: "Marks the chests and the boss on the Mossgate map.", kind: "dungeon" },
  moss_key: { id: "moss_key", name: "Warden's Key", desc: "Opens the great chest and the great door of the Mossgate Ruins.", kind: "dungeon" },
  spire_map: { id: "spire_map", name: "Spire Map", desc: "Shows every room of the Skyreach Spire.", kind: "dungeon" },
  spire_compass: { id: "spire_compass", name: "Spire Compass", desc: "Marks the chests and the boss on the Spire map.", kind: "dungeon" },
  spire_key: { id: "spire_key", name: "Belfry Key", desc: "Opens the great chest and the great door of the Skyreach Spire.", kind: "dungeon" },
  ember_bow: { id: "ember_bow", name: "Ember Bow", desc: "A bow strung with lamp-wick. Equip it and press Q to loose a fire arrow (costs 1 magic): it burns thorn thickets, strikes far switches and grounds flying foes.", kind: "tool" },
  old_medal: { id: "old_medal", name: "Old Medal", desc: "A tarnished Crownwatch service medal. Dorn the veteran lost it on the Eastmarch fields.", kind: "quest" },
  glass_pearl: { id: "glass_pearl", name: "Glass Pearl", desc: "A fat pearl of sea-glass from the Glassmere shallows. Willa the beachcomber wants one.", kind: "quest" },
  bell_rope: { id: "bell_rope", name: "Bell Rope", desc: "A braided rope of belfry silk. Tove the pilgrim needs one to ring the Highmeadow chime.", kind: "quest" },
  kit_lamp: { id: "kit_lamp", name: "Kit's Lamp", desc: "A little tin lamp Kit dropped at the pier.", kind: "quest" },
  big_key: { id: "big_key", name: "Big Key", desc: "Opens the great chest and the great door of the Cistern.", kind: "dungeon" },
  small_key: { id: "small_key", name: "Small Key", desc: "Opens one locked door in the Cistern.", kind: "dungeon" },
  heart_piece: { id: "heart_piece", name: "Ember Shard", desc: "Four shards make one more heart.", kind: "instant" },
  heart_container: { id: "heart_container", name: "Heart Lamp", desc: "A whole new heart, kindled by a fallen guardian.", kind: "instant" },
  dune_gauntlet: { id: "dune_gauntlet", name: "Dune Gauntlet", desc: "A sun-baked gauntlet with the grip of a dozen hands. Face a heavy slab and press E to lift it away.", kind: "tool" },
  spiral_boots: { id: "spiral_boots", name: "Spiral Boots", desc: "Boots that wind up like a spring. Equip them and press Q to dash: across chasms up to three tiles wide, and through cracked rubble.", kind: "tool" },
  archivist_folio: { id: "archivist_folio", name: "Archivist's Folio", desc: "A water-stained folio of dune glyphs, tied with a green ribbon. Pell the Archivist will want it back.", kind: "quest" },
  brass_lantern: { id: "brass_lantern", name: "Brass Lantern", desc: "Oswin the ferryman's lost lantern.", kind: "quest" },
  parcel: { id: "parcel", name: "Ferris's Parcel", desc: "A string-tied parcel marked 'for Garrick, Kestrel Outpost'.", kind: "quest" },
  heron_feather: { id: "heron_feather", name: "Heron Feather", desc: "A long grey feather from Heron Island. Nell the fisher wants one.", kind: "quest" },
  waterskin: { id: "waterskin", name: "Mossa's Waterskin", desc: "A cracked leather waterskin from the Sand Vault.", kind: "quest" },
  stew: { id: "stew", name: "Fenwick Stew", desc: "Warms six hearts at once.", kind: "instant" },
  elixir: { id: "elixir", name: "Ember Elixir", desc: "Refills every heart and all your magic at once.", kind: "instant" },
  tonic: { id: "tonic", name: "Ember Tonic", desc: "Refills every heart. Use it from the Items menu or press H.", kind: "consumable" },
  soup: { id: "soup", name: "Hearth Soup", desc: "Warms four hearts at once.", kind: "instant" },
  mote: { id: "mote", name: "Mote Jar", desc: "Refills your magic.", kind: "instant" },
};
export const GLINT_ITEM = /^glints_(\d+)$/;
export function itemName(id: string): string {
  const m = GLINT_ITEM.exec(id);
  if (m) return `${m[1]} Glints`;
  return ITEMS[id]?.name ?? id;
}
/** Unique items that may appear in a save's `items` list. */
export const UNIQUE_ITEMS = ["keeper_blade", "wicker_buckler", "gale_disc", "cistern_map", "cistern_compass", "big_key", "brass_lantern", "dune_gauntlet", "spiral_boots", "archivist_folio", "moss_map", "moss_compass", "moss_key", "parcel", "heron_feather", "waterskin", "spire_map", "spire_compass", "spire_key", "ember_bow", "old_medal", "glass_pearl", "bell_rope", "kit_lamp"];
/** Items that can sit in the item box (Q uses it, C cycles). The Gauntlet is passive. */
export const EQUIPPABLE = ["gale_disc", "spiral_boots", "ember_bow"];
/** World objects that stay changed once used; their ids are saved in `doors`. */
export const GATE_KINDS = ["slab", "rubble", "thicket"];
export const CONSUMABLES = ["tonic"];
export const FLAGS = ["intro", "gotBlade", "gotBuckler", "metIsolde", "metMarla", "metTam", "metKit", "metBram", "metTamsin", "henFound", "lanternFound", "marshalDead", "bossDead", "cisternCleared", "heartContainer", "sliceDone", "gotBoots", "rootknightDead", "wardenDead", "mossOpened", "cloudmarshalDead", "stormfinchDead", "vaelDead", "keepOpened"];
export const QUESTS = ["cistern", "wardstone", "thirdlamp", "hen", "lantern", "folio", "parcel", "feather", "waterskin", "crown", "medal", "pearl", "bellrope", "kitlamp"];

export interface QuestDef {
  id: string;
  name: string;
  main?: boolean;
  stages: string[]; // text for stage 1..n (index = stage-1); the last entry is the "done" text
}
export const QUEST_DEFS: QuestDef[] = [
  { id: "cistern", name: "The Dark Beacon", main: true, stages: ["Speak with Warden Isolde in Emberfen's square.", "Enter the Cistern Under-Hall through the grate at Beacon Hall, and find what lights the dark below.", "Return to Isolde and tell her the tide is yours."].concat(["The first lamp is lit. More wardstones await beyond Aurelane's edge."]) },
  { id: "wardstone", name: "The Second Lamp", main: true, stages: ["Isolde says a second wardstone sleeps beneath Whispering Grove. The Mossgate stair has woken.", "Descend the Mossgate Ruins and face whatever keeps the wardstone dark.", "The Bark Warden is down and the second lamp burns. Tell Isolde."] },
  { id: "thirdlamp", name: "The Third Lamp", main: true, stages: ["Isolde says the third wardstone burns in Skyreach Spire, far to the north-east. The Spire door has woken.", "Climb the five floors of the Skyreach Spire and bring down Stormfinch Mol.", "Stormfinch Mol is down and the third lamp burns. Every wardstone is lit: Crownwatch Keep waits."] },
  { id: "crown", name: "The Crown Unlit", main: true, stages: ["All three lamps burn. The barred doors of Crownwatch Keep stand open to the south of the castle.", "Cross the Keep and face Vael Orsek in the Lantern-Crown's hall.", "Vael Orsek has fallen, and the Veil is mended. Aurelane has her lamp-keeper."] },
  { id: "medal", name: "The Old Medal", stages: ["Dorn the veteran lost his Crownwatch medal somewhere on the Eastmarch fields.", "You have the medal. Take it back to Dorn at the Crownwatch moat.", "Dorn is proud again, and he will march with you when you need him."] },
  { id: "pearl", name: "Willa's Glass Pearl", stages: ["Willa wants a pearl of sea-glass from the Glassmere shallows in the dunes.", "You have the pearl. Take it to Willa at Gullcove.", "Willa is delighted and paid you handsomely."] },
  { id: "bellrope", name: "The Silent Chime", stages: ["Tove the pilgrim needs a bell rope: the Spire's Reading Gallery should have one.", "You have the rope. Take it to Tove in Highmeadow.", "The Highmeadow chime rings again, and Tove paid you."] },
  { id: "kitlamp", name: "Kit's Little Lamp", stages: ["Kit dropped a little tin lamp near the pier and wants it back.", "You have Kit's lamp. Take it to Kit in Emberfen.", "Kit is thrilled, and wants to come along and help."] },
  { id: "hen", name:  "Maple's Missing Hen", stages: ["Granny Maple's hen Pip slipped her pen. Search the Orchard Fields.", "You have Pip. Take her back to Granny Maple in the Orchard.", "Pip is home, and Granny shared a shard of crown-glass."] },
  { id: "folio", name: "The Archivist's Folio", stages: ["Pell the archivist in Mirewick Swamp lost his folio in the Mossgate Ruins beneath Whispering Grove.", "You have the folio. Bring it to Pell in his hut in Mirewick.", "Pell is delighted, and the boots he made are yours: spiral soles that dash over gaps."] },
  { id: "parcel", name: "Ferris's Parcel", stages: ["Ferris wants his parcel carried to Garrick at Kestrel Outpost on the plateau.", "The parcel is with Garrick.", "Garrick signed for the parcel and paid you for the walk."] },
  { id: "feather", name: "Nell's Heron Feather", stages: ["Nell the fisher wants a heron feather from Heron Island, across the long bridge on Greatwater's north shore.", "You have a heron feather. Take it to Nell at her pier house.", "Nell was delighted, and shared an Ember Shard."] },
  { id: "waterskin", name: "Mossa's Waterskin", stages: ["Mossa dropped her waterskin in the Sand Vault in the Ashglass Dunes.", "You have the waterskin. Bring it to Mossa at the oasis.", "Mossa filled it at once, and thanked you with a shard."] },
  { id: "lantern", name: "Oswin's Brass Lantern", stages: ["Oswin the ferryman lost his lantern on a dry mound in Reedmarsh. Find it.", "You have the lantern. Bring it to Oswin at Tidemarch Lake's pier.", "Oswin has his light back, and paid you for it."] },
];

export interface NpcDef {
  id: string;
  name: string; // shown label
  role: string;
  look: { skin: string; hair: string; cloth: string; trim: string; kind?: "person" | "hen" };
}
export const NPCS: Record<string, NpcDef> = {
  isolde: { id: "isolde", name: "Warden Isolde", role: "Quest giver", look: { skin: "#e6b48a", hair: "#d8dce8", cloth: "#4a6aa8", trim: "#f2c85a" } },
  marla: { id: "marla", name: "Marla", role: "Villager", look: { skin: "#d89c74", hair: "#6a3a28", cloth: "#b05a4a", trim: "#f0d8a0" } },
  tam: { id: "tam", name: "Tam", role: "Villager", look: { skin: "#e8bc94", hair: "#c88a3a", cloth: "#6a9a5a", trim: "#f0e4b0" } },
  kit: { id: "kit", name: "Kit", role: "Villager", look: { skin: "#c88c64", hair: "#2a2030", cloth: "#8a5aa8", trim: "#f0d070" } },
  tamsin: { id: "tamsin", name: "Tamsin (Lampwright)", role: "Shop", look: { skin: "#d49a70", hair: "#8a3a2a", cloth: "#d8a03a", trim: "#fff0c0" } },
  granny: { id: "granny", name: "Granny Maple", role: "Quest: Missing Hen", look: { skin: "#ecc8a8", hair: "#e8e8ee", cloth: "#7a6aa8", trim: "#e8d8f0" } },
  pip: { id: "pip", name: "Pip (hen)", role: "Quest target", look: { skin: "#fff", hair: "#f0f0f0", cloth: "#fffbe8", trim: "#e0503a", kind: "hen" } },
  oswin: { id: "oswin", name: "Oswin (Ferryman)", role: "Quest: Brass Lantern", look: { skin: "#c89470", hair: "#58606a", cloth: "#3a6a7a", trim: "#d8c890" } },
  pell: { id: "pell", name: "Pell the Archivist", role: "Quest: Folio", look: { skin: "#dcb090", hair: "#a8a8b8", cloth: "#486a58", trim: "#e8d890" } },
  garrick: { id: "garrick", name: "Garrick", role: "Shop", look: { skin: "#c88c64", hair: "#3a2a20", cloth: "#7a4a30", trim: "#d8b868" } },
  nell: { id: "nell", name: "Nell", role: "Villager", look: { skin: "#e0b088", hair: "#2a4a6a", cloth: "#3a8a8a", trim: "#f0e0a0" } },
  ferris: { id: "ferris", name: "Ferris", role: "Traveller", look: { skin: "#d8a078", hair: "#8a5a2a", cloth: "#9a5a3a", trim: "#f0d890" } },
  dorn: { id: "dorn", name: "Dorn the Veteran", role: "Quest: Old Medal", look: { skin: "#c89470", hair: "#b8b8b8", cloth: "#5a6a8a", trim: "#d8b048" } },
  willa: { id: "willa", name: "Willa", role: "Quest: Glass Pearl", look: { skin: "#e0b088", hair: "#d8a84a", cloth: "#3a9aa0", trim: "#f0f0d0" } },
  tove: { id: "tove", name: "Tove the Pilgrim", role: "Quest: Bell Rope", look: { skin: "#d8a888", hair: "#4a3a5a", cloth: "#8a6aa8", trim: "#f0e090" } },
  mossa: { id: "mossa", name: "Mossa", role: "Traveller", look: { skin: "#b88860", hair: "#506a3a", cloth: "#a8884a", trim: "#f0e0b0" } },
  bram: { id: "bram", name: "Bram the Hermit", role: "Hints", look: { skin: "#d8aa88", hair: "#c8c0b0", cloth: "#6a5a40", trim: "#a89870" } },
};

export interface EnemyDef {
  kind: string;
  name: string;
  hp: number;
  r: number; // body radius px
  touch: number; // contact damage (halves)
  flying?: boolean;
  boss?: boolean;
  drop?: number; // drop chance
  deadFlag?: string; // boss/mini-boss stays gone once this flag is set
  xp: number; // experience for a defeat
  tier: number; // XP shrinks once the hero is 3+ levels above this (grinding is optional)
}
export const ENEMIES: Record<string, EnemyDef> = {
  slime: { kind: "slime", name: "Murk Slime", hp: 2, r: 5.5, touch: 1, drop: 0.35, xp: 2, tier: 1 },
  bat: { kind: "bat", name: "Gloam Bat", hp: 1, r: 5, touch: 1, flying: true, drop: 0.3, xp: 2, tier: 1 },
  crab: { kind: "crab", name: "Shellback Crab", hp: 3, r: 6.5, touch: 2, drop: 0.4, xp: 4, tier: 2 },
  wisp: { kind: "wisp", name: "Cinder Wisp", hp: 2, r: 5, touch: 1, flying: true, drop: 0.4, xp: 3, tier: 2 },
  soldier: { kind: "soldier", name: "Hollow Soldier", hp: 4, r: 6.5, touch: 2, drop: 0.5, xp: 5, tier: 3 },
  marshal: { kind: "marshal", name: "Gaol-Marshal Brann", hp: 12, r: 9, touch: 1, boss: true, deadFlag: "marshalDead", xp: 30, tier: 9 },
  sluicejaw: { kind: "sluicejaw", name: "Sluicejaw", hp: 32, r: 12, touch: 4, boss: true, deadFlag: "bossDead", xp: 60, tier: 9 },
  thornling: { kind: "thornling", name: "Thornling", hp: 3, r: 5.5, touch: 1, drop: 0.35, xp: 4, tier: 2 },
  beetle: { kind: "beetle", name: "Plate Beetle", hp: 5, r: 6, touch: 2, drop: 0.4, xp: 6, tier: 3 },
  skipper: { kind: "skipper", name: "Sandskipper", hp: 2, r: 5, touch: 1, drop: 0.3, xp: 3, tier: 2 },
  mirefly: { kind: "mirefly", name: "Mirefly", hp: 1, r: 4, touch: 1, flying: true, drop: 0.25, xp: 2, tier: 1 },
  archer: { kind: "archer", name: "Hollow Archer", hp: 3, r: 6, touch: 1, drop: 0.5, xp: 6, tier: 3 },
  cloudmarshal: { kind: "cloudmarshal", name: "Cloudmarshal Vesk", hp: 24, r: 9, touch: 2, boss: true, deadFlag: "cloudmarshalDead", xp: 70, tier: 9 },
  stormfinch: { kind: "stormfinch", name: "Stormfinch Mol", hp: 52, r: 12, touch: 4, flying: true, boss: true, deadFlag: "stormfinchDead", xp: 130, tier: 9 },
  rootknight: { kind: "rootknight", name: "Rootknight Ulm", hp: 18, r: 9, touch: 2, boss: true, deadFlag: "rootknightDead", xp: 45, tier: 9 },
  vael: { kind: "vael", name: "Vael Orsek", hp: 70, r: 11, touch: 4, boss: true, deadFlag: "vaelDead", xp: 220, tier: 12 },
  barkwarden: { kind: "barkwarden", name: "The Bark Warden", hp: 44, r: 13, touch: 4, boss: true, deadFlag: "wardenDead", xp: 90, tier: 9 },
};

export const SHOP: { id: string; item: string; price: number }[] = [
  { id: "shop_tonic", item: "tonic", price: 30 },
  { id: "shop_soup", item: "soup", price: 10 },
  { id: "shop_mote", item: "mote", price: 12 },
];

export interface DungeonDef {
  id: string; name: string; prefix: string; entry: [string, number, number]; map: string; compass: string; key: string; boss: string; bossFlag: string; floors: string[];
}
export const DUNGEONS: DungeonDef[] = [
  { id: "cistern", name: "Cistern Under-Hall", prefix: "cistern_", entry: ["cistern_r1", 12, 13], map: "cistern_map", compass: "cistern_compass", key: "big_key", boss: "sluicejaw", bossFlag: "bossDead", floors: ["Floor 1"] },
  { id: "spire", name: "Skyreach Spire", prefix: "spire_", entry: ["spire_a1", 12, 13], map: "spire_map", compass: "spire_compass", key: "spire_key", boss: "stormfinch", bossFlag: "stormfinchDead", floors: ["Foundation", "Gallery", "Library", "Belfry", "Roost"] },
  { id: "moss", name: "Mossgate Ruins", prefix: "moss_", entry: ["moss_a1", 12, 13], map: "moss_map", compass: "moss_compass", key: "moss_key", boss: "barkwarden", bossFlag: "wardenDead", floors: ["Ground floor", "Upper floor", "Cellar"] },
  { id: "keep", name: "Crownwatch Keep", prefix: "keep_", entry: ["keep_a1", 12, 13], map: "", compass: "", key: "", boss: "vael", bossFlag: "vaelDead", floors: ["Keep"] },
];
export const dungeonOf = (roomId: string): DungeonDef | undefined => DUNGEONS.find((d) => roomId.startsWith(d.prefix));

/** Two shops: the Lampwright's (tier 1) and the Kestrel Outpost (tier 2, better and bigger stock). */
export const SHOPS: Record<string, { id: string; item: string; price: number }[]> = {
  lamp: SHOP,
  outpost: [
    { id: "shop_k_tonic", item: "tonic", price: 26 },
    { id: "shop_k_stew", item: "stew", price: 22 },
    { id: "shop_k_elixir", item: "elixir", price: 75 },
    { id: "shop_k_mote", item: "mote", price: 10 },
  ],
};

export const AREA_NAMES: Record<string, string> = {};

/* ---------------------------------------------------------------- experience and levels */
export const MAX_LEVEL = 10;
/** Total XP needed to reach level i+1. */
export const LEVEL_XP = [0, 20, 50, 90, 140, 200, 275, 360, 460, 580];
export const XP_CAP = LEVEL_XP[MAX_LEVEL - 1];
export const levelOf = (xp: number): number => { let l = 1; while (l < MAX_LEVEL && xp >= LEVEL_XP[l]) l++; return l; };
/** Extra max-life in halves of a heart: +1 heart at level 4 and +1 at level 8 (heart containers and shards stay the big gains). */
export const hpBonusHalves = (lvl: number): number => (lvl >= 8 ? 2 : 0) + (lvl >= 4 ? 2 : 0);
/** Sword and spin damage multiplier: +8% per level above 1. */
export const atkMul = (lvl: number): number => 1 + 0.08 * (lvl - 1);
/** Halves of a heart shaved off a hit of 2+ halves: 1 from level 6, 2 from level 9 (never more than half the hit). */
export const defReduce = (lvl: number, dmg: number): number => (dmg < 2 ? 0 : Math.min(Math.floor(dmg / 2), lvl >= 9 ? 2 : lvl >= 6 ? 1 : 0));
/** XP for a defeat, fading to nothing once the hero outlevels the foe by more than 3 (bosses never fade). */
export function xpGain(def: EnemyDef, lvl: number): number {
  if (def.boss) return def.xp;
  const over = lvl - (def.tier + 3);
  const mult = over <= 0 ? 1 : Math.max(0.2, 1 - 0.25 * over);
  return Math.round(def.xp * mult);
}
export const XP_QUEST = 15;

/* ---------------------------------------------------------------- allies (companions that level up) */
export interface AllyDef { id: string; name: string; style: "bolt" | "blade"; range: number; cd: number; dmg: number; color: string }
export const ALLIES: Record<string, AllyDef> = {
  kit: { id: "kit", name: "Kit", style: "bolt", range: 84, cd: 1.9, dmg: 1, color: "#ffe28a" },
  dorn: { id: "dorn", name: "Dorn", style: "blade", range: 30, cd: 1.3, dmg: 1.5, color: "#bcd0ff" },
};
export const ALLY_LEVEL_XP = [0, 20, 50, 90, 140];
export const ALLY_MAX_LEVEL = ALLY_LEVEL_XP.length;
export const ALLY_XP_CAP = ALLY_LEVEL_XP[ALLY_MAX_LEVEL - 1] + 40;
export const allyLevel = (xp: number): number => { let l = 1; while (l < ALLY_MAX_LEVEL && xp >= ALLY_LEVEL_XP[l]) l++; return l; };
/** An ally's hit: grows with level (level 1 = the base, +25% per level). */
export const allyDmg = (def: AllyDef, lvl: number): number => def.dmg * (1 + 0.25 * (lvl - 1));
