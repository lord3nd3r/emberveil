/**
 * Emberveil simulation core. Phaser-free: the renderer reads this state every frame, and the headless audit and
 * bot drive it directly. Units: pixels (16 per tile). Positions are foot-centre points.
 */
import { CH, CW, FOG_CH, FOG_CW, FOG_H, FOG_HEX, FOG_W, TS, isLedge, isPit, isSlow, isSolid, T } from "../tiles";
import { ALLIES, ALLY_XP_CAP, allyDmg, allyLevel, dungeonOf, ENEMIES, SHOPS, EQUIPPABLE, GLINT_ITEM, ITEMS, SHOP, UNIQUE_ITEMS, XP_CAP, XP_QUEST, LEVEL_XP, MAX_LEVEL, atkMul, defReduce, hpBonusHalves, itemName, levelOf, xpGain, type EnemyDef } from "./data";
import { migrateSave } from "./migrate";
import { stepEnemy } from "./enemies";
import type { RawObj, Room, WorldData } from "./maps";
import { script, type Script } from "./npcs";
import type { Dir, Ev, Input, SaveV2 } from "./types";

export { FOG_W, FOG_H, FOG_CW, FOG_CH };
export const MAX_MAGIC = 32;
export const DISC_COST = 4;

export interface Player {
  x: number; y: number;
  facing: Dir;
  state: "idle" | "walk" | "swing" | "charge" | "spin" | "roll" | "hurt" | "hop" | "item" | "fall" | "dead" | "dash";
  t: number; chargeT: number;
  inv: number; rollCd: number; swingAngle: number;
  kx: number; ky: number;
  rollDx: number; rollDy: number;
  hopFrom: [number, number]; hopTo: [number, number];
  held: string; // item shown while in the "item" state
  shielding: boolean;
  safeX: number; safeY: number; safeT: number;
  hitSet: Set<number>;
  bobT: number;
  dashCd: number; dashDx: number; dashDy: number;
}

export interface Enemy {
  uid: number;
  kind: string;
  def: EnemyDef;
  x: number; y: number; hx: number; hy: number;
  hp: number; st: string; t: number; face: number;
  kx: number; ky: number; flash: number; stun: number; dying: number;
  a: number; b: number; c: number; // per-AI scratch
  vis: number;
  ck: string;
  alive: boolean;
}

export interface Proj { uid: number; kind: "bolt" | "bubble" | "disc" | "seed" | "arrow"; x: number; y: number; vx: number; vy: number; r: number; dmg: number; ttl: number; mine: boolean; phase: number; ox: number; oy: number; dist: number }
export interface Pickup { uid: number; kind: "glint" | "heart" | "magic"; x: number; y: number; val: number; ttl: number; t: number; z: number }

export interface Thing {
  uid: number;
  t: string; // bush sign chest crystal door warp shopitem npc
  id: string;
  x: number; y: number; // px centre
  w: number; h: number; // px size
  ck: string;
  raw: RawObj;
  cut?: boolean;
  label: string;
}

export interface Dialog { who: string; lines: string[]; i: number; after?: () => void }

export interface Area { kind: "world" | "room"; id: string; room?: Room; w: number; h: number }

export type Mode = "play" | "dialog" | "shop" | "transition" | "dead" | "ending";

interface Warp { to: string; tx: number; ty: number; dir: Dir; t: number; ready: boolean; done: boolean; swapped: boolean }

const DIRS: Record<Dir, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
export const dirAngle = (d: Dir): number => Math.atan2(DIRS[d][1], DIRS[d][0]);
export const angDiff = (a: number, b: number): number => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
export const dirOfVec = (x: number, y: number, fb: Dir): Dir => (Math.abs(x) < 0.001 && Math.abs(y) < 0.001 ? fb : Math.abs(x) > Math.abs(y) ? (x > 0 ? "right" : "left") : y > 0 ? "down" : "up");

export const PBOX = { hw: 5, h: 6 };

export class Sim {
  data: WorldData;
  save: SaveV2;
  area!: Area;
  p!: Player;
  enemies: Enemy[] = [];
  projs: Proj[] = [];
  pickups: Pickup[] = [];
  things: Thing[] = [];
  events: Ev[] = [];
  mode: Mode = "play";
  dialog: Dialog | null = null;
  shopOpen = false;
  fade = 0; // 0 clear .. 1 black
  time = 0;
  hp = 6;
  sealed = false;
  bossActive = "";
  loaded = new Set<string>(); // chunk keys with live entities
  fog = new Uint8Array(FOG_HEX / 2);
  private uid = 1;
  private rs = 12345;
  private warp: Warp | null = null;
  private loading = new Set<string>();
  private lockMsgT = 0;
  autosave = 0;
  onSave?: (s: SaveV2) => void;
  lastToast = "";
  dead = 0;
  discOut = false;
  name = "Ren";

  constructor(data: WorldData, save?: SaveV2) {
    this.data = data;
    this.save = (save && migrateSave(save) ? structuredClone(migrateSave(save)!) : Sim.newSave());
    this.save.allies ??= {};
    this.hp = Math.min(this.save.hp, this.maxHp);
    this.decodeFog();
  }

  static newSave(): SaveV2 {
    return {
      v: 2, xp: 0, area: "ren_house", x: 8.5, y: 6.5, facing: "down", hp: 6, hearts: 3, pieces: 0, magic: MAX_MAGIC, glints: 0,
      items: [], equipped: "", inv: {}, keys: 0, flags: [], quests: { cistern: 1 }, allies: {}, chests: [], doors: [], cleared: [], visited: ["ren_house"], fog: "0".repeat(FOG_HEX), playTime: 0,
    };
  }

