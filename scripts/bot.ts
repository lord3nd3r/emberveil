/**
 * Headless bot: plays the whole Stage-1 slice through the real sim (movement, collision, combat, doors, keys,
 * dialogue, shop, quests, save) with no renderer. Deterministic (seeded RNG). Fails with a non-zero exit if it gets stuck.
 *   npm run bot
 */
import { Sim, dirAngle, type Enemy, type Thing } from "../src/sim/core";
import { nodeWorld } from "../src/sim/node";
import { NO_INPUT, type Input } from "../src/sim/types";
import { TS } from "../src/tiles";
import { CH, CW, isSolid } from "../src/tiles";

export interface BotResult { ok: boolean; log: string[]; ticks: number; deaths: number; seconds: number; error?: string; save?: import("../src/sim/types").SaveV2 }

export async function runBot(verbose = false): Promise<BotResult> {
  const world = nodeWorld();
  await world.init();
  for (let y = 0; y < world.meta.rows; y++) for (let x = 0; x < world.meta.cols; x++) await world.loadChunk(x, y);
  const sim = new Sim(world);
  const log: string[] = [];
  const note = (s: string) => { log.push(`[${(ticks / 60).toFixed(0).padStart(4)}s] ${s}`); if (verbose) console.log(log[log.length - 1]); };
  let ticks = 0;
  let deaths = 0;
  let wasDead = false;
  const MAX = 60 * 60 * 40;

  await sim.enterArea("ren_house", 8.5, 6.5, "down");
  const events: string[] = [];

  async function tick(inp: Partial<Input> = {}): Promise<void> {
    const i: Input = { ...NO_INPUT, ...inp };
    sim.step(1 / 60, i);
    ticks++;
    await sim.settle();
    for (const e of sim.events) if (e.t === "toast") events.push(e.text);
    sim.events.length = 0;
    if (sim.mode === "dead" && !wasDead) { deaths++; wasDead = true; note(`died in ${sim.area.id}`); }
    if (sim.mode !== "dead") wasDead = false;
    if (ticks > MAX) throw new Error("tick budget exhausted");
  }
  const until = async (cond: () => boolean, max: number, what: string, inp: Partial<Input> = {}) => {
    for (let i = 0; i < max; i++) { if (cond()) return; await tick(inp); }
    throw new Error(`timeout waiting for ${what} (area ${sim.area.id}, mode ${sim.mode}, pos ${(sim.p.x / TS).toFixed(1)},${(sim.p.y / TS).toFixed(1)})`);
  };

  const cellOf = () => [Math.floor(sim.p.x / TS), Math.floor((sim.p.y - 3) / TS)] as [number, number];
  function plan(goal: (x: number, y: number) => boolean, avoid: (x: number, y: number) => boolean = () => false): [number, number][] | null {
    const [sx, sy] = cellOf();
    const W = sim.area.w, H = sim.area.h;
    const prev = new Map<number, number>();
    const id = (x: number, y: number) => y * W + x;
    const q: [number, number][] = [[sx, sy]];
    prev.set(id(sx, sy), -1);
    const cache = new Map<number, boolean>();
    const npcList = sim.things.filter((t) => t.t === "npc" && !sim.npcHidden(t.id));
    const npcBlock = (x: number, y: number) => npcList.some((t) => Math.abs(x * TS + 8 - t.x) < 13 && Math.abs(y * TS + 8 - t.y) < 12);
    const ok = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= W || y >= H) return false;
      const k = id(x, y);
      let v = cache.get(k);
      if (v === undefined) { v = sim.standable(x, y) && !avoid(x, y) && (goal(x, y) || !npcBlock(x, y)); cache.set(k, v); }
      return v;
    };
    for (let h = 0; h < q.length; h++) {
      const [x, y] = q[h];
      if (goal(x, y)) {
        const out: [number, number][] = [];
        let c = id(x, y);
        while (c !== -1) { out.push([c % W, Math.floor(c / W)]); c = prev.get(c)!; }
        return out.reverse();
      }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (!ok(nx, ny) || prev.has(id(nx, ny))) continue;
        prev.set(id(nx, ny), id(x, y));
        q.push([nx, ny]);
      }
    }
    return null;
  }

  const awake = (e: Enemy) => e.alive && e.dying <= 0;
  let atkCool = 0;
  /** Combat reflexes while walking: swing at anything close, drink a tonic when low. */
  function reflex(): Partial<Input> | null {
    if (atkCool > 0) atkCool--;
    if (sim.hp <= 2 && (sim.save.inv.tonic ?? 0) > 0) sim.useTonic();
    if (sim.p.state === "item" || sim.mode !== "play") return null;
    let best: Enemy | null = null, bd = 28;
    for (const e of sim.enemies) { if (!awake(e) || e.kind === "sluicejaw") continue; const d = Math.hypot(e.x - sim.p.x, e.y - 5 - sim.p.y); if (d < bd) { bd = d; best = e; } }
    if (best && atkCool === 0 && ["idle", "walk"].includes(sim.p.state) && best.st !== "submerged") {
      atkCool = 22;
      return { attack: true, aim: Math.atan2(best.y - 6 - (sim.p.y - 7), best.x - sim.p.x) };
    }
    return null;
  }

  async function follow(path: [number, number][], stopWhen?: () => boolean): Promise<void> {
    let stuck = 0, lastD = 1e9;
    for (let i = 1; i < path.length; i++) {
      const [cx, cy] = path[i];
      const tx = cx * TS + 8, ty = cy * TS + 10;
      for (let n = 0; n < 400; n++) {
        if (stopWhen?.()) return;
        if (sim.mode === "dialog") { await tick({ interact: true }); continue; }
        if (sim.mode === "dead" || sim.mode === "transition") { await tick(); if (sim.mode === "play") return; continue; }
        const dx = tx - sim.p.x, dy = ty - sim.p.y;
        const d = Math.hypot(dx, dy);
        if (d < 2.2) break;
        const r = reflex();
        const mv = { mx: dx / d, my: dy / d };
        await tick(r ? { ...mv, ...r } : mv);
        if (sim.p.state === "hop" || sim.p.state === "fall") return; // path invalidated; caller replans
        if (d >= lastD - 0.01) stuck++; else stuck = 0;
        lastD = d;
        if (stuck > 40 && sim.area.id === "world") { stuck = 0; return; } // blocked by something that was not loaded when the path was planned: replan
        if (stuck > 90) throw new Error(`stuck at ${(sim.p.x / TS).toFixed(1)},${(sim.p.y / TS).toFixed(1)} in ${sim.area.id} heading to cell ${cx},${cy}`);
      }
      lastD = 1e9;
    }
  }

  async function walkCells(goal: (x: number, y: number) => boolean, what: string, avoid?: (x: number, y: number) => boolean): Promise<void> {
    for (let tries = 0; tries < 24; tries++) {
      const area = sim.area.id;
      const path = plan(goal, avoid);
      if (!path) throw new Error(`no path to ${what} from ${cellOf()} in ${area}`);
      await follow(path, () => sim.area.id !== area);
      if (sim.area.id !== area) return;
      const [x, y] = cellOf();
      if (goal(x, y)) return;
    }
    throw new Error(`could not reach ${what} (at ${(sim.p.x / TS).toFixed(1)},${(sim.p.y / TS).toFixed(1)} in ${sim.area.id})`);
  }

  const thingById = (id: string, t?: string): Thing => {
    const th = sim.things.find((x) => x.id === id && (!t || x.t === t));
    if (!th) throw new Error(`thing ${id} not in ${sim.area.id}`);
    return th;
  };
  const adjacent = (th: Thing) => (x: number, y: number) => {
    const cx = x * TS + 8, cy = y * TS + 8;
    return Math.abs(cx - th.x) < th.w / 2 + 14 && Math.abs(cy - th.y) < th.h / 2 + 14 && Math.abs(cx - th.x) + Math.abs(cy - th.y) < th.w / 2 + th.h / 2 + 12;
  };
  async function faceAndInteract(th: Thing): Promise<void> {
    for (let i = 0; i < 60; i++) {
      const dx = th.x - sim.p.x, dy = th.y - (sim.p.y - 6);
      const mv = Math.abs(dx) > Math.abs(dy) ? { mx: Math.sign(dx) * 0.2, my: 0 } : { mx: 0, my: Math.sign(dy) * 0.2 };
      await tick(mv); // turn toward it (blocked, so we barely move)
      if (sim.nearestInteractable() === th) break;
    }
    await tick({ interact: true });
  }
  async function dismiss(): Promise<void> {
    for (let i = 0; i < 400 && (sim.mode === "dialog" || sim.p.state === "item"); i++) await tick(sim.mode === "dialog" ? { interact: true } : {});
  }
  async function talkTo(id: string): Promise<void> {
    const th = thingById(id);
    await walkCells(adjacent(th), `npc ${id}`);
    await faceAndInteract(th);
    await dismiss();
    if (sim.mode === "shop") { /* caller handles */ }
  }
  async function openChest(id: string): Promise<void> {
    const th = thingById(id, "chest");
    await walkCells(adjacent(th), `chest ${id}`);
    await faceAndInteract(th);
    await until(() => sim.chestOpened(th), 120, `chest ${id} to open`);
    await dismiss();
    note(`opened ${id}`);
  }
  async function through(id: string): Promise<void> {
    const th = sim.things.find((x) => x.id === id && (x.t === "warp" || x.t === "door"));
    if (!th) throw new Error(`no warp/door ${id} in ${sim.area.id}`);
    const area = sim.area.id;
    const inside = (x: number, y: number) => { const fx = x * TS + 8, fy = y * TS + 7; return fx > th.x - th.w / 2 && fx < th.x + th.w / 2 && fy > th.y - th.h / 2 && fy < th.y + th.h / 2; };
    if (th.t === "door" && !sim.doorOpen(th)) {
      // walk next to it and push until it opens
      await walkCells(adjacent(th), `door ${id}`);
      for (let i = 0; i < 200 && !sim.doorOpen(th); i++) {
        const dx = th.x - sim.p.x, dy = th.y - sim.p.y;
        await tick(Math.abs(dx) > Math.abs(dy) ? { mx: Math.sign(dx), my: 0 } : { mx: 0, my: Math.sign(dy) });
      }
      if (!sim.doorOpen(th)) throw new Error(`door ${id} did not open (keys=${sim.save.keys}, at ${(sim.p.x / TS).toFixed(1)},${(sim.p.y / TS).toFixed(1)}, door ${th.x},${th.y})`);
    }
    await walkCells(inside, `warp ${id}`);
    await until(() => sim.area.id !== area && sim.mode === "play", 300, `transition via ${id}`, {});
    await dismiss();
    note(`-> ${sim.area.id}`);
  }
  async function clearRoom(): Promise<void> {
    for (let guard = 0; guard < 6000; guard++) {
      const foes = sim.enemies.filter(awake);
      if (!foes.length) return;
      if (sim.mode === "dead" || sim.mode === "transition") { await tick(); continue; }
      if (sim.mode === "dialog") { await tick({ interact: true }); continue; }
      if (sim.p.state === "item") { await tick(); continue; }
      const boss = foes.find((e) => e.kind === "sluicejaw");
      const marshal = foes.find((e) => e.kind === "marshal");
      if (sim.hp <= 3 && (sim.save.inv.tonic ?? 0) > 0) sim.useTonic();
      if (boss) { await bossStep(boss); continue; }
      const gboss = foes.find((e) => e.def.boss && e.kind !== "marshal" && e.kind !== "sluicejaw");
      if (gboss) { await genericBoss(gboss); continue; }
      let tgt = foes[0], bd = 1e9;
      for (const e of foes) { const d = Math.hypot(e.x - sim.p.x, e.y - sim.p.y); if (d < bd) { bd = d; tgt = e; } }
      if (marshal && ["whirl", "tellcharge", "charge", "windup"].includes(marshal.st)) {
        // back off while the chain swings
        const a = Math.atan2(sim.p.y - marshal.y, sim.p.x - marshal.x);
        let mx = Math.cos(a), my = Math.sin(a);
        const px = sim.p.x + mx * 8, py = sim.p.y + my * 8;
        if (sim.blocked(px - 5, py - 6, px + 5, py, true, null, true)) { mx = -my; my = Math.cos(a); }
        await tick({ mx, my, dodge: marshal.st === "charge" && bd < 40 });
        continue;
      }
      const aim = Math.atan2(tgt.y - 6 - (sim.p.y - 7), tgt.x - sim.p.x);
      if (bd < 22 + tgt.def.r && atkCool === 0 && ["idle", "walk"].includes(sim.p.state)) {
        atkCool = 20;
        await tick({ attack: true, aim });
        continue;
      }
      if (atkCool > 0) atkCool--;
      // approach by path to a cell near the target (air units: straight line is fine)
      const gx = Math.floor(tgt.x / TS), gy = Math.floor((tgt.y - 4) / TS);
      const path = plan((x, y) => Math.abs(x - gx) + Math.abs(y - gy) <= 1);
      if (path && path.length > 1) {
        const [cx, cy] = path[1];
        const dx = cx * TS + 8 - sim.p.x, dy = cy * TS + 10 - sim.p.y;
        const d = Math.hypot(dx, dy) || 1;
        await tick({ mx: dx / d, my: dy / d, aim });
      } else await tick({ mx: Math.sign(tgt.x - sim.p.x) * 0.5, my: Math.sign(tgt.y - sim.p.y) * 0.5 });
    }
    throw new Error(`could not clear room ${sim.area.id}`);
  }
  async function bossStep(boss: Enemy): Promise<void> {
    const a = Math.atan2(boss.y - 6 - (sim.p.y - 7), boss.x - sim.p.x);
    const d = Math.hypot(boss.x - sim.p.x, boss.y - sim.p.y);
    if (boss.st === "stunned") {
      if (d < 26 + 10 && atkCool === 0 && ["idle", "walk"].includes(sim.p.state)) { atkCool = 18; await tick({ attack: true, aim: a }); return; }
      if (atkCool > 0) atkCool--;
      await tick({ mx: Math.cos(a), my: Math.sin(a), aim: a });
      return;
    }
    if (["tell", "lunge", "spit", "retreat"].includes(boss.st)) {
      if (!sim.discOut && sim.save.magic >= 4 && d < 90 && d > 14) { await tick({ item: true, aim: a }); return; }
      if (boss.st === "spit") { await tick({ shield: true, mx: 0, my: 0 }); sim.p.facing = Math.abs(Math.cos(a)) > Math.abs(Math.sin(a)) ? (Math.cos(a) > 0 ? "right" : "left") : Math.sin(a) > 0 ? "down" : "up"; return; }
      if (boss.st === "lunge" && d < 60) { await tick({ mx: -Math.cos(a), my: -Math.sin(a), dodge: true }); return; }
    }
    // keep a safe distance at the south edge while it is submerged
    const homeX = 12 * TS, homeY = 12.2 * TS;
    const dx = homeX - sim.p.x, dy = homeY - sim.p.y;
    if (Math.hypot(dx, dy) > 12) { await tick({ mx: dx / 40, my: dy / 40 }); return; }
    await tick({ shield: boss.st !== "submerged" });
  }

  let bowTick = 0;
  async function genericBoss(b: Enemy): Promise<void> {
    const p = sim.p;
    const a = Math.atan2(b.y - 6 - (p.y - 7), b.x - p.x);
    const d = Math.hypot(b.x - p.x, b.y - p.y);
    if (bowTick > 0) bowTick--;
    if (b.kind === "stormfinch" && b.st !== "grounded") {
      if (b.st === "dive" || b.st === "tell") { await tick({ mx: -Math.sin(a), my: Math.cos(a), dodge: d < 40 }); return; }
      if (b.st === "volley") { await tick({ shield: true, aim: a }); return; }
      if (d < 50) { await tick({ mx: -Math.cos(a), my: -Math.sin(a) }); return; }
      if (sim.hasItem("ember_bow") && sim.save.magic >= 1 && bowTick === 0 && sim.p.state !== "item") { sim.save.equipped = "ember_bow"; bowTick = 22; await tick({ item: true, aim: a }); return; }
      await tick({ mx: 0, my: 0, aim: a });
      return;
    }
    if (b.st === "idle" && d < 52) { await tick({ mx: -Math.cos(a), my: -Math.sin(a), shield: false, aim: a }); return; }
    if (b.st === "idle") { await tick({ shield: true, aim: a, mx: 0, my: 0 }); sim.p.facing = Math.abs(Math.cos(a)) > Math.abs(Math.sin(a)) ? (Math.cos(a) > 0 ? "right" : "left") : Math.sin(a) > 0 ? "down" : "up"; return; }
    const tellish = b.st.includes("tell") || ["whirl", "rush", "charge", "blink", "burst", "volley"].includes(b.st);
    if (tellish && d < 64) { await tick({ mx: -Math.cos(a), my: -Math.sin(a), dodge: d < 28 && b.st.includes("tell") }); return; }
    if (d < 22 + b.def.r && atkCool === 0 && ["idle", "walk"].includes(p.state)) { atkCool = 18; await tick({ attack: true, aim: a }); return; }
    if (atkCool > 0) atkCool--;
    await tick({ mx: Math.cos(a), my: Math.sin(a), aim: a });
  }
  const EDGES: [string, string, string][] = [["cistern_r1", "cistern_r2", "d_r1r2"], ["cistern_r1", "cistern_r3", "d_r1r3"], ["cistern_r3", "cistern_r4", "d_r3r4"], ["cistern_r2", "cistern_r4", "d_r2r4"], ["cistern_r2", "cistern_r5", "L_r2r5"], ["cistern_r4", "cistern_r7", "L_r4r7"], ["cistern_r4", "cistern_r6", "S_r4r6"], ["cistern_r6", "cistern_r8", "B_r6r8"]];
  /** Walk (through already-open doors) to a cistern room from wherever the bot is, e.g. after a respawn. */
  async function ensureIn(target: string): Promise<void> {
    for (let guard = 0; guard < 12 && sim.area.id !== target; guard++) {
      const here = sim.area.id;
      if (here === "world") {
        await walkCells((x, y) => Math.abs(x - 80) + Math.abs(y - 17) <= 2, "cistern grate");
        await through("w_cistern");
        continue;
      }
      // BFS over rooms
      const prev = new Map<string, [string, string]>();
      const q = [here];
      prev.set(here, ["", ""]);
      for (let h = 0; h < q.length; h++) for (const [a, b, id] of EDGES) for (const [f, t] of [[a, b], [b, a]]) if (f === q[h] && !prev.has(t)) { prev.set(t, [f, id]); q.push(t); }
      let cur = target;
      let first = "";
      while (prev.get(cur)![0] !== here && prev.get(cur)![0] !== "") cur = prev.get(cur)![0];
      first = prev.get(cur)![1];
      await through(first);
    }
  }
  async function fightIn(room: string): Promise<void> {
    for (let attempt = 0; attempt < 8; attempt++) {
      await ensureIn(room);
      await clearRoom();
      if (sim.area.id === room && !sim.enemies.some(awake)) return;
      note(`retrying ${room} (attempt ${attempt + 1})`);
    }
    throw new Error(`could not win ${room}`);
  }


  /* ---------------------------------------------------------------- Stage 3: generic dungeon crawler (Mossgate, Skyreach, the Keep) and side quests */
  async function goNear(x: number, y: number, r = 3): Promise<void> {
    await walkCells((cx, cy) => Math.abs(cx - x) + Math.abs(cy - y) <= r, `near ${x},${y}`);
  }
  async function grabHeart(): Promise<void> {
    const before = sim.save.hearts;
    for (let i = 0; i < 900 && sim.save.hearts === before; i++) {
      const hc = sim.pickups.find((q) => q.val >= 99);
      if (!hc) { await tick(sim.mode === "dialog" ? { interact: true } : {}); continue; }
      await walkCells((x, y) => Math.abs(x * TS + 8 - hc.x) < 14 && Math.abs(y * TS + 8 - hc.y) < 14, "heart container");
      await tick({ mx: Math.sign(hc.x - sim.p.x), my: Math.sign(hc.y - sim.p.y) });
    }
    await dismiss();
  }
  const lineClear = (x0: number, y0: number, x1: number, y1: number): boolean => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 1; i < n; i++) { const x = x0 + Math.round(((x1 - x0) * i) / n), y = y0 + Math.round(((y1 - y0) * i) / n); if (isSolid(sim.tile(x, y))) return false; }
    return true;
  };
  /** Walk to a cell in line with a target and loose shots until `done()`. */
  async function shootAt(tx: number, ty: number, done: () => boolean, what: string): Promise<void> {
    const item = sim.hasItem("ember_bow") ? "ember_bow" : "gale_disc";
    if (!sim.hasItem(item)) throw new Error(`no ranged item for ${what}`);
    sim.save.equipped = item;
    const cx = Math.floor(tx / TS), cy = Math.floor(ty / TS);
    const ok = (x: number, y: number) => (x === cx || y === cy) && Math.abs(x - cx) + Math.abs(y - cy) >= 2 && Math.abs(x - cx) + Math.abs(y - cy) <= (item === "ember_bow" ? 8 : 5) && lineClear(x, y, cx, cy);
    await walkCells(ok, `a firing line to ${what}`);
    for (let i = 0; i < 40 * 60 && !done(); i++) {
      const aimA = Math.atan2(ty - (sim.p.y - 7), tx - sim.p.x);
      if (sim.save.magic < 5 || sim.p.state === "item" || sim.mode !== "play") { await tick(sim.mode === "dialog" ? { interact: true } : {}); continue; }
      await tick({ item: true, aim: aimA });
      for (let k = 0; k < 14; k++) await tick({});
    }
    if (!done()) throw new Error(`could not hit ${what} (mode ${sim.mode}, state ${sim.p.state}, magic ${sim.save.magic.toFixed(0)}, at ${(sim.p.x / TS).toFixed(1)},${(sim.p.y / TS).toFixed(1)}, hp ${sim.hp}, equipped ${sim.save.equipped}, foes ${sim.enemies.filter(awake).length})`);
  }
  async function lootRoom(): Promise<void> {
    for (const th of sim.things.filter((x) => x.t === "chest")) {
      if (sim.chestOpened(th)) continue;
      const rv = th.raw.reveal as string | undefined;
      if (rv && !sim.hasFlag(rv)) continue;
      if (th.raw.big && !sim.hasItem((th.raw.key as string) ?? "big_key")) continue;
      await openChest(th.id);
    }
    if (sim.hasItem("dune_gauntlet")) for (const th of sim.things.filter((x) => x.t === "slab" && !x.cut)) {
      await walkCells(adjacent(th), `slab ${th.id}`);
      for (let i = 0; i < 3 && !th.cut; i++) { await faceAndInteract(th); await dismiss(); for (let k = 0; k < 30; k++) await tick({}); }
    }
    if (sim.hasItem("ember_bow")) for (const th of sim.things.filter((x) => x.t === "thicket" && !x.cut)) await shootAt(th.x, th.y, () => th.cut === true, `thicket ${th.id}`);
    for (const th of sim.things.filter((x) => x.t === "crystal")) {
      const door = th.raw.opens as string;
      if (door && sim.save.doors.includes(door)) continue;
      if (!sim.hasItem("ember_bow") && !sim.hasItem("gale_disc")) continue;
      await shootAt(th.x, th.y, () => sim.save.doors.includes(door), `crystal ${th.id}`);
    }
  }
  interface Edge { id: string; to: string; kind: string; key: string; need: string; slabs: string[] }
  const edges = new Map<string, Edge[]>();
  const seenRooms = new Set<string>();
  const exitsHere = (): Thing[] => sim.things.filter((t) => (t.t === "door" || t.t === "warp") && t.raw.to && t.raw.to !== "world" && !((t.raw.reveal as string | undefined) && !sim.hasFlag(t.raw.reveal as string)));
  const edgeOk = (e: Edge): boolean => {
    if (e.slabs.some((id) => !sim.save.doors.includes(id))) return false;
    if (e.kind === "warp") return !e.need || e.need.split(",").every((f) => sim.hasFlag(f));
    if (sim.save.doors.includes(e.id) || e.kind === "open") return true;
    if (e.kind === "small") return sim.save.keys > 0;
    if (e.kind === "big") return sim.hasItem(e.key || "big_key");
    return false;
  };
  async function goToRoom(target: string): Promise<boolean> {
    for (let guard = 0; guard < 30 && sim.area.id !== target; guard++) {
      const here = sim.area.id;
      const prev = new Map<string, [string, string]>([[here, ["", ""]]]);
      const q = [here];
      for (let h = 0; h < q.length; h++) for (const e of edges.get(q[h]) ?? []) if (!prev.has(e.to) && (edgeOk(e) || sim.save.doors.includes(e.id))) { prev.set(e.to, [q[h], e.id]); q.push(e.to); }
      if (!prev.has(target)) return false;
      let cur = target;
      while (prev.get(cur)![0] !== here) cur = prev.get(cur)![0];
      let tries = 0;
      for (;;) {
        try { await through(prev.get(cur)![1]); break; }
        catch (err) { if (++tries > 3) throw err; note(`retry hop ${prev.get(cur)![1]}: ${(err as Error).message}`); if (sim.area.id === here) await clearRoom(); for (let k = 0; k < 90; k++) await tick({}); }
      }
    }
    return sim.area.id === target;
  }
  async function crawl(label: string, enter: () => Promise<void>, stop: () => boolean): Promise<void> {
    const fightRoom = async (room: string): Promise<void> => {
      for (let attempt = 0; attempt < 10; attempt++) {
        if (sim.area.id !== room) { if (sim.area.id === "world") await enter(); if (sim.area.id !== room && !(await goToRoom(room))) return; }
        await clearRoom();
        if (sim.area.id === room && !sim.enemies.some(awake)) return;
        note(`retrying ${room} (attempt ${attempt + 1})`);
      }
      throw new Error(`could not win ${room}`);
    };
    const sigAt = new Map<string, string>();
    const sig = () => `${sim.save.keys}|${sim.save.items.length}|${sim.save.doors.length}|${sim.save.flags.length}`;
    await enter();
    for (let iter = 0; iter < 120 && !stop(); iter++) {
      if (!seenRooms.has(sim.area.id) && sim.area.kind !== "world") {
        // first visit (or a re-visit after something changed)
      }
      if (sim.area.id === "world") { await enter(); continue; }
      const here = sim.area.id;
      if (sigAt.get(here) !== sig()) {
        seenRooms.add(here);
        await fightRoom(here);
        await lootRoom();
        if (stop()) return;
        edges.set(here, exitsHere().map((t) => ({ id: t.id, to: t.raw.to as string, kind: t.t === "warp" ? "warp" : (t.raw.kind as string), key: (t.raw.key as string) ?? "", need: (t.raw.needFlag as string) ?? "", slabs: sim.things.filter((x) => (x.t === "slab" || x.t === "thicket") && Math.hypot(x.x - t.x, x.y - t.y) < 40).map((x) => x.id) })));
        sigAt.set(here, sig());
        note(`${label}: handled ${here} keys=${sim.save.keys} hp=${sim.hp}/${sim.maxHp}`);
      }
      // choose the next place: an unvisited room first, then any room whose state changed since we left it
      let dest: string | null = null, via: Edge | null = null;
      const prev = new Map<string, string>([[here, ""]]);
      const q = [here];
      outer: for (let h = 0; h < q.length; h++) {
        for (const e of edges.get(q[h]) ?? []) {
          if (!edgeOk(e)) continue;
          if (!seenRooms.has(e.to)) { dest = q[h]; via = e; break outer; }
          if (!prev.has(e.to)) { prev.set(e.to, q[h]); q.push(e.to); }
        }
      }
      if (!dest) for (const r of q) if (sigAt.get(r) !== sig()) { dest = r; break; }
      if (!dest) throw new Error(`${label}: nothing left to do but the goal is not done (rooms ${[...seenRooms].join(",")})`);
      if (dest !== here) { if (!(await goToRoom(dest))) throw new Error(`${label}: cannot get back to ${dest}`); }
      if (via) { await through(via.id); }
      else if (dest === here) { sigAt.delete(here); }
    }
    if (!stop()) throw new Error(`${label}: gave up`);
  }

  const dungeonEntry = (x: number, y: number, warp: string) => async () => { await goNear(x, y, 2); await through(warp); };
  async function spireRun(): Promise<void> {
    await crawl("spire", dungeonEntry(205, 10, "w_spire"), () => sim.hasFlag("stormfinchDead"));
    await grabHeart();
    check(sim.hasFlag("stormfinchDead") && sim.hasItem("ember_bow"), "Stormfinch Mol defeated with the Ember Bow");
    note(`Spire done: hearts=${sim.save.hearts} level=${sim.level} deaths=${deaths} kit=${sim.allyLevelOf("kit")}`);
    await through("w_spire_exit2");
    check(sim.allyIds().includes("kit"), "ally survived the route");
    await keepRun();
  }
  async function keepRun(): Promise<void> {
    /* the Keep: all three lamps burn, so the doors are open */
    await crawl("keep", dungeonEntry(144, 98, "w_keep"), () => sim.hasFlag("vaelDead"));
    for (let i = 0; i < 600 && sim.mode !== "ending"; i++) await tick({});
    check(sim.mode === "ending", "the ending plays after Vael falls");
    sim.endEnding();
    check(sim.mode === "play" && sim.quest("crown") === 3, "credits dismissed, crown quest complete");
    note(`Keep done: level=${sim.level} deaths=${deaths} kit=${sim.allyLevelOf("kit")}`);
  }
  const check = (cond: boolean, msg: string) => { if (!cond) throw new Error(`check failed: ${msg}`); };

  try {
    if (process.env.BOT_FAST === "keep") {
      await through("w_ren_out");
      sim.save.items.push("keeper_blade", "wicker_buckler", "gale_disc", "spiral_boots", "dune_gauntlet", "ember_bow"); sim.save.equipped = "ember_bow";
      for (const f of ["cisternCleared", "wardenDead", "marshalDead", "bossDead", "stormfinchDead"]) sim.setFlag(f);
      sim.save.hearts = 6; sim.save.xp = 450; sim.hp = sim.maxHp; sim.save.inv.tonic = 6; sim.recruitAlly("kit"); sim.recruitAlly("dorn");
      await sim.enterArea("world", 150, 100, "up"); await sim.settle(); sim.mode = "play";
      await keepRun();
      return { ok: true, log, ticks, deaths, seconds: ticks / 60 };
    }
    if (process.env.BOT_FAST === "spire") {
      // developer shortcut: start at the Spire door with the earlier progress granted
      await through("w_ren_out");
      sim.save.items.push("keeper_blade", "wicker_buckler", "gale_disc", "spiral_boots", "dune_gauntlet"); sim.save.equipped = "gale_disc";
      for (const f of ["cisternCleared", "wardenDead", "marshalDead", "bossDead"]) sim.setFlag(f);
      sim.save.hearts = 5; sim.save.xp = 400; sim.hp = sim.maxHp; sim.save.inv.tonic = 6; sim.recruitAlly("kit");
      await sim.enterArea("world", 205.5, 12, "up"); await sim.settle(); sim.mode = "play";
      await spireRun();
      return { ok: true, log, ticks, deaths, seconds: ticks / 60 };
    }
    /* 1. cottage: blade */
    await openChest("ch_blade");
    check(sim.hasItem("keeper_blade"), "got blade");
    await through("w_ren_out");
    check(sim.area.id === "world", "outside");
    /* 2. Isolde */
    await talkTo("isolde");
    check(sim.hasFlag("metIsolde") && sim.hasItem("wicker_buckler"), "isolde gives buckler");
    /* 3. shop */
    sim.addGlints(40);
    await through("w_shop");
    await talkTo("tamsin");
    check(sim.mode === "shop", "shop opened");
    check(sim.shopBuy("shop_tonic"), "bought a tonic");
    sim.closeShop();
    check((sim.save.inv.tonic ?? 0) === 1, "tonic held");
    await through("w_shop_out");
    /* 4. side quest: hen */
    await walkCells((x, y) => Math.abs(x - 36) + Math.abs(y - 58) <= 1, "orchard house");
    await through("w_granny");
    await talkTo("granny");
    check(sim.quest("hen") === 1, "hen quest accepted");
    await through("w_granny_out");
    await walkCells((x, y) => Math.abs(x - 57) + Math.abs(y - 65) <= 3, "the hen pen");
    await talkTo("pip");
    check(sim.hasFlag("henFound"), "found Pip");
    await walkCells((x, y) => Math.abs(x - 36) + Math.abs(y - 58) <= 1, "orchard house");
    await through("w_granny");
    await talkTo("granny");
    check(sim.quest("hen") === 3 && sim.save.pieces === 1, "hen quest rewarded a heart piece");
    await through("w_granny_out");
    /* 5. side quest: lantern (reedmarsh) */
    await openChest("ch_lantern");
    check(sim.hasItem("brass_lantern"), "brass lantern");
    // accept at Oswin first? The quest advances when found; Oswin accepts then completes.
    sim.setQuest("lantern", 1);
    await walkCells((x, y) => Math.abs(x - 105) + Math.abs(y - 40) <= 3, "the lake pier");
    await talkTo("oswin");
    check(sim.quest("lantern") === 3 && !sim.hasItem("brass_lantern"), "lantern quest done");
    note(`glints=${sim.save.glints}`);
    /* 6. Hermit's cave shortcut + chest */
    await walkCells((x, y) => Math.abs(x - 46) + Math.abs(y - 17) <= 1, "cave mouth");
    await through("w_cave_s");
    await talkTo("bram");
    await openChest("ch_hermit");
    await through("w_cave_out_n");
    /* 7. into the Cistern */
    await walkCells((x, y) => Math.abs(x - 80) + Math.abs(y - 17) <= 2, "cistern grate");
    await through("w_cistern");
    check(sim.area.id === "cistern_r1", "in the cistern");
    await clearRoom();
    await openChest("ch_map");
    await through("d_r1r3");
    await clearRoom();
    await openChest("ch_keyA");
    check(sim.save.keys === 1, "small key A");
    await through("d_r3r4");
    await clearRoom();
    await openChest("ch_keyB");
    check(sim.save.keys === 2, "small key B");
    await through("d_r2r4");
    await clearRoom();
    await openChest("ch_compass");
    await through("L_r2r5");
    check(sim.save.keys === 1, "key spent on R2->R5");
    check(sim.area.id === "cistern_r5", "in the reliquary");
    await fightIn("cistern_r5");
    check(sim.hasFlag("marshalDead"), "mini-boss defeated");
    await openChest("ch_bigkey");
    check(sim.hasItem("big_key"), "big key");
    await through("L_r2r5");
    await through("d_r2r4");
    await through("L_r4r7");
    check(sim.area.id === "cistern_r7" && sim.save.keys === 0, "in the disc hall");
    await clearRoom();
    await openChest("ch_disc");
    check(sim.hasItem("gale_disc") && sim.save.equipped === "gale_disc", "gale disc equipped");
    await through("L_r4r7");
    /* 8. the crystal across the pit */
    const cr = thingById("cr_r4", "crystal");
    await walkCells((x, y) => x === 17 && y === 8, "crystal throwing spot");
    for (let i = 0; i < 30; i++) await tick({});
    await until(() => sim.save.doors.includes("S_r4r6"), 200, "crystal struck", { item: true, aim: Math.atan2(cr.y - (sim.p.y - 7), cr.x - sim.p.x) });
    note("crystal struck with the Gale Disc");
    await through("S_r4r6");
    await fightIn("cistern_r6");
    await through("B_r6r8");
    check(sim.area.id === "cistern_r8", "boss arena");
    note("boss fight begins");
    await fightIn("cistern_r8");
    check(sim.hasFlag("bossDead"), "Sluicejaw defeated");
    // heart container
    for (let i = 0; i < 900 && !sim.hasFlag("heartContainer"); i++) {
      const hc = sim.pickups.find((p) => p.val >= 99);
      if (!hc) { await tick(sim.mode === "dialog" ? { interact: true } : {}); continue; }
      await walkCells((x, y) => Math.abs(x * TS + 8 - hc.x) < 14 && Math.abs(y * TS + 8 - hc.y) < 14, "heart container");
      await tick({ mx: Math.sign(hc.x - sim.p.x), my: Math.sign(hc.y - sim.p.y) });
    }
    check(sim.hasFlag("heartContainer"), "heart container collected");
    await dismiss();
    check(sim.save.hearts >= 4, "heart container added a heart");
    await until(() => true, 1, "noop");
    await through("w_c_exit2");
    check(sim.area.id === "world", "back in the world");
    await walkCells((x, y) => Math.abs(x - 49) + Math.abs(y - 40) <= 3, "the village square");
    await talkTo("isolde");
    check(sim.hasFlag("sliceDone") && sim.quest("cistern") === 4, "slice complete");
    if (process.env.BOT_STAGE3) { // optional long route (not part of npm run check): Kit, Mossgate, Spire, Keep
    /* 9. Stage 3: side quests, Mossgate, Skyreach Spire and the Keep */
    sim.save.inv.tonic = 6; // a few tonics (as if bought at the shops along the way)
    await goNear(49, 46, 2); await talkTo("kit");
    check(sim.quest("kitlamp") === 1, "Kit asks for his lamp");
    await goNear(101, 45, 3); await openChest("ch_kitlamp");
    await goNear(49, 46, 2); await talkTo("kit");
    check(sim.quest("kitlamp") === 3 && sim.allyIds().includes("kit"), "Kit joined as an ally");
    note("Kit joined");
    await crawl("mossgate", dungeonEntry(13, 37, "w_moss"), () => sim.hasFlag("wardenDead"));
    await grabHeart();
    check(sim.hasFlag("wardenDead") && sim.quest("wardstone") === 3, "Bark Warden defeated");
    note(`Mossgate done: hearts=${sim.save.hearts} level=${sim.level} deaths=${deaths}`);
    await through(sim.things.some((t) => t.id === "w_moss_exit2") ? "w_moss_exit2" : "w_moss_exit");
    await goNear(49, 43, 2); await talkTo("isolde");
    check(sim.quest("thirdlamp") === 1, "Isolde sends the hero to the Spire");
    await spireRun();
    }
    // save round trip
    const sv = sim.toSave();
    check(sv.xp > 0 && sim.level >= 2, `the run earned XP and levelled up (xp ${sv.xp}, level ${sim.level})`);
    check(sv.v === 2 && sv.chests.includes("ch_disc"), "save contains progress");
    note(`DONE hearts=${sv.hearts} deaths=${deaths} keys=${sv.keys} glints=${sv.glints}`);
    return { ok: true, log, ticks, deaths, seconds: ticks / 60, save: sim.toSave() };
  } catch (e) {
    note(`FAILED: ${(e as Error).message}`);
    return { ok: false, log, ticks, deaths, seconds: ticks / 60, error: (e as Error).message };
  }
}

void CW; void CH; void dirAngle;
if (process.argv[1]?.endsWith("bot.ts")) {
  const r = await runBot(true);
  console.log(r.ok ? `bot OK in ${r.seconds.toFixed(0)}s of game time (${r.deaths} deaths)` : `bot FAILED: ${r.error}`);
  process.exit(r.ok ? 0 : 1);
}
