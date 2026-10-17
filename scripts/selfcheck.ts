/** `npm run check`: namecheck, types, map freshness, reachability audit, headless bot, save-validation and (when node has SQLite) the server smoke test. */
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { runAudit } from "./audit";
import { runBot } from "./bot";
import { cleanSave, progressOk } from "../server/save.mjs";
import { Sim } from "../src/sim/core";
import { ENEMIES, LEVEL_XP, MAX_LEVEL, atkMul, defReduce, hpBonusHalves, levelOf, xpGain } from "../src/sim/data";
import { migrateSave, normalizeFog } from "../src/sim/migrate";
import { FOG_HEX, FOG_W } from "../src/tiles";
import { hpBonusHalves as serverBonus } from "../server/save.mjs";
import { nodeWorld } from "../src/sim/node";

let failed = 0;
const t0 = Date.now();
function step(name: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
  if (!ok) failed++;
}
function run(cmd: string, args: string[], env: NodeJS.ProcessEnv = process.env): { ok: boolean; out: string } {
  const r = spawnSync(cmd, args, { encoding: "utf8", env, timeout: 600000 });
  return { ok: r.status === 0, out: `${r.stdout ?? ""}${r.stderr ?? ""}`.trim() };
}
function hashDir(dirs: string[]): string {
  const h = crypto.createHash("sha1");
  const walk = (p: string) => {
    if (!fs.existsSync(p)) return;
    if (fs.statSync(p).isDirectory()) { for (const f of fs.readdirSync(p).sort()) walk(path.join(p, f)); return; }
    h.update(p); h.update(fs.readFileSync(p));
  };
  dirs.forEach(walk);
  return h.digest("hex");
}

// 1. original-names rule, including proof that the check can fail
let r = run("node", ["scripts/namecheck.mjs"]);
step("namecheck: no banned names", r.ok, r.ok ? "" : r.out);
const probe = "src/__namecheck_probe.ts";
const banned = ["Hy", "rule"].join("");
fs.writeFileSync(probe, `export const x = "Welcome to ${banned}";\n`);
r = run("node", ["scripts/namecheck.mjs"]);
fs.rmSync(probe);
step("namecheck: fails on a banned name (negative test)", !r.ok && r.out.toLowerCase().includes(banned.toLowerCase()));

// 2. types
r = run("npx", ["tsc", "--noEmit"]);
step("tsc --noEmit", r.ok, r.ok ? "" : r.out.slice(0, 600));

// 3. generated data is fresh and deterministic
const before = hashDir(["public/world", "server/content.json"]);
r = run("npx", ["tsx", "tools/mapgen.ts"]);
const after = hashDir(["public/world", "server/content.json"]);
step("mapgen is deterministic; committed world data and server/content.json are current", r.ok && before === after, r.ok ? "" : r.out);

// 4. reachability audit
const audit = await runAudit();
for (const l of audit.lines.slice(-6)) console.log("      " + l);
step("audit: every chest, door, NPC, sign, warp and boss reachable; no softlocks", audit.ok, audit.ok ? "" : audit.errors.slice(0, 8).join("; "));

// 5. headless bot
const bot = await runBot(false);
step("bot: walks the whole vertical slice", bot.ok, bot.ok ? `${bot.seconds.toFixed(0)}s of game time, ${bot.deaths} death(s)` : bot.error);

// 6. save validation (server whitelist) against a real finished save and against tampering
if (bot.save) {
  const sv = JSON.parse(JSON.stringify(bot.save));
  const clean = cleanSave(sv);
  step("save: server accepts a real finished save", !!clean && JSON.stringify(clean.flags) === JSON.stringify(sv.flags), clean ? "" : "rejected");
  const bad = (name: string, patch: Record<string, unknown>) => step(`save: rejects ${name}`, cleanSave({ ...sv, ...patch }) === null);
  bad("an unknown area", { area: "nowhere" });
  bad("a wrong version", { v: 3 });
  bad("absurd hearts", { hearts: 40, hp: 5 });
  bad("an unknown flag", { flags: [...sv.flags, "godmode"] });
  bad("an unowned equipped item", { items: [], equipped: "gale_disc" });
  bad("a bad fog string", { fog: "xyz" });
  bad("hp above max", { hp: sv.hearts * 2 + 5 });
  bad("keys out of range", { keys: 99 });
  step("save: rejects non-objects", cleanSave(null) === null && cleanSave("x") === null && cleanSave([]) === null);
  const withExtra = cleanSave({ ...sv, evil: "x".repeat(1000), flags: [...sv.flags, ...sv.flags] });
  step("save: drops unknown fields and duplicates", !!withExtra && !("evil" in withExtra) && withExtra.flags.length === sv.flags.length);
  step("save: progress cannot go backwards", !!clean && !progressOk(clean, { ...clean, flags: [] }) && !progressOk(clean, { ...clean, chests: [] }) && progressOk(clean, clean));
  // a fresh game also validates and loads back into the sim
  const fresh = cleanSave(Sim.newSave());
  step("save: a new game's save validates", !!fresh);
  const world = nodeWorld();
  await world.init();
  const sim = new Sim(world, clean!);
  await sim.enterArea(clean!.area, clean!.x, clean!.y, clean!.facing);
  await sim.settle();
  step("save: finished save loads back into the sim at the same place", sim.area.id === clean!.area && sim.save.hearts === clean!.hearts && sim.hasFlag("bossDead"));
}

