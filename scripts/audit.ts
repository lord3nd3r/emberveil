/**
 * Reachability + softlock audit over the real map data and the sim's own collision rules.
 * Graph nodes are (area, tile) cells the player's foot box can stand in. Edges are 4-neighbour steps, one-way ledge hops
 * and warps/doors. A DFS over key/door states checks that every chest, door, NPC, sign, crystal and boss is reachable,
 * that no order of spending small keys strands the player, and that every reachable cell can walk back to the village.
 *   npm run audit
 */
import { Sim, type Thing } from "../src/sim/core";
import { ITEMS } from "../src/sim/data";
import { nodeWorld } from "../src/sim/node";
import { TS, isLedge, isPit, isSolid } from "../src/tiles";

export interface AuditResult { ok: boolean; lines: string[]; errors: string[]; stats: Record<string, number> }

interface AreaInfo { id: string; sim: Sim; w: number; h: number }

export async function runAudit(): Promise<AuditResult> {
  const lines: string[] = [];
  const errors: string[] = [];
  const stats: Record<string, number> = {};
  const world = nodeWorld();
  await world.init();
  const areas = new Map<string, AreaInfo>();
  for (const id of ["world", ...world.roomIds]) {
    const sim = new Sim(world);
    await sim.auditLoad(id);
    sim.setFlag("marshalDead"); sim.setFlag("cloudmarshalDead"); sim.setFlag("stormfinchDead"); // reliquary chest is revealed once the mini-boss falls; treat it as visible
    areas.set(id, { id, sim, w: sim.area.w, h: sim.area.h });
  }
  const nid = (a: string, x: number, y: number) => `${a}|${x}|${y}`;

  /* ---- warp consistency ---- */
  const allThings: { area: string; th: Thing }[] = [];
  for (const a of areas.values()) for (const th of a.sim.things) allThings.push({ area: a.id, th });
  const cellOf = (tx: number, ty: number): [number, number] => [Math.floor(tx), Math.floor(ty)];
  let warps = 0;
  for (const { area, th } of allThings) {
    if (th.t !== "warp" && th.t !== "door") continue;
    const to = th.raw.to as string;
    if (!to) continue; // decorative locked doors
    warps++;
    const dest = areas.get(to);
    if (!dest) { errors.push(`${area}:${th.id} warps to unknown area ${to}`); continue; }
    const tx = th.raw.tx as number, ty = th.raw.ty as number;
    const [cx, cy] = cellOf(tx, ty);
    const sim = dest.sim;
    const fx = tx * TS, fy = ty * TS;
    const open = !sim.blocked(fx - 5, fy - 6, fx + 5, fy, true, null, true);
    if (!open) errors.push(`${area}:${th.id} lands inside a wall in ${to} at (${tx},${ty})`);
    if (!sim.standable(cx, cy)) errors.push(`${area}:${th.id} destination cell ${to}(${cx},${cy}) not standable`);
  }
  stats.warps = warps;

  /* ---- state ---- */
  interface State { keys: number; items: Set<string>; doors: Set<string>; flags: Set<string>; taken: Set<string> }
  const doorThings = allThings.filter((x) => x.th.t === "door");
  const chests = allThings.filter((x) => x.th.t === "chest");
  const npcs = allThings.filter((x) => x.th.t === "npc");
  const signs = allThings.filter((x) => x.th.t === "sign");
  const crystals = allThings.filter((x) => x.th.t === "crystal");
  const slabs = allThings.filter((x) => x.th.t === "slab");
  const rubble = allThings.filter((x) => x.th.t === "rubble");
  const thickets = allThings.filter((x) => x.th.t === "thicket");
  const bosses: { area: string; x: number; y: number; kind: string }[] = [];
  for (const a of areas.values()) for (const e of a.sim.enemies) if (e.def.boss) bosses.push({ area: a.id, x: Math.floor(e.x / TS), y: Math.floor(e.y / TS), kind: e.kind });

  const QUEST_GIVES: Record<string, { needs: string[]; item: string; flag: string }> = { pell: { needs: ["archivist_folio"], item: "spiral_boots", flag: "gotBoots" } };
  const doorOpenIn = (st: State, th: Thing) => (th.raw.kind as string) === "open" || st.doors.has(th.id);

  function build(st: State) {
    // apply door state to every sim
    for (const a of areas.values()) { a.sim.save.doors = [...st.doors]; a.sim.save.flags = [...st.flags]; a.sim.sealed = false; for (const th of a.sim.things) if (th.t === "slab" || th.t === "rubble" || th.t === "thicket") th.cut = st.doors.has(th.id); }
    const boots = st.items.has("spiral_boots");
    const stand = new Map<string, boolean>();
    const isStand = (a: AreaInfo, x: number, y: number): boolean => {
      const k = nid(a.id, x, y);
      let v = stand.get(k);
      if (v === undefined) { v = x >= 0 && y >= 0 && x < a.w && y < a.h && a.sim.standable(x, y); stand.set(k, v); }
      return v;
    };
    const adj = new Map<string, string[]>();
    const add = (f: string, t: string) => { let l = adj.get(f); if (!l) adj.set(f, (l = [])); l.push(t); };
    for (const a of areas.values()) {
      for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) {
        if (!isStand(a, x, y)) continue;
        const me = nid(a.id, x, y);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (isStand(a, nx, ny)) add(me, nid(a.id, nx, ny));
          else if (boots && isPit(a.sim.tile(nx, ny))) {
            // Spiral Boots dash: straight across up to three chasm tiles
            let k = 1;
            while (k <= 3 && isPit(a.sim.tile(x + dx * k, y + dy * k))) k++;
            if (isStand(a, x + dx * k, y + dy * k)) add(me, nid(a.id, x + dx * k, y + dy * k));
          } else if (dy === 1 && dx === 0 && isLedge(a.sim.tile(nx, ny))) {
            let ty = ny;
            while (isLedge(a.sim.tile(nx, ty)) || isSolid(a.sim.tile(nx, ty))) { ty++; if (ty > ny + 6) break; }
            if (isStand(a, nx, ty)) add(me, nid(a.id, nx, ty));
          }
        }
      }
      for (const th of a.sim.things) {
        if (th.t !== "warp" && th.t !== "door") continue;
        const to = th.raw.to as string;
        if (!to) continue;
        if (th.t === "door" && !doorOpenIn(st, th)) continue;
        const need = th.raw.needFlag as string | undefined;
        if (need && !st.flags.has(need)) continue;
        const reveal = th.raw.reveal as string | undefined;
        if (reveal && !st.flags.has(reveal)) continue;
        const [dcx, dcy] = cellOf(th.raw.tx as number, th.raw.ty as number);
        for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) {
          const fx = x * TS + 8, fy = y * TS + 10 - 3;
          if (isStand(a, x, y) && fx > th.x - th.w / 2 && fx < th.x + th.w / 2 && fy > th.y - th.h / 2 && fy < th.y + th.h / 2) add(nid(a.id, x, y), nid(to, dcx, dcy));
        }
      }
    }
    return { adj, isStand };
  }

  function bfs(adj: Map<string, string[]>, from: string[]): Set<string> {
    const seen = new Set<string>(from);
    const q = [...from];
    while (q.length) {
      const n = q.pop()!;
      for (const m of adj.get(n) ?? []) if (!seen.has(m)) { seen.add(m); q.push(m); }
    }
    return seen;
  }

  const startNode = nid("ren_house", 8, 6);
  const plazaNode = nid("world", 47, 40);

  /** Is any standable cell orthogonally next to this thing's footprint reached? */
  function touching(reach: Set<string>, area: string, th: Thing, extra = 0): boolean {
    const a = areas.get(area)!;
    const x0 = Math.floor((th.x - th.w / 2) / TS) - 1 - extra, x1 = Math.floor((th.x + th.w / 2 - 1) / TS) + 1 + extra;
    const y0 = Math.floor((th.y - th.h / 2) / TS) - 1 - extra, y1 = Math.floor((th.y + th.h / 2 + 3) / TS) + 1 + extra;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (reach.has(nid(a.id, x, y))) return true;
    return false;
  }
  function crystalHit(reach: Set<string>, area: string, th: Thing): boolean {
    const a = areas.get(area)!;
    for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) {
      if (!reach.has(nid(area, x, y))) continue;
      const px = x * TS + 8, py = y * TS + 4;
      const d = Math.hypot(th.x - px, th.y - py);
      if (d > 88) continue;
      // straight line over non-solid-wall tiles (water and pits are fine for a thrown disc)
      let clear = true;
      for (let s = 1; s < 12 && clear; s++) {
        const sx = px + ((th.x - px) * s) / 12, sy = py + ((th.y - py) * s) / 12;
        const id = a.sim.tileAtPx(sx, sy);
        if (isSolid(id) && !(id === 8 || id === 38 || id === 44 || id === 46)) clear = false;
      }
      if (clear) return true;
    }
    return false;
  }

  const smallDoors = doorThings.filter((d) => d.th.raw.kind === "small");
  // distinct door ids (each logical door appears on both sides)
  const smallIds = [...new Set(smallDoors.map((d) => d.th.id))];
  const totalKeys = chests.filter((c) => c.th.raw.item === "small_key").length;
  if (totalKeys < smallIds.length) errors.push(`only ${totalKeys} small key chests for ${smallIds.length} locked doors`);

  const key = (st: State) => [[...st.doors].sort().join(","), [...st.taken].sort().join(","), st.keys].join("|");
  const seenStates = new Map<string, boolean>(); // state key -> completable
  let complete: { reach: Set<string>; st: State } | null = null;
  let explored = 0;
  const everReach = new Set<string>();
  const failReturn: string[] = [];

  function closure(st: State): Set<string> {
    for (;;) {
      const { adj } = build(st);
      const reach = bfs(adj, [startNode]);
      let changed = false;
      for (const c of chests) {
        if (st.taken.has(c.th.id)) continue;
        if (!touching(reach, c.area, c.th)) continue;
        if (c.th.raw.big && !st.items.has((c.th.raw.key as string) ?? "big_key")) continue;
        st.taken.add(c.th.id); changed = true;
        const it = c.th.raw.item as string;
        if (it === "small_key") st.keys++; else st.items.add(it);
        if (it === "keeper_blade") st.flags.add("gotBlade");
      }
      for (const g of slabs) if (!st.doors.has(g.th.id) && st.items.has("dune_gauntlet") && touching(reach, g.area, g.th)) { st.doors.add(g.th.id); changed = true; }
      for (const g of rubble) if (!st.doors.has(g.th.id) && st.items.has("spiral_boots") && touching(reach, g.area, g.th, 1)) { st.doors.add(g.th.id); changed = true; }
      for (const g of thickets) if (!st.doors.has(g.th.id) && st.items.has("ember_bow") && touching(reach, g.area, g.th, 3)) { st.doors.add(g.th.id); changed = true; }
      for (const n of npcs) {
        // quest givers that hand over items (a quest item taken from a chest is turned in)
        const gives = QUEST_GIVES[n.th.id];
        if (gives && !st.flags.has(gives.flag) && gives.needs.every((i) => st.items.has(i)) && touching(reach, n.area, n.th)) { st.flags.add(gives.flag); st.items.add(gives.item); changed = true; }
        if (n.th.id === "isolde" && !st.flags.has("metIsolde") && touching(reach, n.area, n.th)) { st.flags.add("metIsolde"); changed = true; }
      }
      for (const d of doorThings) {
        if (st.doors.has(d.th.id)) continue;
        const kind = d.th.raw.kind as string;
        if (kind === "big" && st.items.has((d.th.raw.key as string) ?? "big_key") && touching(reach, d.area, d.th)) { st.doors.add(d.th.id); changed = true; }
        if (kind === "switch") {
          const cr = crystals.find((c) => c.area === d.area || true && c.th.id === d.th.raw.crystal);
          if (cr && (st.items.has("gale_disc") || st.items.has("ember_bow")) && crystalHit(reach, cr.area, cr.th)) { st.doors.add(d.th.id); changed = true; }
        }
      }
      if (!changed) { for (const r of reach) everReach.add(r); return reach; }
    }
  }

  function dfs(st: State): boolean {
    const k = key(st);
    const hit = seenStates.get(k);
    if (hit !== undefined) return hit;
    seenStates.set(k, false);
    explored++;
    const reach = closure(st);
    // return-path check: everything reachable can get back to the village plaza
    const { adj } = build(st);
    const rev = new Map<string, string[]>();
    for (const n of reach) for (const m of adj.get(n) ?? []) { let l = rev.get(m); if (!l) rev.set(m, (l = [])); l.push(n); }
    const back = bfs(rev, [plazaNode]);
    for (const n of reach) if (!back.has(n)) { failReturn.push(`${n} cannot return to Emberfen (keys=${st.keys}, doors=${[...st.doors].join("+")})`); break; }
    // branch: unlock a small door
    let any = false;
    let done = false;
    for (const id of smallIds) {
      if (st.doors.has(id) || st.keys <= 0) continue;
      const sides = smallDoors.filter((d) => d.th.id === id);
      if (!sides.some((d) => touching(reach, d.area, d.th))) continue;
      any = true;
      const n: State = { keys: st.keys - 1, items: new Set(st.items), doors: new Set([...st.doors, id]), flags: new Set(st.flags), taken: new Set(st.taken) };
      if (dfs(n)) done = true;
    }
    if (!any) {
      const allChests = chests.every((c) => st.taken.has(c.th.id));
      const allDoors = doorThings.every((d) => d.th.raw.kind === "open" || st.doors.has(d.th.id));
      const allGates = [...slabs, ...rubble, ...thickets].every((g) => st.doors.has(g.th.id) || !st.items.has(g.th.t === "slab" ? "dune_gauntlet" : g.th.t === "thicket" ? "ember_bow" : "spiral_boots"));
      done = allChests && allDoors && allGates;
      if (done) complete = { reach, st };
    }
    seenStates.set(k, done);
    return done;
  }

  const init: State = { keys: 0, items: new Set(), doors: new Set(), flags: new Set(["marshalDead", "rootknightDead", "cisternCleared", "wardenDead", "cloudmarshalDead", "stormfinchDead"]), taken: new Set() };
  const ok = dfs(init);
  stats.states = explored;
  if (!ok) errors.push("no key order completes the dungeons (every chest taken, every door opened)");
  for (const [k, v] of seenStates) if (!v) { const [d, t] = k.split("|"); if (d.split(",").filter(Boolean).length && !t.includes("ch_disc") && false) errors.push(`dead-end state ${k}`); }
  // any state from which completion is impossible (waste of a key)
  const wasted = [...seenStates.entries()].filter(([, v]) => !v).length;
  if (wasted > 0) errors.push(`${wasted} explored key state(s) cannot reach completion (possible key softlock)`);
  errors.push(...failReturn.slice(0, 4));

  /* ---- reporting reachability of every object ---- */
  const final = complete as { reach: Set<string>; st: State } | null;
  const reach = final ? final.reach : everReach;
  const bad = (what: string, area: string, th: Thing) => errors.push(`${what} ${th.id} in ${area} is unreachable`);
  for (const c of chests) { if (!touching(everReach, c.area, c.th)) bad("chest", c.area, c.th); }
  for (const n of npcs) { if (!touching(everReach, n.area, n.th)) bad("npc", n.area, n.th); }
  for (const s of signs) { if (!touching(everReach, s.area, s.th)) bad("sign", s.area, s.th); }
  for (const d of doorThings) { if (!touching(everReach, d.area, d.th)) bad("door", d.area, d.th); }
  for (const g of [...slabs, ...rubble, ...thickets]) { if (!touching(everReach, g.area, g.th, 1)) bad(g.th.t, g.area, g.th); }
  for (const c of crystals) { if (!crystalHit(everReach, c.area, c.th)) bad("crystal", c.area, c.th); }
  for (const b of bosses) {
    const a = areas.get(b.area)!;
    let r = false;
    for (let y = b.y - 6; y <= b.y + 6 && !r; y++) for (let x = b.x - 8; x <= b.x + 8; x++) if (reach.has(nid(a.id, x, y))) { r = true; break; }
    if (!r) errors.push(`boss ${b.kind} in ${b.area} unreachable`);
  }
  for (const a of areas.values()) for (const e of a.sim.enemies) {
    const cx = Math.floor(e.x / TS), cy = Math.floor((e.y - 4) / TS);
    if (!everReach.has(nid(a.id, cx, cy)) && !e.def.flying && !e.def.boss) {
      // enemies may sit in unreachable pockets but must not be embedded in walls
      if (isSolid(a.sim.tile(cx, cy))) errors.push(`enemy ${e.kind} in ${a.id} spawns inside a wall at (${cx},${cy})`);
    }
  }
  // the heart container spawns where the boss dies (pool-side); its pickup spot must be reachable
  const bossRoom = areas.get("cistern_r8")!;
  if (![...Array(5).keys()].some((i) => reach.has(nid(bossRoom.id, 11 + (i % 3), 10 + (i >> 1))))) errors.push("boss room floor unreachable");
  // every area reachable
  for (const a of areas.values()) {
    let any = false;
    for (const n of everReach) if (n.startsWith(a.id + "|")) { any = true; break; }
    if (!any) errors.push(`area ${a.id} is never entered`);
  }
  stats.chests = chests.length; stats.npcs = npcs.length; stats.signs = signs.length; stats.doors = doorThings.length; stats.crystals = crystals.length; stats.gates = slabs.length + rubble.length + thickets.length; stats.cells = everReach.size;
  lines.push(`audit: ${areas.size} areas, ${warps} warps, ${chests.length} chests, ${doorThings.length} door sides, ${npcs.length} npcs, ${signs.length} signs, ${bosses.length} bosses`);
  lines.push(`audit: ${slabs.length} slabs and ${rubble.length} rubble piles gate terrain`);
  lines.push(`audit: ${explored} key/door states explored, ${everReach.size} reachable cells`);
  lines.push(`audit: items obtainable: ${[...(final?.st.items ?? [])].map((i) => ITEMS[i]?.name ?? i).join(", ")}`);
  return { ok: errors.length === 0, lines, errors, stats };
}

if (process.argv[1]?.endsWith("audit.ts")) {
  const r = await runAudit();
  for (const l of r.lines) console.log(l);
  for (const e of r.errors) console.log("ERROR:", e);
  console.log(r.ok ? "audit OK" : "audit FAILED");
  process.exit(r.ok ? 0 : 1);
}
