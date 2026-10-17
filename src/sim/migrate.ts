/** Save migrations. Anything that reads a stored save goes through migrateSave. */
import { XP_CAP } from "./data";
import { FOG_HEX, LEGACY_FOG_HEX, LEGACY_FOG_W, FOG_W } from "../tiles";
import type { SaveV1, SaveV2 } from "./types";

/** Rough XP a v1 save has earned: bosses and finished side quests (so nobody starts a finished game at level 1). */
export function estimateXp(s: Pick<SaveV1, "flags" | "quests">): number {
  let xp = 0;
  if (s.flags.includes("marshalDead")) xp += 30;
  if (s.flags.includes("bossDead")) xp += 60;
  for (const id of ["hen", "lantern"]) if ((s.quests?.[id] ?? 0) >= 3) xp += 15;
  return Math.min(XP_CAP, xp);
}

/** Returns a v2 save from a v1 or v2 object, or null when it is neither. */
export function migrateSave(raw: unknown): SaveV2 | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.v === 2) return typeof o.xp === "number" ? { ...(raw as SaveV2), fog: normalizeFog((raw as SaveV2).fog) } : null;
  if (o.v === 1) return { ...(raw as SaveV1), v: 2, xp: estimateXp(raw as SaveV1), fog: normalizeFog((raw as SaveV1).fog) };
  return null;
}

/** Fog from the old 4x4-chunk region (16x16 cells, 64 hex digits) is moved into the top-left of the 8x8 region's grid. */
export function normalizeFog(fog: string): string {
  if (typeof fog !== "string" || fog.length !== LEGACY_FOG_HEX) return fog;
  const out = new Uint8Array(FOG_HEX / 2);
  for (let y = 0; y < LEGACY_FOG_W; y++) for (let x = 0; x < LEGACY_FOG_W; x++) {
    const i = y * LEGACY_FOG_W + x;
    if ((parseInt(fog.slice((i >> 3) * 2, (i >> 3) * 2 + 2), 16) >> (i & 7)) & 1) { const j = y * FOG_W + x; out[j >> 3] |= 1 << (j & 7); }
  }
  return [...out].map((b) => b.toString(16).padStart(2, "0")).join("");
}