  /* ---------------------------------------------------------------- utilities */
  rand(): number {
    this.rs = (Math.imul(this.rs, 1664525) + 1013904223) >>> 0;
    return this.rs / 4294967296;
  }
  emit(e: Ev): void { this.events.push(e); }
  sfx(name: import("./types").SfxName): void { this.events.push({ t: "sfx", name }); }
  toast(text: string): void { this.lastToast = text; this.events.push({ t: "toast", text }); }
  get maxHp(): number { return this.save.hearts * 2 + hpBonusHalves(this.level); }
  get level(): number { return levelOf(this.save.xp); }
  /** XP progress inside the current level: cur of need (need 0 at the cap). */
  xpProgress(): { cur: number; need: number } {
    const l = this.level;
    if (l >= MAX_LEVEL) return { cur: 0, need: 0 };
    return { cur: this.save.xp - LEVEL_XP[l - 1], need: LEVEL_XP[l] - LEVEL_XP[l - 1] };
  }
  /** Awards experience to the hero. Level-ups raise max life, sword damage and defence a little, heal two hearts, and emit the level-up effect. */
  addXp(n: number): void {
    if (n <= 0 || this.save.xp >= XP_CAP) return;
    const before = this.level, oldMax = this.maxHp;
    this.save.xp = Math.min(XP_CAP, this.save.xp + n);
    const after = this.level;
    if (after <= before) return;
    this.hp = Math.min(this.maxHp, this.hp + (this.maxHp - oldMax) + 4);
    const perks: string[] = [];
    if (hpBonusHalves(after) > hpBonusHalves(before)) perks.push("+1 heart");
    if (defReduce(after, 4) > defReduce(before, 4)) perks.push("tougher");
    this.toast(`Level ${after}!${perks.length ? " " + perks.join(", ") : " Sword +8%"}`);
    this.emitLevelUp("ren", this.p.x, this.p.y, after);
  }
  /** Level-up effect for any entity that levels (the hero today; allies and companions later). */
  emitLevelUp(who: string, x: number, y: number, lvl: number): void {
    this.sfx("levelup");
    this.emit({ t: "levelup", x, y, lvl, who });
  }
  /* ---------------------------------------------------------------- allies */
  allyRt: Record<string, { x: number; y: number; cd: number; face: Dir; moving: boolean }> = {};
  endingT = 0;
  allyIds(): string[] { return Object.keys(this.save.allies ?? {}).filter((id) => ALLIES[id]); }
  allyLevelOf(id: string): number { return allyLevel(this.save.allies?.[id] ?? 0); }
  recruitAlly(id: string): void {
    this.save.allies ??= {};
    if (!ALLIES[id] || id in this.save.allies) return;
    this.save.allies[id] = 0;
    this.sfx("quest"); this.toast(`${ALLIES[id].name} joins you!`);
    this.commit();
  }
  addAllyXp(id: string, n: number): void {
    const a = this.save.allies;
    if (!a || !(id in a) || n <= 0) return;
    const before = allyLevel(a[id]);
    a[id] = Math.min(ALLY_XP_CAP, a[id] + n);
    const after = allyLevel(a[id]);
    if (after > before) {
      const rt = this.allyRt[id];
      this.toast(`${ALLIES[id].name} reached level ${after}!`);
      this.emitLevelUp(id, rt?.x ?? this.p.x, rt?.y ?? this.p.y, after);
    }
  }
  private updateAllies(dt: number): void {
    const ids = this.allyIds();
    ids.forEach((id, i) => {
      const def = ALLIES[id];
      let rt = this.allyRt[id];
      if (!rt) rt = this.allyRt[id] = { x: this.p.x - 10 * (i + 1), y: this.p.y + 2, cd: 1, face: "down", moving: false };
      const tx = this.p.x + (i % 2 === 0 ? -14 : 14), ty = this.p.y + 4;
      const dx = tx - rt.x, dy = ty - rt.y, d = Math.hypot(dx, dy);
      rt.moving = false;
      if (d > 140) { rt.x = this.p.x; rt.y = this.p.y; }
      else if (d > 9) {
        const sp = Math.min(d * 5, 78) * dt, nx = rt.x + (dx / d) * sp, ny = rt.y + (dy / d) * sp;
        if (this.standable(Math.floor(nx / TS), Math.floor((ny - 3) / TS))) { rt.x = nx; rt.y = ny; rt.moving = true; }
        else if (this.standable(Math.floor(nx / TS), Math.floor((rt.y - 3) / TS))) { rt.x = nx; rt.moving = true; }
        else if (this.standable(Math.floor(rt.x / TS), Math.floor((ny - 3) / TS))) { rt.y = ny; rt.moving = true; }
        else if (d > 48) { rt.x = this.p.x; rt.y = this.p.y; }
        if (rt.moving) rt.face = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
      }
      rt.cd -= dt;
      if (rt.cd > 0) return;
      const lvl = allyLevel(this.save.allies![id]);
      let best: Enemy | null = null, bd = def.range;
      for (const e of this.enemies) {
        if (!e.alive || e.dying > 0 || e.st === "submerged") continue;
        const dd = Math.hypot(e.x - rt.x, e.y - 5 - rt.y);
        if (dd < bd && Math.hypot(e.x - this.p.x, e.y - this.p.y) < 170) { bd = dd; best = e; }
      }
      if (!best) { rt.cd = 0.25; return; }
      rt.cd = Math.max(0.7, def.cd - 0.12 * (lvl - 1));
      const ang = Math.atan2(best.y - 5 - rt.y, best.x - rt.x);
      const dmg = allyDmg(def, lvl) * (best.def.boss ? 0.6 : 1) / atkMul(this.level);
      this.allyHit = id;
      this.hitEnemy(best, dmg, ang, { kb: 40 });
      this.allyHit = "";
      this.emit({ t: "spark", x: rt.x, y: rt.y - 8, color: def.color, n: 5 });
      this.emit({ t: "spark", x: (rt.x + best.x) / 2, y: (rt.y + best.y) / 2 - 8, color: def.color, n: 3 });
    });
  }
  allyHit = "";
  /** Called by the scene when the credits are dismissed. */
  endEnding(): void { if (this.mode === "ending") { this.mode = "play"; this.emit({ t: "music", track: this.trackFor() }); this.toast("The Veil is mended. Explore Aurelane freely."); this.commit(); } }
  hasFlag(f: string): boolean { return this.save.flags.includes(f); }
  setFlag(f: string): void { if (!this.save.flags.includes(f)) this.save.flags.push(f); }
  hasItem(i: string): boolean { return this.save.items.includes(i); }
  quest(id: string): number { return this.save.quests[id] ?? 0; }
  setQuest(id: string, n: number): void {
    if (n > this.quest(id)) { this.save.quests[id] = n; this.sfx("quest"); this.toast(n >= 3 && id !== "cistern" ? "Quest complete!" : "Quest updated"); if (n >= 3 && id !== "cistern" && this.p) this.addXp(XP_QUEST); }
  }
  addGlints(n: number): void { this.save.glints = Math.min(999, this.save.glints + n); }
  take(i: string): void { this.save.items = this.save.items.filter((x) => x !== i); }
  rnd(a: number, b: number): number { return a + this.rand() * (b - a); }

  /* ---------------------------------------------------------------- area / tiles */
  tile(tx: number, ty: number): number {
    if (this.area.kind === "world") return this.data.worldTile(tx, ty);
    const r = this.area.room!;
    if (tx < 0 || ty < 0 || tx >= r.w || ty >= r.h) return T.VOID;
    return r.tiles[ty * r.w + tx];
  }
  tileAtPx(x: number, y: number): number { return this.tile(Math.floor(x / TS), Math.floor(y / TS)); }

  private chunkOf(px: number, py: number): [number, number] { return [Math.floor(px / (TS * CW)), Math.floor(py / (TS * CH))]; }

  /** Static solid rectangles from things (closed doors, chests, bushes, npcs, ...). */
  private solidRects(): { x0: number; y0: number; x1: number; y1: number; th: Thing }[] {
    const out: { x0: number; y0: number; x1: number; y1: number; th: Thing }[] = [];
    for (const th of this.things) {
      if (th.cut) continue;
      let w = 0, h = 0, oy = 0;
      switch (th.t) {
        case "bush": w = 12; h = 10; break;
        case "sign": w = 12; h = 8; break;
        case "chest": if (!this.chestVisible(th)) continue; w = th.w - 2; h = 10; break;
        case "crystal": w = 12; h = 10; break;
        case "slab": case "rubble": case "thicket": w = 14; h = 12; break;
        case "npc": if (this.npcHidden(th.id)) continue; w = 10; h = 6; break;
        case "door": if (this.doorOpen(th)) continue; out.push({ x0: th.x - th.w / 2, y0: th.y - th.h / 2, x1: th.x + th.w / 2, y1: th.y + th.h / 2, th }); continue;
        default: continue;
      }
      out.push({ x0: th.x - w / 2, y0: th.y + oy - h / 2 + 2, x1: th.x + w / 2, y1: th.y + oy + h / 2 + 2, th });
    }
    return out;
  }

  blocked(x0: number, y0: number, x1: number, y1: number, ground: boolean, ignore?: Thing | null, pitSolid = false): boolean {
    const tx0 = Math.floor(x0 / TS), tx1 = Math.floor((x1 - 0.001) / TS), ty0 = Math.floor(y0 / TS), ty1 = Math.floor((y1 - 0.001) / TS);
    for (let ty = ty0; ty <= ty1; ty++)
      for (let tx = tx0; tx <= tx1; tx++) {
        const id = this.tile(tx, ty);
        if (isSolid(id)) { if (!ground && (id === T.WATER || id === T.DUNWATER || id === T.LILY || id === T.SEA)) continue; return true; }
        if (pitSolid && ground && isPit(id)) return true;
      }
    if (ground) for (const r of this.solidRects()) if (r.th !== ignore && x1 > r.x0 && x0 < r.x1 && y1 > r.y0 && y0 < r.y1) return true;
    return false;
  }

  /** Moves a body of half-width hw and height h (foot-centred) with axis-separated collision. Returns true if it hit something. */
  moveBody(o: { x: number; y: number }, dx: number, dy: number, hw: number, h: number, ground = true, pitSolid = false): boolean {
    let hit = false;
    if (dx !== 0) {
      const nx = o.x + dx;
      if (!this.blocked(nx - hw, o.y - h, nx + hw, o.y, ground, null, pitSolid)) o.x = nx; else hit = true;
    }
    if (dy !== 0) {
      const ny = o.y + dy;
      if (!this.blocked(o.x - hw, ny - h, o.x + hw, ny, ground, null, pitSolid)) o.y = ny; else hit = true;
    }
    return hit;
  }

  chestVisible(th: Thing): boolean {
    const r = th.raw.reveal as string | undefined;
    return !r || this.hasFlag(r);
  }
  npcHidden(id: string): boolean { return (id === "pip" && this.hasFlag("henFound")) || (!!ALLIES[id] && id in (this.save.allies ?? {})); }
  doorOpen(th: Thing): boolean {
    if (this.sealed) return false;
    const kind = th.raw.kind as string;
    if (kind === "open") return true;
    return this.save.doors.includes(th.id);
  }

  /* ---------------------------------------------------------------- loading */
  async enterArea(id: string, tx: number, ty: number, dir: Dir): Promise<void> {
    this.enemies = []; this.projs = []; this.pickups = []; this.things = []; this.loaded.clear(); this.sealed = false; this.bossActive = ""; this.discOut = false;
    if (id === "world") {
      const [cx, cy] = [Math.floor(tx / CW), Math.floor(ty / CH)];
      this.area = { kind: "world", id, w: this.data.meta.cols * CW, h: this.data.meta.rows * CH };
      await this.loadWindow(cx, cy, true);
    } else {
      const room = await this.data.loadRoom(id);
      this.area = { kind: "room", id, room, w: room.w, h: room.h };
      this.spawnRoom(room);
    }
    if (!this.p) this.p = this.makePlayer(tx * TS, ty * TS, dir);
    this.p.x = tx * TS; this.p.y = ty * TS; this.p.facing = dir; this.p.state = "idle"; this.p.kx = this.p.ky = 0;
    this.p.safeX = this.p.x; this.p.safeY = this.p.y;
    const key = id === "world" ? "" : id;
    if (key && !this.save.visited.includes(key)) this.save.visited.push(key);
    const name = id === "world" ? this.chunkName(this.p.x, this.p.y) : this.area.room!.name;
    this.allyRt = {};
    this.emit({ t: "area", id, name, kind: this.area.kind });
    this.emit({ t: "music", track: this.trackFor() });
    this.save.area = id;
    this.revealFog();
  }