// 6b. experience and levels, SaveV1 -> SaveV2 migration
{
  const mono = LEVEL_XP.every((v, i) => i === 0 || v > LEVEL_XP[i - 1]) && LEVEL_XP.length === MAX_LEVEL;
  step("xp: level table is strictly increasing", mono);
  step("xp: server hp-bonus rule matches the game for every level", Array.from({ length: MAX_LEVEL }, (_, i) => i + 1).every((l) => serverBonus(l) === hpBonusHalves(l)));
  step("xp: perks stay modest (max +2 hearts, sword <= +75%, guard <= 2 halves)", hpBonusHalves(MAX_LEVEL) <= 4 && atkMul(MAX_LEVEL) <= 1.75 && defReduce(MAX_LEVEL, 4) <= 2 && defReduce(MAX_LEVEL, 1) === 0);
  const slime = ENEMIES.slime, soldier = ENEMIES.soldier;
  step("xp: grinding is optional (a slime gives nothing once you are level 8, bosses never fade)", xpGain(slime, 1) === 2 && xpGain(slime, 8) === 0 && xpGain(ENEMIES.sluicejaw, 10) === 60 && xpGain(soldier, 5) === 5);
  const w = nodeWorld(); await w.init();
  const sim2 = new Sim(w);
  await sim2.enterArea("world", 47, 40.5, "down"); await sim2.settle();
  sim2.events.length = 0;
  const hp0 = sim2.maxHp;
  sim2.addXp(LEVEL_XP[1]);
  const lv = sim2.events.filter((e) => e.t === "levelup").length, snd = sim2.events.some((e) => e.t === "sfx" && e.name === "levelup");
  step("xp: reaching level 2 emits one level-up effect event and sound", sim2.level === 2 && lv === 1 && snd);
  sim2.addXp(LEVEL_XP[3] - LEVEL_XP[1]);
  step("xp: level 4 adds a heart of max life and heals it", sim2.level === 4 && sim2.maxHp === hp0 + 2 && sim2.hp >= sim2.maxHp - 0);
  sim2.addXp(9999);
  step("xp: XP is capped at the last level", sim2.save.xp === LEVEL_XP[MAX_LEVEL - 1] && sim2.level === MAX_LEVEL && levelOf(1e9) === MAX_LEVEL);
  const v1 = { ...Sim.newSave(), v: 1 as const, flags: ["marshalDead", "bossDead"], quests: { cistern: 4, hen: 3 } } as Record<string, unknown>;
  delete v1.xp;
  const mig = migrateSave(v1);
  step("save: a v1 save migrates to v2 with estimated XP", !!mig && mig.v === 2 && mig.xp === 105 && migrateSave({ v: 9 }) === null);
  const legacyFog = "0".repeat(62) + "03" ; // cells 0 and 1 of the old 16x16 grid... bits 0,1 of byte 31 are cells 248,249
  const nf = normalizeFog(legacyFog);
  const cellOn = (f: string, x: number, y: number) => ((parseInt(f.slice(((y * FOG_W + x) >> 3) * 2, ((y * FOG_W + x) >> 3) * 2 + 2), 16) >> ((y * FOG_W + x) & 7)) & 1) === 1;
  step("save: legacy 16x16 fog moves into the 8x8 region's grid (cells keep their place)", nf.length === FOG_HEX && cellOn(nf, 8, 15) && cellOn(nf, 9, 15) && !cellOn(nf, 10, 15) && cleanSave({ ...Sim.newSave(), fog: legacyFog })?.fog === nf);
  const cs = cleanSave(v1);
  step("save: the server accepts a v1 save and upgrades it to v2", !!cs && cs.v === 2 && cs.xp === 105);
  step("save: server rejects hp above the level-based maximum and XP above the cap", cleanSave({ ...Sim.newSave(), hearts: 3, hp: 8 }) === null && cleanSave({ ...Sim.newSave(), xp: 9999 }) === null && !!cleanSave({ ...Sim.newSave(), xp: LEVEL_XP[3], hp: 8 }));
  step("save: XP cannot go backwards on the server", !progressOk({ ...Sim.newSave(), xp: 100 } as never, { ...Sim.newSave(), xp: 50 } as never) && progressOk(v1 as never, { ...v1, xp: 5 } as never));
}

