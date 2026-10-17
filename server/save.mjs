// Save validation shared by the server and the self-check. Whitelist-only: unknown fields are dropped, impossible values rejected.
import fs from "node:fs";
const C = JSON.parse(fs.readFileSync(new URL("./content.json", import.meta.url), "utf8"));
const FACINGS = ["up", "down", "left", "right"];
const num = (v, lo, hi) => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
const int = (v, lo, hi) => num(v, lo, hi) && Number.isInteger(v);
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const strList = (v, allowed, max) => {
  if (!Array.isArray(v) || v.length > max) return null;
  const out = [];
  for (const s of v) { if (typeof s !== "string" || !allowed.has(s)) return null; if (!out.includes(s)) out.push(s); }
  return out;
};
const sets = {
  areas: new Set(["world", ...C.rooms]),
  items: new Set(C.items), flags: new Set(C.flags), chests: new Set(C.chests), doors: new Set(C.doors),
  cleared: new Set(C.fightRooms), visited: new Set([...C.rooms, ...C.chunks]),
};

export const SAVE_VERSION = 2;
/** Same rule as normalizeFog in src/sim/migrate.ts: the old 16x16-cell fog (64 hex) moves into the top-left of the current grid. */
function normalizeFog(fog) {
  if (typeof fog !== "string" || fog.length !== 64) return fog;
  const out = new Uint8Array(C.fogHex / 2);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const i = y * 16 + x;
    if ((parseInt(fog.slice((i >> 3) * 2, (i >> 3) * 2 + 2), 16) >> (i & 7)) & 1) { const j = y * C.fogW + x; out[j >> 3] |= 1 << (j & 7); }
  }
  return [...out].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const XP_CAP = C.levelXp[C.levelXp.length - 1];
const levelOf = (xp) => { let l = 1; while (l < C.levelXp.length && xp >= C.levelXp[l]) l++; return l; };
/** Extra max-life (halves of a heart) from the hero level: must match hpBonusHalves in src/sim/data.ts (the self-check compares them). */
export const hpBonusHalves = (lvl) => (lvl >= 8 ? 2 : 0) + (lvl >= 4 ? 2 : 0);
/** XP a v1 save is credited with when it is upgraded (same rule as src/sim/migrate.ts). */
const estimateXp = (s) => Math.min(XP_CAP, (s.flags?.includes?.("marshalDead") ? 30 : 0) + (s.flags?.includes?.("bossDead") ? 60 : 0) + ["hen", "lantern"].filter((q) => (s.quests?.[q] ?? 0) >= 3).length * 15);

/** Rebuilds a v2 save from known fields only (v1 saves are upgraded first); returns null for anything impossible. */
export function cleanSave(raw) {
  if (!isObj(raw)) return null;
  if (raw.v === 1) raw = { ...raw, v: 2, xp: estimateXp(raw) };
  if (raw.v !== 2 || !int(raw.xp, 0, XP_CAP)) return null;
  if (typeof raw.area !== "string" || !sets.areas.has(raw.area)) return null;
  if (!num(raw.x, 0, 256) || !num(raw.y, 0, 256) || !FACINGS.includes(raw.facing)) return null;
  if (!int(raw.hearts, 3, 20) || !int(raw.hp, 1, raw.hearts * 2 + hpBonusHalves(levelOf(raw.xp))) || !int(raw.pieces, 0, 3)) return null;
  if (!num(raw.magic, 0, 32) || !int(raw.glints, 0, 999) || !int(raw.keys, 0, 4) || !num(raw.playTime, 0, 1e9)) return null;
  const items = strList(raw.items, sets.items, 32);
  const flags = strList(raw.flags, sets.flags, 64);
  const chests = strList(raw.chests, sets.chests, 128);
  const doors = strList(raw.doors, sets.doors, 160);
  const cleared = strList(raw.cleared, sets.cleared, 16);
  const visited = strList(raw.visited, sets.visited, 64);
  if (!items || !flags || !chests || !doors || !cleared || !visited) return null;
  if (typeof raw.equipped !== "string" || (raw.equipped !== "" && (!C.equippable.includes(raw.equipped) || !items.includes(raw.equipped)))) return null;
  if (typeof raw.fog !== "string") return null;
  const fog = normalizeFog(raw.fog);
  if (!new RegExp(`^[0-9a-f]{${C.fogHex}}$`).test(fog)) return null;
  const inv = {};
  if (!isObj(raw.inv)) return null;
  for (const id of C.consumables) { const n = raw.inv[id]; if (n === undefined) continue; if (!int(n, 0, 9)) return null; if (n > 0) inv[id] = n; }
  const quests = {};
  if (!isObj(raw.quests)) return null;
  for (const id of C.quests) { const n = raw.quests[id]; if (n === undefined) continue; if (!int(n, 0, 4)) return null; if (n > 0) quests[id] = n; }
  const containers = ["bossDead", "wardenDead", "stormfinchDead"].filter((f) => flags.includes(f)).length;
  if (raw.hearts > 3 + containers + 1) return null;
  const allies = {};
  if (raw.allies !== undefined) {
    if (!isObj(raw.allies)) return null;
    for (const [id, n] of Object.entries(raw.allies)) { if (!(C.allies ?? []).includes(id) || !int(n, 0, C.allyXpCap ?? 0)) return null; allies[id] = n; }
  }
  return { v: 2, xp: raw.xp, area: raw.area, x: Math.round(raw.x * 100) / 100, y: Math.round(raw.y * 100) / 100, facing: raw.facing, hp: raw.hp, hearts: raw.hearts, pieces: raw.pieces, magic: Math.round(raw.magic), glints: raw.glints, items, equipped: raw.equipped, inv, keys: raw.keys, flags, quests, allies, chests, doors, cleared, visited, fog, playTime: Math.round(raw.playTime) };
}

/** Progress may only move forward. */
export function progressOk(prev, next) {
  if (!prev) return true;
  const sub = (a, b) => a.every((x) => b.includes(x));
  if (!sub(prev.flags, next.flags) || !sub(prev.chests, next.chests) || !sub(prev.doors, next.doors) || !sub(prev.cleared, next.cleared)) return false;
  if (!sub(prev.items.filter((i) => i !== "brass_lantern"), next.items)) return false;
  for (const id of C.quests) if ((next.quests[id] ?? 0) < (prev.quests?.[id] ?? 0)) return false;
  for (const [id, n] of Object.entries(prev.allies ?? {})) if ((next.allies?.[id] ?? -1) < n) return false; // companions never leave and never un-learn
  if ((next.xp ?? 0) < (prev.xp ?? 0)) return false; // experience never goes backwards (v1 saves count as 0)
  if (next.hearts < prev.hearts || next.hearts > prev.hearts + 2) return false;
  if (next.playTime + 5 < prev.playTime) return false;
  return true;
}