  private makePlayer(x: number, y: number, dir: Dir): Player {
    return { x, y, facing: dir, state: "idle", t: 0, chargeT: 0, inv: 0, rollCd: 0, swingAngle: 0, kx: 0, ky: 0, rollDx: 0, rollDy: 1, hopFrom: [x, y], hopTo: [x, y], held: "", shielding: false, safeX: x, safeY: y, safeT: 0, hitSet: new Set(), bobT: 0, dashCd: 0, dashDx: 0, dashDy: 1 };
  }

  chunkName(px: number, py: number): string {
    const [cx, cy] = this.chunkOf(px, py);
    return this.data.meta.names[`${cx},${cy}`] ?? "Aurelane";
  }

  trackFor(): string | null {
    if (this.bossActive === "barkwarden") return "bosswarden";
    if (this.bossActive === "stormfinch") return "bossstorm";
    if (this.bossActive === "vael") return "finalboss";
    if (this.bossActive === "sluicejaw") return "boss";
    if (this.bossActive === "marshal" || this.bossActive === "rootknight" || this.bossActive === "cloudmarshal") return "miniboss";
    if (this.area.kind === "room") return this.area.room!.music;
    const [cx, cy] = this.chunkOf(this.p?.x ?? 0, this.p?.y ?? 0);
    return this.data.chunks.get(`${cx},${cy}`)?.music ?? "meadow";
  }