// 6c. item framework: Dune Gauntlet slabs, Spiral Boots dash across chasms and through rubble, item box cycling
{
  const w = nodeWorld(); await w.init();
  const sim = new Sim(w);
  await sim.enterArea("ren_house", 5.5, 5.75, "right"); await sim.settle(); sim.mode = "play";
  const r = sim.area.room!;
  for (let x = 2; x < 14; x++) r.tiles[5 * r.w + x] = 24; // a clear wooden corridor on row 5
  for (const x of [7, 8, 9]) r.tiles[5 * r.w + x] = 57; // a three-tile chasm
  sim.things = [];
  const mk = (t: string, id: string, tx: number) => sim.things.push({ uid: 900 + tx, t, id, x: tx * 16 + 8, y: 5 * 16 + 8, w: 16, h: 16, ck: "room", raw: { t, id } as never, label: "", cut: false });
  mk("rubble", "t_rubble", 11); mk("slab", "t_slab", 13);
  const idle = { mx: 0, my: 0, attack: false, attackHeld: false, shield: false, dodge: false, item: false, interact: false, aim: null };
  const run = (n: number, inp = idle) => { for (let i = 0; i < n; i++) sim.step(1 / 60, i === 0 ? inp : { ...inp, item: false, interact: false }); };
  sim.p.x = 5.5 * 16; sim.p.y = 5 * 16 + 12; sim.p.facing = "right";
  sim.save.items.push("spiral_boots"); sim.save.equipped = "spiral_boots";
  step("items: the chasm tile is a pit tile (walking in falls)", sim.tile(8, 5) === 57);
  run(1, { ...idle, item: true }); run(70);
  const landed = sim.p.x > 9.5 * 16 && sim.p.state !== "fall" && sim.p.state !== "dash";
  step("items: Spiral Boots dash carries the hero across a 3-tile chasm", landed, `x=${(sim.p.x / 16).toFixed(2)} state=${sim.p.state}`);
  sim.p.dashCd = 0; run(1, { ...idle, item: true }); run(40);
  step("items: the dash shatters cracked rubble and the change is saved", sim.things.find((t) => t.id === "t_rubble")!.cut === true && sim.save.doors.includes("t_rubble"));
  sim.p.x = 12.2 * 16; sim.p.y = 5 * 16 + 12; sim.p.facing = "right"; sim.p.state = "idle";
  sim.liftSlab(sim.things.find((t) => t.id === "t_slab")!);
  step("items: a slab will not lift without the Dune Gauntlet", sim.things.find((t) => t.id === "t_slab")!.cut === false);
  sim.save.items.push("dune_gauntlet");
  sim.liftSlab(sim.things.find((t) => t.id === "t_slab")!);
  step("items: the Dune Gauntlet lifts a slab and the change is saved", sim.things.find((t) => t.id === "t_slab")!.cut === true && sim.save.doors.includes("t_slab"));
  sim.save.items.push("gale_disc"); sim.save.equipped = "gale_disc";
  sim.cycleItem();
  step("items: C cycles the item box between owned equippable items", sim.save.equipped === "spiral_boots");
  const sv = cleanSave({ ...Sim.newSave(), items: ["gale_disc", "spiral_boots"], equipped: "spiral_boots" });
  step("save: the server accepts any owned equippable item, not unowned or unknown ones", !!sv && cleanSave({ ...Sim.newSave(), items: ["gale_disc"], equipped: "spiral_boots" }) === null && cleanSave({ ...Sim.newSave(), items: ["dune_gauntlet"], equipped: "dune_gauntlet" }) === null);
}

