/** Device save slot (localStorage) and the hook the account store uses to upload each save. */
import { migrateSave } from "./sim/migrate";
import type { SaveV2 } from "./sim/types";

let slot = "";
let hook: ((s: SaveV2) => void) | null = null;
const key = () => `emberveil-save-v1:${slot || "guest"}`;

export function setSaveSlot(id: string): void { slot = id; }
export function setSaveHook(fn: (s: SaveV2) => void): void { hook = fn; }

export function readSave(): SaveV2 | null {
  try {
    const raw = localStorage.getItem(key());
    if (!raw) return null;
    const s = migrateSave(JSON.parse(raw));
    return s && typeof s.area === "string" && Array.isArray(s.items) ? s : null;
  } catch { return null; }
}
export function writeSaveLocal(s: SaveV2): void {
  try { localStorage.setItem(key(), JSON.stringify(s)); } catch { /* storage blocked */ }
}
/** Called by the game on every checkpoint (area change, chest, boss, sleep...). */
export function persist(s: SaveV2): void {
  const copy = JSON.parse(JSON.stringify(s)) as SaveV2;
  writeSaveLocal(copy);
  hook?.(copy);
}
export function clearSave(): void { try { localStorage.removeItem(key()); } catch { /* */ } }