  /** Make sure the 3x3 window around chunk (cx,cy) has live entities; unload the rest. */
  private async loadWindow(cx: number, cy: number, wait: boolean): Promise<void> {
    const want = new Set<string>();
    const jobs: Promise<unknown>[] = [];
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const x = cx + dx, y = cy + dy;
        if (!this.data.inRegion(x, y)) continue;
        const k = `${x},${y}`;
        want.add(k);
        if (!this.loaded.has(k) && !this.loading.has(k)) {
          this.loading.add(k);
          const p = this.data.loadChunk(x, y).then((c) => {
            this.loading.delete(k);
            if (c && this.area?.kind === "world" && !this.loaded.has(k)) { this.loaded.add(k); this.spawnChunk(k, c.objects); }
          });
          jobs.push(p);
        }
      }
    for (const k of [...this.loaded]) if (!want.has(k)) this.unloadChunk(k);
    if (wait) await Promise.all(jobs);
  }

  private unloadChunk(k: string): void {
    this.loaded.delete(k);
    this.things = this.things.filter((t) => t.ck !== k);
    this.enemies = this.enemies.filter((e) => e.ck !== k);
  }

  /** Resolves when pending chunk loads finish (the bot and tests use this after each step). */
  async settle(): Promise<void> {
    for (let i = 0; i < 8 && this.loading.size; i++) await new Promise((r) => setTimeout(r, 0));
    if (this.warp && !this.warp.ready) await this.warpPromise;
  }

  private spawnChunk(ck: string, objs: RawObj[]): void {
    const [cx, cy] = ck.split(",").map(Number);
    for (const o of objs) this.spawnObj(o, cx * CW, cy * CH, ck);
  }
  private spawnRoom(room: Room): void {
    for (const o of room.objects) this.spawnObj(o, 0, 0, "room");
  }

  private spawnObj(o: RawObj, ox: number, oy: number, ck: string): void {
    const gx = Math.floor(o.x) + ox, gy = Math.floor(o.y) + oy;
    const px = (gx + 0.5) * TS, py = (gy + 0.5) * TS;
    const id = (o.id as string) ?? `${o.t}_${gx}_${gy}`;
    const label = (o.label as string) ?? "";
    switch (o.t) {
      case "enemy": {
        const kind = o.kind as string;
        const def = ENEMIES[kind];
        if (!def) return;
        if (def.deadFlag && this.hasFlag(def.deadFlag)) return;
        if (this.area.kind === "room" && this.area.room!.fight && this.save.cleared.includes(this.area.id) && !def.boss) return;
        this.enemies.push(this.makeEnemy(kind, px, py + 4, ck));
        break;
      }
      case "bush": this.things.push({ uid: this.uid++, t: "bush", id, x: px, y: py, w: 16, h: 16, ck, raw: o, label: "" }); break;
      case "sign": this.things.push({ uid: this.uid++, t: "sign", id, x: px, y: py, w: 16, h: 16, ck, raw: o, label: label || "Sign" }); break;
      case "npc": this.things.push({ uid: this.uid++, t: "npc", id, x: px, y: py, w: 16, h: 16, ck, raw: o, label }); break;
      case "chest": this.things.push({ uid: this.uid++, t: "chest", id, x: o.big ? (gx + 1) * TS : px, y: py, w: o.big ? 32 : 16, h: 16, ck, raw: o, label: label || "Chest" }); break;
      case "slab": case "rubble": case "thicket": this.things.push({ uid: this.uid++, t: o.t, id, x: px, y: py, w: 16, h: 16, ck, raw: o, label: o.t === "slab" ? "Heavy slab" : o.t === "thicket" ? "Tangled thorns" : "Cracked rubble", cut: this.save.doors.includes(id) }); break;
      case "crystal": this.things.push({ uid: this.uid++, t: "crystal", id, x: px, y: py, w: 16, h: 16, ck, raw: o, label }); break;
      case "shopitem": this.things.push({ uid: this.uid++, t: "shopitem", id, x: px, y: py, w: 16, h: 16, ck, raw: o, label }); break;
      case "door": {
        const w = (o.w as number) * TS, h = (o.h as number) * TS;
        this.things.push({ uid: this.uid++, t: "door", id, x: gx * TS + w / 2, y: gy * TS + h / 2, w, h, ck, raw: o, label });
        break;
      }
      case "warp": {
        const w = (o.w as number) * TS, h = (o.h as number) * TS;
        this.things.push({ uid: this.uid++, t: "warp", id, x: gx * TS + w / 2, y: gy * TS + h / 2, w, h, ck, raw: o, label });
        break;
      }
    }
  }

  makeEnemy(kind: string, x: number, y: number, ck: string): Enemy {
    const def = ENEMIES[kind];
    return { uid: this.uid++, kind, def, x, y, hx: x, hy: y, hp: def.hp, st: "idle", t: this.rnd(0, 1), face: Math.PI / 2, kx: 0, ky: 0, flash: 0, stun: 0, dying: 0, a: 0, b: 0, c: 0, vis: 1, ck, alive: true };
  }

  /* ---------------------------------------------------------------- fog of war */
  private decodeFog(): void {
    this.fog = new Uint8Array(FOG_HEX / 2);
    for (let i = 0; i < FOG_HEX / 2; i++) this.fog[i] = parseInt(this.save.fog.slice(i * 2, i * 2 + 2) || "00", 16) || 0;
  }
  fogAt(cx: number, cy: number): boolean {
    if (cx < 0 || cy < 0 || cx >= FOG_W || cy >= FOG_H) return false;
    const i = cy * FOG_W + cx;
    return (this.fog[i >> 3] & (1 << (i & 7))) !== 0;
  }
  private revealFog(): void {
    if (this.area.kind !== "world") return;
    const fx = Math.floor(this.p.x / (TS * FOG_CW)), fy = Math.floor(this.p.y / (TS * FOG_CH));
    let changed = false;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const cx = fx + dx, cy = fy + dy;
        if (cx < 0 || cy < 0 || cx >= FOG_W || cy >= FOG_H || this.fogAt(cx, cy)) continue;
        const i = cy * FOG_W + cx;
        this.fog[i >> 3] |= 1 << (i & 7);
        changed = true;
      }
    if (changed) this.save.fog = [...this.fog].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  /* ---------------------------------------------------------------- save */
  toSave(): SaveV2 {
    const s = this.save;
    const r2 = (n: number) => Math.round(n * 100) / 100;
    s.hp = Math.max(1, Math.min(this.hp, this.maxHp));
    s.x = r2(this.p.x / TS); s.y = r2(this.p.y / TS); s.facing = this.p.facing;
    s.magic = Math.round(this.save.magic);
    return structuredClone(s);
  }
  commit(): void {
    const s = this.toSave();
    this.onSave?.(s);
    this.emit({ t: "saved" });
  }

  /* ---------------------------------------------------------------- items */
  give(id: string, silent = false): void {
    const s = this.save;
    const m = GLINT_ITEM.exec(id);
    if (m) { this.addGlints(Number(m[1])); this.sfx("glint"); return; }
    switch (id) {
      case "heart_piece":
        s.pieces += 1;
        if (s.pieces >= 4) { s.pieces = 0; s.hearts = Math.min(20, s.hearts + 1); this.hp = this.maxHp; this.toast("Four shards became a new heart!"); }
        break;
      case "heart_container": s.hearts = Math.min(20, s.hearts + 1); this.hp = this.maxHp; this.setFlag("heartContainer"); break;
      case "small_key": s.keys += 1; break;
      case "tonic": s.inv.tonic = Math.min(9, (s.inv.tonic ?? 0) + 1); break;
      case "soup": this.heal(8); break;
      case "stew": this.heal(12); break;
      case "elixir": this.hp = this.maxHp; s.magic = MAX_MAGIC; break;
      case "mote": s.magic = MAX_MAGIC; break;
      default:
        if (!UNIQUE_ITEMS.includes(id)) return;
        if (!s.items.includes(id)) s.items.push(id);
        if (id === "gale_disc") s.equipped = "gale_disc";
        if (id === "keeper_blade") this.setFlag("gotBlade");
        if (id === "dune_gauntlet" || id === "spiral_boots") { if (!s.equipped && id === "spiral_boots") s.equipped = id; }
        if (id === "wicker_buckler") this.setFlag("gotBuckler");
        if (id === "heron_feather" && this.quest("feather") >= 1) this.setQuest("feather", 2);
        if (id === "waterskin" && this.quest("waterskin") >= 1) this.setQuest("waterskin", 2);
        if (id === "brass_lantern") { this.setFlag("lanternFound"); this.setQuest("lantern", 2); }
    }
    if (!silent) this.sfx("pickup");
  }
  heal(n: number): void { this.hp = Math.min(this.maxHp, this.hp + n); this.sfx("heart"); }

  useTonic(): boolean {
    if ((this.save.inv.tonic ?? 0) <= 0 || this.hp >= this.maxHp) return false;
    this.save.inv.tonic -= 1;
    this.hp = this.maxHp; this.sfx("heart"); this.toast("Ember Tonic: hearts restored");
    return true;
  }

  /* ---------------------------------------------------------------- dialogue + shop */
  startDialog(who: string, lines: string[], after?: () => void): void {
    this.dialog = { who, lines, i: 0, after };
    this.mode = "dialog";
    this.sfx("blip");
  }
  dialogNext(): void {
    const d = this.dialog;
    if (!d) return;
    d.i += 1;
    this.sfx("blip");
    if (d.i >= d.lines.length) {
      this.dialog = null;
      if (this.mode === "dialog") this.mode = "play";
      d.after?.();
    }
  }
  talk(id: string): void {
    const sc: Script = script(this, id);
    this.startDialog(sc.who, sc.lines, sc.after);
  }
  shopId = "lamp";
  shopRows(): { id: string; item: string; price: number }[] { return SHOPS[this.shopId] ?? SHOP; }
  openShop(which = "lamp"): void { this.shopId = which; this.shopOpen = true; this.mode = "shop"; }
  closeShop(): void { this.shopOpen = false; if (this.mode === "shop") this.mode = "play"; }
  shopBuy(id: string): boolean {
    const row = this.shopRows().find((r) => r.id === id);
    if (!row) return false;
    if (this.save.glints < row.price) { this.sfx("deny"); this.toast("Not enough glints."); return false; }
    if (row.item === "tonic" && (this.save.inv.tonic ?? 0) >= 9) { this.sfx("deny"); this.toast("You can't carry more tonics."); return false; }
    this.save.glints -= row.price;
    this.give(row.item, true);
    this.sfx("buy");
    this.toast(`Bought ${itemName(row.item)}`);
    return true;
  }

  private openChest(th: Thing): void {
    const raw = th.raw;
    const item = raw.item as string;
    if (th.raw.big && !this.hasItem((th.raw.key as string) ?? "big_key")) { this.sfx("deny"); this.toast("The great chest is locked. A Big Key opens it."); return; }
    this.save.chests.push(th.id);
    this.sfx(raw.big ? "bigchest" : "chest");
    this.give(item, true);
    this.p.state = "item"; this.p.t = 0; this.p.held = item; this.p.inv = 0;
    const def = ITEMS[item];
    const text = GLINT_ITEM.test(item) ? `You found ${itemName(item)}!` : item === "heart_piece" ? "You found an Ember Shard! Four make a heart." : `You found the ${itemName(item)}! ${def?.desc ?? ""}`;
    this.pendingItemText = text;
    this.commit();
  }
  pendingItemText = "";

  chestOpened(th: Thing): boolean { return this.save.chests.includes(th.id); }

  /* ---------------------------------------------------------------- damage */
  hurtPlayer(dmg: number, fromX: number, fromY: number, opts: { blockable?: boolean; kb?: number } = {}): boolean {
    const p = this.p;
    if (p.inv > 0 || p.state === "roll" || p.state === "hop" || p.state === "fall" || p.state === "dead" || p.state === "item" || this.mode !== "play") return false;
    const ang = Math.atan2(fromY - (p.y - 6), fromX - p.x);
    if (p.shielding && opts.blockable !== false && this.hasItem("wicker_buckler") && angDiff(ang, dirAngle(p.facing)) < 1.05) {
      this.sfx("block");
      p.kx = -Math.cos(ang) * 70; p.ky = -Math.sin(ang) * 70;
      this.emit({ t: "spark", x: p.x + Math.cos(ang) * 8, y: p.y - 6 + Math.sin(ang) * 8, color: "#bfe3ff", n: 5 });
      p.inv = 0.25;
      return false;
    }
    dmg -= defReduce(this.level, dmg);
    this.hp = Math.max(0, this.hp - dmg);
    p.inv = 1.0; p.state = "hurt"; p.t = 0; p.chargeT = 0;
    const kb = opts.kb ?? 150;
    p.kx = -Math.cos(ang) * kb; p.ky = -Math.sin(ang) * kb;
    this.sfx("hurt"); this.emit({ t: "shake", amt: 2 });
    if (this.hp <= 0) { p.state = "dead"; this.mode = "dead"; this.dead = 0; this.sfx("death"); this.emit({ t: "music", track: null }); }
    return true;
  }

  /** Damages an enemy. Returns "hit", "armor" or "none". */
  hitEnemy(e: Enemy, dmg: number, ang: number, o: { spin?: boolean; stun?: number; kb?: number; disc?: boolean; arrow?: boolean } = {}): string {
    if (!e.alive || e.dying > 0) return "none";
    dmg *= atkMul(this.level);
    // armour / invulnerability rules
    if (e.kind === "crab" && e.st !== "stunned" && !o.spin) {
      const toPlayer = Math.atan2(this.p.y - e.y, this.p.x - e.x);
      if (angDiff(toPlayer, e.face) < 1.2 && !o.disc) { this.sfx("clang"); this.emit({ t: "spark", x: e.x, y: e.y - 6, color: "#fff2b0", n: 4 }); e.kx = Math.cos(ang) * 30; e.ky = Math.sin(ang) * 30; return "armor"; }
    }
    if (e.kind === "stormfinch") {
      if (e.st !== "grounded") {
        if (!o.arrow && !o.disc) { this.sfx("clang"); this.emit({ t: "spark", x: e.x, y: e.y - 10, color: "#fff2b0", n: 4 }); return "armor"; }
        e.st = "grounded"; e.t = 0; e.c = 1; this.sfx("gust"); this.emit({ t: "spark", x: e.x, y: e.y - 10, color: "#bfe8ff", n: 10 }); this.emit({ t: "shake", amt: 2 });
      } else dmg *= 1.5;
    }
    if (e.kind === "sluicejaw") {
      if (e.st === "submerged" || e.st === "dive") return "none";
      if (o.stun) { e.st = "stunned"; e.t = 0; e.stun = 3.2; this.sfx("hit"); this.emit({ t: "spark", x: e.x, y: e.y - 10, color: "#bfe8ff", n: 8 }); return "hit"; }
      if (e.st !== "stunned") { this.sfx("clang"); this.emit({ t: "spark", x: e.x, y: e.y - 10, color: "#fff2b0", n: 4 }); return "armor"; }
      dmg *= 2;
    }
    e.hp -= dmg;
    e.flash = 0.18;
    e.kx = Math.cos(ang) * (o.kb ?? (e.def.boss ? 25 : 120)); e.ky = Math.sin(ang) * (o.kb ?? (e.def.boss ? 25 : 120));
    if (o.stun && e.kind !== "sluicejaw") e.stun = Math.max(e.stun, o.stun);
    this.sfx("hit");
    this.emit({ t: "spark", x: e.x, y: e.y - 6, color: "#ffffff", n: 4 });
    this.emit({ t: "dmgtext", x: e.x, y: e.y - 14, text: String(Math.round(dmg * 10) / 10) });
    if (e.hp <= 0) this.killEnemy(e);
    return "hit";
  }

  private killEnemy(e: Enemy): void {
    e.dying = 0.45; e.alive = false; e.st = "dying";
    this.sfx("kill");
    this.addXp(xpGain(e.def, this.level));
    if (this.save.allies) for (const id of this.allyIds()) { const rt = this.allyRt[id]; if (rt && Math.hypot(rt.x - e.x, rt.y - e.y) < 230) this.addAllyXp(id, Math.max(1, Math.round(xpGain(e.def, this.level) * (e.def.boss ? 0.25 : 0.6)) + (this.allyHit === id ? 1 : 0))); }
    this.emit({ t: "spark", x: e.x, y: e.y - 6, color: "#ffd88a", n: 10 });
    if (e.def.boss) {
      if (e.kind === "marshal") { this.setFlag("marshalDead"); this.bossActive = ""; this.emit({ t: "music", track: this.trackFor() }); this.toast("The Gaol-Marshal falls. A chest rises from the floor!"); this.sfx("fanfare"); }
      if (e.kind === "cloudmarshal") { this.setFlag("cloudmarshalDead"); this.bossActive = ""; this.emit({ t: "music", track: this.trackFor() }); this.toast("Cloudmarshal Vesk falls. A chest rises from the floor!"); this.sfx("fanfare"); }
      if (e.kind === "stormfinch") {
        this.setFlag("stormfinchDead"); this.bossActive = ""; this.setQuest("thirdlamp", 3);
        this.sfx("fanfare"); this.emit({ t: "flash" }); this.emit({ t: "music", track: "victory" });
        this.pickups.push({ uid: this.uid++, kind: "heart", x: e.x, y: e.y + 10, val: 99, ttl: 1e9, t: 0, z: 0 });
        this.heartContainerAt = [e.x, e.y + 10];
        this.toast("Stormfinch Mol is defeated!");
      }
      if (e.kind === "rootknight") { this.setFlag("rootknightDead"); this.bossActive = ""; this.emit({ t: "music", track: this.trackFor() }); this.toast("Rootknight Ulm crumbles. A chest rises from the roots!"); this.sfx("fanfare"); }
      if (e.kind === "barkwarden") {
        this.setFlag("wardenDead"); this.bossActive = ""; this.setQuest("wardstone", 3);
        this.sfx("fanfare"); this.emit({ t: "flash" }); this.emit({ t: "music", track: "victory" });
        this.pickups.push({ uid: this.uid++, kind: "heart", x: e.x, y: e.y + 10, val: 99, ttl: 1e9, t: 0, z: 0 });
        this.heartContainerAt = [e.x, e.y + 10];
        this.toast("The Bark Warden is defeated!");
      }
      if (e.kind === "vael") {
        this.setFlag("vaelDead"); this.bossActive = ""; this.setQuest("crown", 3);
        this.sfx("fanfare"); this.emit({ t: "flash" }); this.emit({ t: "music", track: "victory" });
        this.toast("Vael Orsek is defeated!"); this.endingT = 3.2;
      }
      if (e.kind === "sluicejaw") {
        this.setFlag("bossDead"); this.bossActive = ""; this.setQuest("cistern", 3);
        this.sfx("fanfare"); this.emit({ t: "flash" }); this.emit({ t: "music", track: "victory" });
        this.pickups.push({ uid: this.uid++, kind: "heart", x: e.x, y: e.y + 10, val: 99, ttl: 1e9, t: 0, z: 0 }); // the heart container
        this.heartContainerAt = [e.x, e.y + 10];
        this.toast("Sluicejaw is defeated!");
      }
      this.commit();
    } else if (this.rand() < (e.def.drop ?? 0.3)) {
      const r = this.rand();
      this.pickups.push({ uid: this.uid++, kind: r < 0.5 ? "glint" : r < 0.85 ? "heart" : "magic", x: e.x, y: e.y, val: r < 0.5 ? (this.rand() < 0.2 ? 5 : 1) : 2, ttl: 12, t: 0, z: 6 });
    }
  }
  heartContainerAt: [number, number] | null = null;

  private checkFightRoom(): void {
    if (this.area.kind !== "room" || !this.area.room!.fight) return;
    const id = this.area.id;
    if (this.save.cleared.includes(id)) return;
    const alive = this.enemies.some((e) => e.alive);
    if (!alive && this.sealed) {
      this.sealed = false; this.save.cleared.push(id); this.sfx("shutter"); this.toast("The doors unseal.");
      this.commit();
    }
  }

  /* ---------------------------------------------------------------- main step */
  step(dt: number, inp: Input): void {
    dt = Math.min(dt, 0.05);
    this.time += dt; this.save.playTime += dt;
    this.autosave += dt;
    if (this.lockMsgT > 0) this.lockMsgT -= dt;

    if (this.mode === "transition") { this.stepTransition(dt); return; }
    if (this.fade > 0 && this.mode !== "dead") this.fade = Math.max(0, this.fade - dt * 4);

    if (this.mode === "dead") {
      this.dead += dt;
      if (this.dead > 1.6 && !this.warp) this.respawn();
      this.fade = Math.min(1, Math.max(0, (this.dead - 0.9) / 0.7));
      return;
    }
    if (this.mode === "dialog") { if (inp.interact || inp.attack) this.dialogNext(); return; }
    if (this.mode === "shop") return;
    if (this.mode === "ending") return;
    if (this.endingT > 0) { this.endingT -= dt; if (this.endingT <= 0) { this.mode = "ending"; this.emit({ t: "music", track: "credits" }); this.emit({ t: "ending" }); return; } }

    const p = this.p;
    // magic regen
    if (this.save.magic < MAX_MAGIC && !this.discOut) this.save.magic = Math.min(MAX_MAGIC, this.save.magic + dt * 1.6);
    p.inv = Math.max(0, p.inv - dt);
    p.rollCd = Math.max(0, p.rollCd - dt);
    this.bowCd = Math.max(0, this.bowCd - dt);
    p.dashCd = Math.max(0, p.dashCd - dt);
    this.updatePlayer(dt, inp);
    this.updateProjs(dt);
    for (const e of this.enemies) stepEnemy(this, e, dt);
    this.updateAllies(dt);
    this.enemies = this.enemies.filter((e) => e.alive || e.dying > 0);
    for (const e of this.enemies) if (!e.alive) e.dying -= dt;
    this.enemies = this.enemies.filter((e) => e.alive || e.dying > 0);
    this.updatePickups(dt);
    this.checkFightRoom();
    this.updateThings();
    if (this.area.kind === "world") {
      p.safeT -= dt;
      const [cx, cy] = this.chunkOf(p.x, p.y);
      const k = `${cx},${cy}`;
      if (!this.save.visited.includes(k)) this.save.visited.push(k);
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) if (this.data.inRegion(cx + dx, cy + dy) && !this.loaded.has(`${cx + dx},${cy + dy}`)) { near = true; break; }
      const far = [...this.loaded].some((q) => { const [a, b] = q.split(",").map(Number); return Math.abs(a - cx) > 1 || Math.abs(b - cy) > 1; });
      if (near || far) void this.loadWindow(cx, cy, false);
      this.revealFog();
    }
    if (this.autosave > 45) { this.autosave = 0; this.commit(); }
  }

  /* ---------------------------------------------------------------- player */
  private speedAt(): number {
    const p = this.p;
    return isSlow(this.tileAtPx(p.x, p.y - 2)) ? 0.65 : 1;
  }

  private updatePlayer(dt: number, inp: Input): void {
    const p = this.p;
    p.bobT += dt;
    p.shielding = false;
    const hasSword = this.hasItem("keeper_blade");
    const mag = Math.hypot(inp.mx, inp.my);
    const mx = mag > 1 ? inp.mx / mag : inp.mx, my = mag > 1 ? inp.my / mag : inp.my;
    const base = 74 * this.speedAt();

    switch (p.state) {
      case "hurt":
        p.t += dt;
        this.moveBody(p, p.kx * dt, p.ky * dt, PBOX.hw, PBOX.h);
        p.kx *= 0.86; p.ky *= 0.86;
        if (p.t > 0.22) p.state = "idle";
        break;
      case "swing": {
        p.t += dt;
        this.moveBody(p, mx * base * 0.25 * dt, my * base * 0.25 * dt, PBOX.hw, PBOX.h);
        if (p.t > 0.05 && p.t < 0.22) this.swordHit(p.swingAngle, 1.3, 23, 1, false);
        if (p.t >= 0.32) {
          if (inp.attackHeld) { p.state = "charge"; p.chargeT = 0.12; this.sfx("charge"); } else p.state = "idle";
        }
        break;
      }
      case "charge": {
        p.chargeT += dt;
        this.moveBody(p, mx * base * 0.45 * dt, my * base * 0.45 * dt, PBOX.hw, PBOX.h);
        if (!inp.attackHeld) {
          if (p.chargeT >= 0.75) { p.state = "spin"; p.t = 0; p.hitSet.clear(); this.sfx("spin"); } else p.state = "idle";
        }
        break;
      }
      case "spin":
        p.t += dt;
        if (p.t > 0.03 && p.t < 0.34) this.swordHit(0, Math.PI, 27, 2, true);
        if (p.t >= 0.4) p.state = "idle";
        break;
      case "dash": {
        p.t += dt;
        const sp = 150;
        const hit = this.moveBody(p, p.dashDx * sp * dt, p.dashDy * sp * dt, PBOX.hw, PBOX.h, true, false);
        this.dashBreak();
        const overPit = isPit(this.tileAtPx(p.x, p.y - 2));
        if (hit || (p.t >= 0.4 && !overPit) || p.t >= 0.7) { if (hit && p.t > 0.08) { this.sfx("clang"); this.emit({ t: "shake", amt: 1 }); } p.state = "idle"; }
        break;
      }
      case "roll": {
        p.t += dt;
        const sp = 135;
        this.moveBody(p, p.rollDx * sp * dt, p.rollDy * sp * dt, PBOX.hw, PBOX.h);
        if (p.t >= 0.28) p.state = "idle";
        break;
      }
      case "hop": {
        p.t += dt;
        const k = Math.min(1, p.t / 0.5);
        p.x = p.hopFrom[0] + (p.hopTo[0] - p.hopFrom[0]) * k;
        p.y = p.hopFrom[1] + (p.hopTo[1] - p.hopFrom[1]) * k;
        if (k >= 1) { p.state = "idle"; this.sfx("land"); p.safeX = p.x; p.safeY = p.y; }
        break;
      }
      case "item":
        p.t += dt;
        if (p.t >= 1.3) {
          p.state = "idle";
          if (this.pendingItemText) { const t = this.pendingItemText; this.pendingItemText = ""; this.startDialog("", [t]); }
        }
        break;
      case "fall":
        p.t += dt;
        if (p.t > 0.7) {
          p.x = p.safeX; p.y = p.safeY; p.state = "idle"; p.inv = 1.2;
          this.hp = Math.max(1, this.hp - 2); this.sfx("hurt");
          if (this.hp <= 0) { /* never kill by falling */ this.hp = 1; }
        }
        break;
      case "dead": break;
      default: {
        // idle / walk
        if (hasSword && inp.attack && !inp.shield) {
          const a = inp.aim ?? dirAngle(p.facing);
          p.facing = dirOfVec(Math.cos(a), Math.sin(a), p.facing);
          p.swingAngle = inp.aim ?? dirAngle(p.facing);
          p.state = "swing"; p.t = 0; p.hitSet.clear(); this.sfx("swing");
          break;
        }
        if (inp.dodge && p.rollCd <= 0) {
          const dx = mag > 0.1 ? mx / (mag > 1 ? 1 : mag) : DIRS[p.facing][0], dy = mag > 0.1 ? my / (mag > 1 ? 1 : mag) : DIRS[p.facing][1];
          const l = Math.hypot(dx, dy) || 1;
          p.rollDx = dx / l; p.rollDy = dy / l; p.state = "roll"; p.t = 0; p.rollCd = 0.55; p.inv = Math.max(p.inv, 0.3); this.sfx("roll");
          break;
        }
        if (inp.item && this.save.equipped === "gale_disc") this.useDisc(inp.aim);
        else if (inp.item && this.save.equipped === "ember_bow" && this.hasItem("ember_bow")) this.useBow(inp.aim);
        else if (inp.item && this.save.equipped === "spiral_boots" && this.hasItem("spiral_boots")) { this.startDash(inp.aim, mx, my); break; }
        if (inp.interact && this.tryInteract()) break;
        const shield = inp.shield && this.hasItem("wicker_buckler");
        p.shielding = shield;
        const sp = shield ? base * 0.55 : base;
        if (mag > 0.05) {
          // ledge hop: moving down into a ledge tile
          if (my > 0.4 && Math.abs(mx) < 0.7 && isLedge(this.tileAtPx(p.x, p.y + 3)) && !shield) { this.startHop(); break; }
          if (!shield || true) p.facing = shield ? p.facing : dirOfVec(mx, my, p.facing);
          this.moveBody(p, mx * sp * dt, my * sp * dt, PBOX.hw, PBOX.h);
          p.state = "walk";
          // corner nudge: slide around tile corners
          if (this.nudgeCheck(mx, my)) { /* handled */ }
        } else p.state = "idle";
        if (inp.attackHeld && !inp.attack && hasSword && !shield && mag < 0.05 && false) p.state = "charge";
      }
    }
    // swing started from a held press: allow charge directly if attack held through swing end
    // hazards (not while hopping / rolling)
    if (p.state === "idle" || p.state === "walk" || p.state === "charge" || p.state === "swing") {
      const id = this.tileAtPx(p.x, p.y - 2);
      if (isPit(id)) { p.state = "fall"; p.t = 0; this.sfx("fall"); }
      else if (p.safeT <= 0 && !isSlow(id) && !isSolid(id)) { p.safeT = 0.25; p.safeX = p.x; p.safeY = p.y; }
    }
    this.checkWarpsAndDoors();
  }

  /** Dashing into cracked rubble shatters it for good. */
  private dashBreak(): void {
    const p = this.p;
    for (const th of this.things) {
      if (th.t !== "rubble" || th.cut) continue;
      if (Math.hypot(th.x - p.x, th.y - (p.y - 4)) > 15) continue;
      th.cut = true;
      if (!this.save.doors.includes(th.id)) this.save.doors.push(th.id);
      this.sfx("crumble"); this.emit({ t: "shake", amt: 2 });
      this.emit({ t: "spark", x: th.x, y: th.y, color: "#b8a890", n: 16 });
      this.toast("The rubble crumbles away.");
      this.commit();
    }
  }

  private nudgeCheck(mx: number, my: number): boolean {
    const p = this.p;
    // when walking straight into a corner by <5px, slide along the free axis
    if ((mx === 0) !== (my === 0)) {
      const step = 1.2;
      if (mx !== 0 && this.blocked(p.x + Math.sign(mx) * 1, p.y - PBOX.h, p.x + Math.sign(mx) * 1 + 0, p.y, true)) {
        for (const d of [-1, 1]) { const q = { x: p.x, y: p.y }; if (!this.blocked(q.x - PBOX.hw + Math.sign(mx), p.y + d * 4 - PBOX.h, q.x + PBOX.hw + Math.sign(mx), p.y + d * 4, true) && !this.blocked(p.x - PBOX.hw, p.y + d * step - PBOX.h, p.x + PBOX.hw, p.y + d * step, true)) { p.y += d * step * 0.6; return true; } }
      } else if (my !== 0 && this.blocked(p.x - PBOX.hw, p.y + Math.sign(my) - PBOX.h, p.x + PBOX.hw, p.y + Math.sign(my), true)) {
        for (const d of [-1, 1]) { if (!this.blocked(p.x + d * 4 - PBOX.hw, p.y + Math.sign(my) * 2 - PBOX.h, p.x + d * 4 + PBOX.hw, p.y + Math.sign(my) * 2, true) && !this.blocked(p.x + d * step - PBOX.hw, p.y - PBOX.h, p.x + d * step + PBOX.hw, p.y, true)) { p.x += d * step * 0.6; return true; } }
      }
    }
    return false;
  }

  private startHop(): void {
    const p = this.p;
    const tx = Math.floor(p.x / TS);
    let ty = Math.floor((p.y + 3) / TS);
    while (isLedge(this.tile(tx, ty)) || isSolid(this.tile(tx, ty))) { if (ty > Math.floor(p.y / TS) + 6) return; ty++; }
    p.state = "hop"; p.t = 0; p.hopFrom = [p.x, p.y]; p.hopTo = [p.x, ty * TS + 6]; p.facing = "down"; p.inv = 0.6;
    this.sfx("hop");
  }

  private swordHit(angle: number, half: number, radius: number, dmg: number, spin: boolean): void {
    const p = this.p;
    const cx = p.x, cy = p.y - 7;
    const a = spin ? 0 : angle;
    for (const e of this.enemies) {
      if (!e.alive || p.hitSet.has(e.uid)) continue;
      const dx = e.x - cx, dy = e.y - 6 - cy;
      const d = Math.hypot(dx, dy);
      if (d > radius + e.def.r) continue;
      if (!spin && angDiff(Math.atan2(dy, dx), a) > half + 0.2 && d > e.def.r + 4) continue;
      const res = this.hitEnemy(e, dmg, Math.atan2(dy, dx), { spin });
      p.hitSet.add(e.uid);
      if (res === "armor") p.hitSet.add(e.uid);
    }
    for (const th of this.things) {
      if (th.cut || p.hitSet.has(-th.uid)) continue;
      if (th.t !== "bush" && th.t !== "crystal") continue;
      const dx = th.x - cx, dy = th.y - cy;
      if (Math.hypot(dx, dy) > radius + 6) continue;
      if (!spin && angDiff(Math.atan2(dy, dx), a) > half + 0.3 && Math.hypot(dx, dy) > 10) continue;
      p.hitSet.add(-th.uid);
      if (th.t === "bush") this.cutBush(th); else this.hitCrystal(th);
    }
    // deflect small projectiles
    for (const pr of this.projs) if (!pr.mine && pr.kind === "bolt" && Math.hypot(pr.x - cx, pr.y - cy) < radius + 4) { pr.mine = true; pr.vx *= -1.2; pr.vy *= -1.2; this.sfx("clang"); }
  }

  private cutBush(th: Thing): void {
    th.cut = true; this.sfx("bush");
    this.emit({ t: "spark", x: th.x, y: th.y, color: "#7ac86a", n: 8 });
    const r = this.rand();
    if (r < 0.22) this.pickups.push({ uid: this.uid++, kind: "glint", x: th.x, y: th.y + 4, val: this.rand() < 0.15 ? 5 : 1, ttl: 12, t: 0, z: 4 });
    else if (r < 0.3) this.pickups.push({ uid: this.uid++, kind: "heart", x: th.x, y: th.y + 4, val: 2, ttl: 12, t: 0, z: 4 });
    else if (r < 0.36) this.pickups.push({ uid: this.uid++, kind: "magic", x: th.x, y: th.y + 4, val: 6, ttl: 12, t: 0, z: 4 });
  }

  private hitCrystal(th: Thing): void {
    const opens = th.raw.opens as string;
    if (opens && !this.save.doors.includes(opens)) {
      this.save.doors.push(opens);
      this.sfx("switch"); this.sfx("door"); this.toast("A gate grinds open somewhere nearby.");
      this.emit({ t: "spark", x: th.x, y: th.y, color: "#9fe8ff", n: 12 }); this.emit({ t: "shake", amt: 1.5 });
      this.commit();
    }
  }

  bowCd = 0;
  /** Ember Bow: a fire arrow (1 magic). Burns thickets, strikes switches, grounds Stormfinch Mol. */
  useBow(aim: number | null): void {
    const p = this.p;
    if (this.bowCd > 0) return;
    if (this.save.magic < 1) { this.sfx("deny"); this.toast("Not enough magic."); return; }
    this.save.magic -= 1; this.bowCd = 0.32;
    const a = aim ?? dirAngle(p.facing);
    this.projs.push({ uid: this.uid++, kind: "arrow", x: p.x, y: p.y - 7, vx: Math.cos(a) * 190, vy: Math.sin(a) * 190, r: 4, dmg: 2, ttl: 1.1, mine: true, phase: 0, ox: p.x, oy: p.y - 7, dist: 0 });
    this.sfx("arrow");
  }
  burnThicket(th: Thing): void {
    if (th.cut) return;
    th.cut = true;
    if (!this.save.doors.includes(th.id)) this.save.doors.push(th.id);
    this.sfx("burn"); this.toast("The thorns burn away.");
    this.emit({ t: "spark", x: th.x, y: th.y, color: "#ff9a3a", n: 14 });
    this.commit();
  }

  private useDisc(aim: number | null): void {
    const p = this.p;
    if (this.discOut) return;
    if (this.save.magic < DISC_COST) { this.sfx("deny"); this.toast("Not enough magic."); return; }
    this.save.magic -= DISC_COST;
    const a = aim ?? dirAngle(p.facing);
    this.projs.push({ uid: this.uid++, kind: "disc", x: p.x, y: p.y - 7, vx: Math.cos(a) * 200, vy: Math.sin(a) * 200, r: 6, dmg: 1, ttl: 4, mine: true, phase: 0, ox: p.x, oy: p.y - 7, dist: 0 });
    this.discOut = true; this.sfx("disc");
  }

  spawnProj(kind: "bolt" | "bubble" | "seed" | "arrow", x: number, y: number, ang: number, speed: number, dmg: number): void {
    this.projs.push({ uid: this.uid++, kind, x, y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, r: kind === "bubble" ? 5 : 4, dmg, ttl: kind === "seed" ? 2.6 : 3.5, mine: false, phase: 0, ox: x, oy: y, dist: 0 });
    this.sfx("fire");
  }

  private updateProjs(dt: number): void {
    const p = this.p;
    for (const pr of this.projs) {
      pr.ttl -= dt;
      if (pr.kind === "disc") {
        const range = 92;
        if (pr.phase === 0) {
          pr.x += pr.vx * dt; pr.y += pr.vy * dt; pr.dist += 200 * dt;
          if (pr.dist >= range || this.blocked(pr.x - 3, pr.y - 3, pr.x + 3, pr.y + 3, false)) pr.phase = 1;
        } else {
          const dx = p.x - pr.x, dy = p.y - 7 - pr.y, d = Math.hypot(dx, dy) || 1;
          pr.x += (dx / d) * 230 * dt; pr.y += (dy / d) * 230 * dt;
          if (d < 9) pr.ttl = 0;
        }
        for (const e of this.enemies) {
          if (!e.alive || e.dying > 0) continue;
          if (Math.hypot(e.x - pr.x, e.y - 6 - pr.y) < e.def.r + pr.r && !(pr.uid * 7 + e.uid in this.discHit)) {
            this.discHit[pr.uid * 7 + e.uid] = true;
            this.hitEnemy(e, 1, Math.atan2(e.y - pr.y, e.x - pr.x), { stun: 1.8, disc: true });
          }
        }
        for (const th of this.things) if (th.t === "crystal" && !th.cut && Math.hypot(th.x - pr.x, th.y - pr.y) < 12) this.hitCrystal(th);
        for (const pk of this.pickups) if (pk.kind !== "heart" || pk.val < 99) if (Math.hypot(pk.x - pr.x, pk.y - pr.y) < 9) this.collect(pk);
        if (pr.ttl <= 0) this.discOut = false;
      } else {
        pr.x += pr.vx * dt; pr.y += pr.vy * dt;
        if (this.blocked(pr.x - 2, pr.y - 2, pr.x + 2, pr.y + 2, false)) pr.ttl = 0;
        if (pr.mine && pr.kind === "arrow") {
          for (const th of this.things) {
            if (th.t === "crystal" && !th.cut && Math.hypot(th.x - pr.x, th.y - pr.y) < 12) { this.hitCrystal(th); pr.ttl = 0; }
            if (th.t === "thicket" && !th.cut && Math.hypot(th.x - pr.x, th.y - pr.y) < 12) { this.burnThicket(th); pr.ttl = 0; }
          }
        }
        if (pr.mine) {
          for (const e of this.enemies) if (e.alive && Math.hypot(e.x - pr.x, e.y - 6 - pr.y) < e.def.r + 4) { this.hitEnemy(e, pr.kind === "arrow" ? 2.5 : 2, Math.atan2(pr.vy, pr.vx), { arrow: pr.kind === "arrow" }); pr.ttl = 0; }
        } else if (Math.hypot(p.x - pr.x, p.y - 7 - pr.y) < pr.r + 4) {
          if (this.hurtPlayer(pr.dmg, pr.x, pr.y)) pr.ttl = 0; else if (p.shielding) pr.ttl = 0;
        }
      }
    }
    this.projs = this.projs.filter((p2) => p2.ttl > 0);
    if (!this.projs.some((q) => q.kind === "disc")) this.discOut = false;
  }
  private discHit: Record<number, boolean> = {};

  private collect(pk: Pickup): void {
    const i = this.pickups.indexOf(pk);
    if (i < 0) return;
    this.pickups.splice(i, 1);
    if (pk.kind === "glint") { this.addGlints(pk.val); this.sfx("glint"); }
    else if (pk.kind === "heart") {
      if (pk.val >= 99) { this.give("heart_container", true); this.sfx("fanfare"); this.pendingItemText = "You found a Heart Lamp! Your hearts are renewed, and the guardian's light is yours."; this.p.state = "item"; this.p.t = 0; this.p.held = "heart_container"; this.commit(); }
      else this.heal(pk.val);
    } else { this.save.magic = Math.min(MAX_MAGIC, this.save.magic + pk.val); this.sfx("pickup"); }
  }

  private updatePickups(dt: number): void {
    const p = this.p;
    for (const pk of [...this.pickups]) {
      pk.t += dt; pk.ttl -= dt; pk.z = Math.max(0, pk.z - dt * 20);
      if (pk.ttl <= 0) { this.pickups.splice(this.pickups.indexOf(pk), 1); continue; }
      if (p.state !== "dead" && Math.hypot(pk.x - p.x, pk.y - (p.y - 4)) < 10 && p.state !== "item") this.collect(pk);
    }
  }

  private updateThings(): void {
    // nothing time-based yet; hook for animated objects
  }

  /* ---------------------------------------------------------------- interact */
  nearestInteractable(): Thing | null {
    const p = this.p;
    const [fx, fy] = DIRS[p.facing];
    const cx = p.x + fx * 9, cy = p.y - 6 + fy * 9;
    let best: Thing | null = null, bd = 1e9;
    for (const th of this.things) {
      if (th.cut) continue;
      if (th.t === "chest") { if (!this.chestVisible(th) || this.chestOpened(th)) continue; }
      else if (th.t === "npc") { if (this.npcHidden(th.id)) continue; }
      else if (th.t !== "sign" && th.t !== "shopitem" && th.t !== "slab") continue;
      const reach = th.t === "chest" && th.w > 20 ? 22 : 15;
      const d = Math.hypot(th.x - cx, th.y - cy);
      if (d < reach && d < bd) { bd = d; best = th; }
    }
    return best;
  }

  /** Dune Gauntlet: lift a heavy slab out of the way for good. */
  liftSlab(th: Thing): void {
    if (!this.hasItem("dune_gauntlet")) { this.sfx("deny"); this.toast("Too heavy to budge. You would need a stronger grip."); return; }
    th.cut = true;
    if (!this.save.doors.includes(th.id)) this.save.doors.push(th.id);
    this.sfx("lift"); this.emit({ t: "shake", amt: 1.5 });
    this.emit({ t: "spark", x: th.x, y: th.y, color: "#d8c88a", n: 14 });
    this.p.state = "item"; this.p.t = 1.0; this.p.held = "";
    this.commit();
  }

  /** Item box: cycle through owned equippable items, Q uses the selected one. */
  cycleItem(dir: 1 | -1 = 1): void {
    const own = EQUIPPABLE.filter((i) => this.hasItem(i));
    if (!own.length) return;
    const i = own.indexOf(this.save.equipped);
    this.save.equipped = own[(i + dir + own.length) % own.length];
    this.sfx("select"); this.toast(`Item: ${itemName(this.save.equipped)}`);
  }

  /** Spiral Boots: a wind-up dash. Crosses chasms (up to three tiles) and smashes cracked rubble. */
  private startDash(aim: number | null, mx: number, my: number): void {
    const p = this.p;
    if (p.dashCd > 0) return;
    let dx: number, dy: number;
    if (Math.hypot(mx, my) > 0.1) { const l = Math.hypot(mx, my); dx = mx / l; dy = my / l; }
    else if (aim !== null) { dx = Math.cos(aim); dy = Math.sin(aim); }
    else { dx = DIRS[p.facing][0]; dy = DIRS[p.facing][1]; }
    p.facing = dirOfVec(dx, dy, p.facing);
    p.dashDx = dx; p.dashDy = dy; p.state = "dash"; p.t = 0; p.dashCd = 0.7; p.inv = Math.max(p.inv, 0.15);
    this.sfx("dash");
  }

  private tryInteract(): boolean {
    const th = this.nearestInteractable();
    if (!th) return false;
    switch (th.t) {
      case "sign": this.startDialog(th.label || "Sign", th.raw.text as string[]); return true;
      case "npc": this.talk(th.id); return true;
      case "chest": this.openChest(th); return true;
      case "shopitem": this.openShop(this.area.id === "kestrel_outpost" ? "outpost" : "lamp"); return true;
      case "slab": this.liftSlab(th); return true;
    }
    return false;
  }

  /* ---------------------------------------------------------------- warps and doors */
  private checkWarpsAndDoors(): void {
    const p = this.p;
    if (this.warp || this.mode !== "play") return;
    if (p.state === "hop" || p.state === "fall" || p.state === "item" || p.state === "dead") return;
    const fx = p.x, fy = p.y - 3;
    for (const th of this.things) {
      if (th.t !== "warp" && th.t !== "door") continue;
      const inside = fx > th.x - th.w / 2 && fx < th.x + th.w / 2 && fy > th.y - th.h / 2 && fy < th.y + th.h / 2;
      if (th.t === "warp") {
        const reveal = th.raw.reveal as string | undefined;
        if (reveal && !this.hasFlag(reveal)) continue;
        if (!inside) continue;
        const to = th.raw.to as string;
        if (!to) { if (this.lockMsgT <= 0) { this.toast((th.raw.msg as string) ?? "Locked."); this.lockMsgT = 2; this.sfx("deny"); } p.y += 4; continue; }
        const need = th.raw.needFlag as string | undefined;
        if (need && !need.split(",").every((f) => this.hasFlag(f))) { if (this.lockMsgT <= 0) { this.startDialog("", [th.raw.msg as string]); this.lockMsgT = 2; } p.y += 5; continue; }
        this.beginWarp(to, th.raw.tx as number, th.raw.ty as number, ((th.raw.dir as Dir) ?? "down"));
        return;
      }
      // doors
      const kind = th.raw.kind as string;
      const open = this.doorOpen(th);
      if (open) { if (inside) { this.beginWarp(th.raw.to as string, th.raw.tx as number, th.raw.ty as number, this.doorDir(th)); return; } continue; }
      // touching a closed door
      const near = fx > th.x - th.w / 2 - 3 - PBOX.hw && fx < th.x + th.w / 2 + 3 + PBOX.hw && p.y > th.y - th.h / 2 - 3 && p.y - PBOX.h < th.y + th.h / 2 + 3;
      if (!near || this.sealed) continue;
      if (kind === "small") {
        if (this.save.keys > 0) { this.save.keys -= 1; this.save.doors.push(th.id); this.sfx("unlock"); this.toast("Unlocked with a small key."); this.commit(); }
        else if (this.lockMsgT <= 0) { this.toast("Locked. You need a small key."); this.sfx("deny"); this.lockMsgT = 1.5; }
      } else if (kind === "big") {
        if (this.hasItem((th.raw.key as string) ?? "big_key")) { this.save.doors.push(th.id); this.sfx("unlock"); this.sfx("door"); this.toast("The great door opens."); this.commit(); }
        else if (this.lockMsgT <= 0) { this.toast("A great door. It needs the Big Key."); this.sfx("deny"); this.lockMsgT = 1.5; }
      } else if (kind === "switch") {
        if (this.lockMsgT <= 0) { this.toast("Sealed by a crystal. Something must strike it."); this.lockMsgT = 1.5; }
      }
    }
  }
  private doorDir(th: Thing): Dir {
    const s = th.raw.side as string;
    return s === "N" ? "up" : s === "S" ? "down" : s === "E" ? "right" : "left";
  }

  private warpPromise: Promise<void> = Promise.resolve();
  private beginWarp(to: string, tx: number, ty: number, dir: Dir): void {
    this.sfx(this.area.kind === "world" || to === "world" ? "stairs" : "door");
    this.mode = "transition";
    this.warp = { to, tx, ty, dir, t: 0, ready: false, done: false, swapped: false };
    const w = this.warp;
    // preload the destination while the screen fades
    this.warpPromise = (async () => {
      if (to === "world") await this.data.loadChunk(Math.floor(tx / CW), Math.floor(ty / CH));
      else await this.data.loadRoom(to);
      w.ready = true;
    })();
  }

  private stepTransition(dt: number): void {
    const w = this.warp!;
    w.t += dt;
    if (!w.swapped) {
      this.fade = Math.min(1, w.t / 0.2);
      if (w.t >= 0.2 && w.ready) {
        w.swapped = true;
        void this.enterArea(w.to, w.tx, w.ty, w.dir).then(() => { w.done = true; if (this.area.kind === "room" && this.area.room!.fight && !this.save.cleared.includes(this.area.id) && this.enemies.some((e) => e.alive)) { this.sealed = true; this.sfx("shutter"); } this.afterEnter(); });
      }
    } else if (w.done) {
      this.fade = Math.max(0, this.fade - dt * 5);
      if (this.fade <= 0) { this.warp = null; this.mode = this.dialog ? "dialog" : "play"; this.p.inv = 0.2; this.autosave = 0; this.commit(); }
    }
  }

  private afterEnter(): void {
    const r = this.area.kind === "room" ? this.area.room! : null;
    if (r && r.kind === "dungeon") {
      const m = this.enemies.find((e) => e.def.boss && e.alive);
      if (m) { this.bossActive = m.kind; this.emit({ t: "music", track: this.trackFor() }); this.emit({ t: "toast", text: m.def.name }); }
    }
  }

  private respawn(): void {
    const dun = this.area.kind === "room" && this.area.room!.kind === "dungeon" ? dungeonOf(this.area.id) : undefined;
    this.hp = Math.max(6, this.maxHp);
    this.p.state = "idle"; this.mode = "transition";
    this.warp = { to: dun ? dun.entry[0] : "world", tx: dun ? dun.entry[1] : 47, ty: dun ? dun.entry[2] : 40.5, dir: "down", t: 0.2, ready: true, done: false, swapped: false };
    this.dead = 0;
    this.save.glints = Math.floor(this.save.glints * 0.9);
    if (this.hasFlag("marshalDead") === false) this.bossActive = "";
    this.warp.swapped = true;
    const w = this.warp;
    void this.enterArea(w.to, w.tx, w.ty, w.dir).then(() => { w.done = true; this.fade = 1; this.afterEnter(); });
    this.p.inv = 1.5;
  }

  /** Audit: load an entire area (every world chunk) without a player. */
  async auditLoad(id: string): Promise<void> {
    this.enemies = []; this.things = []; this.loaded.clear(); this.sealed = false;
    if (id === "world") {
      this.area = { kind: "world", id, w: this.data.meta.cols * CW, h: this.data.meta.rows * CH };
      for (let cy = 0; cy < this.data.meta.rows; cy++) for (let cx = 0; cx < this.data.meta.cols; cx++) {
        const c = await this.data.loadChunk(cx, cy);
        if (c) { this.loaded.add(`${cx},${cy}`); this.spawnChunk(`${cx},${cy}`, c.objects); }
      }
    } else {
      const room = await this.data.loadRoom(id);
      this.area = { kind: "room", id, room, w: room.w, h: room.h };
      this.spawnRoom(room);
    }
    if (!this.p) this.p = this.makePlayer(0, 0, "down");
    for (const th of this.things) if (th.t === "bush") th.cut = true;
  }
  /** Audit: can the player stand with feet at the centre of this tile? */
  standable(tx: number, ty: number): boolean {
    const x = tx * TS + 8, y = ty * TS + 10;
    return !this.blocked(x - PBOX.hw, y - PBOX.h, x + PBOX.hw, y, true, null, true);
  }

  /** Bot / tests: current chunk key for the player. */
  chunkKey(): string { const [a, b] = this.chunkOf(this.p.x, this.p.y); return `${a},${b}`; }
}