// 6d. world size, Mossgate content, new enemies and phased bosses
{
  const w = nodeWorld(); await w.init();
  const shards = [...w.roomIds].length;
  step("world: 8x8 chunks of 32x24 tiles and Mossgate has 11 rooms", w.meta.cols === 8 && w.meta.rows === 8 && w.roomIds.filter((r: string) => r.startsWith("moss_")).length === 11, `rooms=${shards}`);
  let files = 0;
  for (let cy = 0; cy < 8; cy++) for (let cx = 0; cx < 8; cx++) if (fs.existsSync(`public/world/aurelane/c_${cx}_${cy}.json`)) files++;
  const shardCount = JSON.parse(fs.readFileSync("server/content.json", "utf8")).chests.length;
  step("world: 64 chunk files exist and the chest whitelist covers the new land", files === 64 && shardCount >= 45, `${files} files, ${shardCount} chests`);
  const kinds = Object.keys(ENEMIES);
  step("enemies: at least 12 kinds, bosses carry a dead flag", kinds.length >= 12 && ["marshal", "sluicejaw", "rootknight", "barkwarden"].every((k) => !!ENEMIES[k].deadFlag), `${kinds.length} kinds`);
  // run every field enemy for 12 s next to a tanky hero: no NaN, no crash, projectile enemies fire
  const sim = new Sim(w);
  await sim.enterArea("moss_a1", 12, 8, "down"); await sim.settle(); sim.mode = "play";
  sim.save.hearts = 20; sim.hp = sim.maxHp;
  sim.enemies = [];
  const fired = new Set<string>();
  for (const k of ["thornling", "beetle", "skipper", "mirefly", "archer"]) sim.enemies.push(sim.makeEnemy(k, 12 * 16 + (k.length % 5) * 14, 11 * 16, sim.area.id));
  const idle = { mx: 0, my: 0, attack: false, attackHeld: false, shield: false, dodge: false, item: false, interact: false, aim: null };
  let ok = true;
  for (let i = 0; i < 12 * 60; i++) { sim.hp = sim.maxHp; sim.p.x = 12 * 16; sim.p.y = 8 * 16; sim.step(1 / 60, idle); for (const pr of sim.projs) fired.add(pr.kind); for (const e of sim.enemies) if (!Number.isFinite(e.x) || !Number.isFinite(e.y)) ok = false; }
  step("enemies: five new field enemies run without NaN and seeds/arrows are fired", ok && fired.has("seed") && fired.has("arrow"), [...fired].join(","));
  // boss phases
  await sim.enterArea("moss_c3", 4, 8, "right"); await sim.settle(); sim.mode = "play";
  const bw = sim.enemies.find((e) => e.kind === "barkwarden")!;
  step("boss: the Bark Warden spawns in its court", !!bw && bw.def.hp === 44);
  const phases = new Set<number>(); let seeds = 0;
  for (let i = 0; i < 90 * 60 && bw.alive; i++) {
    sim.hp = sim.maxHp; sim.p.x = 4 * 16; sim.p.y = 8 * 16;
    if (i % 300 === 299) sim.hitEnemy(bw, 10, 0, {});
    sim.step(1 / 60, idle); phases.add(bw.c); seeds += sim.projs.filter((q) => q.kind === "seed" && q.ttl > 2.55).length;
  }
  step("boss: the Warden goes through three phases and fires seed rings", phases.has(1) && phases.has(2) && phases.has(3) && seeds > 10, `phases=${[...phases].join(",")} seeds=${seeds}`);
  sim.hitEnemy(bw, 99, 0, {}); sim.step(1 / 60, idle);
  step("boss: defeating the Warden sets the flag, advances the quest and drops a heart container", sim.hasFlag("wardenDead") && sim.heartContainerAt !== null && sim.quest("wardstone") === 3);
  await sim.enterArea("moss_b4", 12, 12, "up"); await sim.settle(); sim.mode = "play";
  const rk = sim.enemies.find((e) => e.kind === "rootknight")!;
  sim.hitEnemy(rk, 99, 0, {}); sim.step(1 / 60, idle);
  step("boss: Rootknight Ulm drops flag rootknightDead", sim.hasFlag("rootknightDead"));
  // Stage 3: music coverage (audio.ts is parsed as text: it needs WebAudio to run)
  {
    const src = fs.readFileSync("src/audio.ts", "utf8");
    const tracks = [...(/export const TRACKS: TrackId\[\] = \[([^\]]*)\]/.exec(src)?.[1] ?? "").matchAll(/"(\w+)"/g)].map((m) => m[1]);
    const used = new Set<string>();
    for (const f of fs.readdirSync("public/world/aurelane")) used.add(JSON.parse(fs.readFileSync(`public/world/aurelane/${f}`, "utf8")).music);
    for (const f of fs.readdirSync("public/world/rooms")) if (f !== "index.json") used.add(JSON.parse(fs.readFileSync(`public/world/rooms/${f}`, "utf8")).music);
    const missing = [...used].filter((m) => m && !tracks.includes(m));
    const specd = tracks.filter((tk) => new RegExp(`\\n  ${tk}: \\{`).test(src) || tk === "title");
    step("music: every chunk and room track exists with a spec", missing.length === 0 && specd.length >= tracks.length - 1, `missing=${missing.join(",")} tracks=${tracks.length} specs=${specd.length}`);
    for (const need of ["castle", "wood", "desert", "marsh", "lake", "mountain", "plateau", "moss", "spire", "bosswarden", "bossstorm", "keep", "finalboss", "credits"]) if (!tracks.includes(need)) step(`music: track ${need} exists`, false);
    step("music: biomes use distinct tracks", ["castle", "wood", "desert", "marsh", "lake", "mountain", "plateau", "moss", "spire"].every((n) => used.has(n)), [...used].join(","));
  }
  // Stage 3: Skyreach Spire
  await sim.enterArea("spire_d1", 17, 7.5, "right"); await sim.settle(); sim.mode = "play"; sim.enemies = [];
  const th = sim.things.find((x) => x.id === "th_d1a")!;
  step("spire: thicket blocks the Stormgate threshold", !!th && th.cut !== true);
  sim.save.items.push("ember_bow"); sim.save.equipped = "ember_bow"; sim.save.magic = 20;
  sim.p.x = 17 * 16; sim.p.y = 7.5 * 16; sim.p.facing = "right";
  for (let i = 0; i < 90 && !th.cut; i++) sim.step(1 / 60, i === 0 ? { ...idle, item: true } : idle);
  step("spire: an Ember Bow arrow burns the thicket and the change is saved", th.cut === true && sim.save.doors.includes("th_d1a"));
  await sim.enterArea("spire_d2", 12, 12, "up"); await sim.settle(); sim.mode = "play";
  const cm = sim.enemies.find((e) => e.kind === "cloudmarshal")!;
  sim.hitEnemy(cm, 99, 0, {}); sim.step(1 / 60, idle);
  step("spire: Cloudmarshal Vesk drops flag cloudmarshalDead", !!cm && sim.hasFlag("cloudmarshalDead"));
  await sim.enterArea("spire_e1", 4, 8, "right"); await sim.settle(); sim.mode = "play";
  const sf = sim.enemies.find((e) => e.kind === "stormfinch")!;
  for (let i = 0; i < 300 && sf.st !== "aloft" && sf.st !== "tell" && sf.st !== "dive"; i++) { sim.hp = sim.maxHp; sim.step(1 / 60, idle); }
  const swordRes = sim.hitEnemy(sf, 3, 0, {});
  step("spire: a sword cannot hurt an airborne Stormfinch", swordRes === "armor", `${swordRes} ${sf.st}`);
  sim.hitEnemy(sf, 1, 0, { arrow: true });
  step("spire: an arrow grounds the Stormfinch", sf.st === "grounded");
  const sphases = new Set<number>();
  for (let i = 0; i < 120 * 60 && sf.alive; i++) {
    sim.hp = sim.maxHp; sim.p.x = 4 * 16; sim.p.y = 8 * 16;
    if (i % 240 === 239) { if (sf.st !== "grounded") sim.hitEnemy(sf, 1, 0, { arrow: true }); sim.hitEnemy(sf, sf.def.hp * 0.3, 0, {}); }
    sim.step(1 / 60, idle); sphases.add(sf.b);
  }
  step("spire: the Stormfinch goes through phases", sphases.size >= 2, [...sphases].join(","));
  sf.alive && (sf.st = "grounded", sim.hitEnemy(sf, 999, 0, {}));
  sim.step(1 / 60, idle);
  step("spire: defeating Stormfinch Mol sets the flag and drops a heart container", sim.hasFlag("stormfinchDead") && sim.heartContainerAt !== null);
}

// 7. server smoke test (needs node:sqlite, Node >= 22.5)
const [maj, min] = process.versions.node.split(".").map(Number);
if (maj > 22 || (maj === 22 && min >= 5)) {
  r = run("node", ["--disable-warning=ExperimentalWarning", "server/smoke.mjs"]);
  step("server smoke test (sessions, CSRF, save validation over HTTP)", r.ok, r.ok ? r.out.split("\n").slice(-1)[0] : r.out.slice(-600));
} else console.log(`SKIP  server smoke test: Node ${process.versions.node} has no node:sqlite (run it with Node 22.5+)`);

console.log(failed ? `\ncheck FAILED: ${failed} problem(s) in ${((Date.now() - t0) / 1000).toFixed(0)}s` : `\ncheck passed in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
process.exit(failed ? 1 : 0);
