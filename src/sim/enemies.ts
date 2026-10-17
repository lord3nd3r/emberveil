/** Enemy behaviours as small state machines. Phaser-free. */
import { TS } from "../tiles";
import type { Enemy, Sim } from "./core";

const TAU = Math.PI * 2;

function toward(e: Enemy, tx: number, ty: number): number {
  return Math.atan2(ty - e.y, tx - e.x);
}
function go(s: Sim, e: Enemy, ang: number, speed: number, dt: number): boolean {
  const r = e.def.r;
  return s.moveBody(e, Math.cos(ang) * speed * dt, Math.sin(ang) * speed * dt, r * 0.8, r * 1.1, !e.def.flying, true);
}
function knock(s: Sim, e: Enemy, dt: number): void {
  if (Math.abs(e.kx) + Math.abs(e.ky) > 1) {
    s.moveBody(e, e.kx * dt, e.ky * dt, e.def.r * 0.8, e.def.r * 1.1, !e.def.flying, true);
    e.kx *= 0.84; e.ky *= 0.84;
  }
}
function touch(s: Sim, e: Enemy, dmg = e.def.touch): void {
  const p = s.p;
  if (Math.hypot(e.x - p.x, e.y - (p.y - 4)) < e.def.r + 5) {
    if (s.hurtPlayer(dmg, e.x, e.y - 4) === false && p.shielding && p.inv > 0) { e.kx = (e.x - p.x) * 4; e.ky = (e.y - p.y) * 4; }
  }
}
const dist = (s: Sim, e: Enemy): number => Math.hypot(s.p.x - e.x, s.p.y - e.y);

export function stepEnemy(s: Sim, e: Enemy, dt: number): void {
  if (!e.alive) return;
  e.t += dt;
  e.flash = Math.max(0, e.flash - dt);
  if (e.stun > 0) { e.stun -= dt; if (e.kind !== "sluicejaw") { knock(s, e, dt); touch(s, e); return; } }
  if (s.mode !== "play") return;
  knock(s, e, dt);
  switch (e.kind) {
    case "slime": return slime(s, e, dt);
    case "bat": return bat(s, e, dt);
    case "crab": return crab(s, e, dt);
    case "wisp": return wisp(s, e, dt);
    case "soldier": return soldier(s, e, dt);
    case "marshal": return marshal(s, e, dt);
    case "sluicejaw": return sluicejaw(s, e, dt);
    case "thornling": return thornling(s, e, dt);
    case "beetle": return beetle(s, e, dt);
    case "skipper": return skipper(s, e, dt);
    case "mirefly": return mirefly(s, e, dt);
    case "archer": return archer(s, e, dt);
    case "rootknight": return rootknight(s, e, dt);
    case "barkwarden": return barkwarden(s, e, dt);
    case "cloudmarshal": return cloudmarshal(s, e, dt);
    case "stormfinch": return stormfinch(s, e, dt);
    case "vael": return vael(s, e, dt);
  }
}

function slime(s: Sim, e: Enemy, dt: number): void {
  switch (e.st) {
    case "idle":
      if (e.t > 0.6 + (e.uid % 5) * 0.12 && dist(s, e) < 120) { e.st = "crouch"; e.t = 0; }
      else if (e.t > 2.4) { e.st = "crouch"; e.t = 0; e.a = s.rnd(0, TAU); }
      break;
    case "crouch":
      if (e.t > 0.35) { e.st = "hop"; e.t = 0; e.a = dist(s, e) < 120 ? toward(e, s.p.x, s.p.y) + s.rnd(-0.4, 0.4) : e.a; }
      break;
    case "hop":
      go(s, e, e.a, 62 * Math.sin(Math.min(1, e.t / 0.45) * Math.PI) + 8, dt);
      if (e.t > 0.45) { e.st = "idle"; e.t = 0; }
      break;
  }
  touch(s, e);
}

function bat(s: Sim, e: Enemy, dt: number): void {
  const d = dist(s, e);
  switch (e.st) {
    case "idle": // roost
      if (d < 78) { e.st = "flutter"; e.t = 0; }
      break;
    case "flutter": {
      const a = toward(e, s.p.x, s.p.y - 8) + Math.sin(e.t * 5) * 0.9;
      go(s, e, a, 42, dt);
      if (e.t > 1.8) { e.st = "tell"; e.t = 0; e.a = toward(e, s.p.x, s.p.y - 4); }
      break;
    }
    case "tell":
      if (e.t > 0.35) { e.st = "dive"; e.t = 0; e.a = toward(e, s.p.x, s.p.y - 4); }
      break;
    case "dive":
      go(s, e, e.a, 125, dt);
      if (e.t > 0.5) { e.st = "away"; e.t = 0; }
      break;
    case "away":
      go(s, e, e.a + Math.PI + Math.sin(e.t * 8) * 0.6, 55, dt);
      if (e.t > 0.9) { e.st = "flutter"; e.t = 0; }
      break;
  }
  e.face = e.a;
  touch(s, e);
}

function crab(s: Sim, e: Enemy, dt: number): void {
  const p = s.p;
  switch (e.st) {
    case "idle": // wander sideways
      if (e.c === 0) e.c = e.uid % 2 ? 1 : -1;
      e.face = e.c > 0 ? 0 : Math.PI;
      if (go(s, e, e.face, 24, dt)) e.c *= -1;
      if (Math.abs(p.y - e.y) < 12 && Math.abs(p.x - e.x) < 100) { e.st = "alert"; e.t = 0; }
      if (e.t > 3) { e.t = 0; e.c *= -1; }
      break;
    case "alert":
      e.face = p.x > e.x ? 0 : Math.PI;
      if (e.t > 0.45) { e.st = "charge"; e.t = 0; e.a = e.face; }
      break;
    case "charge":
      if (go(s, e, e.a, 105, dt) || e.t > 0.9) { e.st = "stunned"; e.t = 0; s.emit({ t: "spark", x: e.x + Math.cos(e.a) * 8, y: e.y - 4, color: "#ffe9a0", n: 4 }); }
      break;
    case "stunned":
      if (e.t > 1.1) { e.st = "idle"; e.t = 0; e.c = 0; }
      break;
  }
  touch(s, e);
}

function wisp(s: Sim, e: Enemy, dt: number): void {
  const p = s.p;
  const d = dist(s, e);
  const a = toward(e, p.x, p.y);
  switch (e.st) {
    case "idle": {
      if (d < 55) go(s, e, a + Math.PI, 32, dt);
      else if (d > 100) go(s, e, a, 28, dt);
      else go(s, e, a + Math.PI / 2 * (e.uid % 2 ? 1 : -1), 22, dt);
      if (e.t > 2.2 && d < 140) { e.st = "tell"; e.t = 0; }
      break;
    }
    case "tell":
      if (e.t > 0.65) { s.spawnProj("bolt", e.x, e.y - 8, toward(e, p.x, p.y - 7), 92, 2); e.st = "idle"; e.t = 0; }
      break;
  }
  touch(s, e);
}

function soldier(s: Sim, e: Enemy, dt: number): void {
  const p = s.p;
  const d = dist(s, e);
  const ang = toward(e, p.x, p.y);
  const sees = d < 84 && (e.st !== "idle" || Math.abs(Math.atan2(Math.sin(ang - e.face), Math.cos(ang - e.face))) < 1.1) || d < 28;
  switch (e.st) {
    case "idle": {
      // patrol around home
      if (e.b === 0 || Math.hypot(e.hx + Math.cos(e.a) * 28 - e.x, e.hy + Math.sin(e.a) * 28 - e.y) < 3) { e.a = s.rnd(0, TAU); e.b = 1; }
      const tx = e.hx + Math.cos(e.a) * 28, ty = e.hy + Math.sin(e.a) * 28;
      const pa = toward(e, tx, ty);
      e.face = pa;
      if (go(s, e, pa, 20, dt)) e.b = 0;
      if (sees) { e.st = "chase"; e.t = 0; }
      break;
    }
    case "chase":
      e.face = ang;
      go(s, e, ang, 40, dt);
      if (d < 24) { e.st = "tell"; e.t = 0; }
      else if (d > 130) { e.st = "idle"; e.t = 0; }
      break;
    case "tell":
      e.face = ang;
      if (e.t > 0.45) { e.st = "thrust"; e.t = 0; e.a = ang; }
      break;
    case "thrust": {
      const tipX = e.x + Math.cos(e.a) * 18, tipY = e.y - 6 + Math.sin(e.a) * 18;
      if (e.t < 0.2 && Math.hypot(tipX - p.x, tipY - (p.y - 5)) < 9) s.hurtPlayer(2, e.x, e.y - 6);
      if (e.t > 0.6) { e.st = "chase"; e.t = 0; }
      break;
    }
  }
  touch(s, e, 1);
}

/* ------------------------------------------------------------------ mini-boss: Gaol-Marshal Brann */
function marshal(s: Sim, e: Enemy, dt: number): void {
  const p = s.p;
  const phase2 = e.hp <= e.def.hp / 2;
  const ang = toward(e, p.x, p.y);
  if (s.bossActive !== "marshal") { s.bossActive = "marshal"; s.emit({ t: "music", track: "miniboss" }); }
  switch (e.st) {
    case "idle":
      e.face = ang;
      go(s, e, ang, phase2 ? 36 : 26, dt);
      if (e.t > 1.6) { e.st = "windup"; e.t = 0; }
      break;
    case "windup":
      if (e.t > 0.5) { e.st = "whirl"; e.t = 0; e.a = 0; }
      break;
    case "whirl": {
      e.a += dt * (phase2 ? 5.2 : 3.8);
      go(s, e, ang, 12, dt);
      const R = phase2 ? 34 : 29;
      const bx = e.x + Math.cos(e.a) * R, by = e.y - 8 + Math.sin(e.a) * R * 0.8;
      if (Math.hypot(bx - p.x, by - (p.y - 6)) < 8) s.hurtPlayer(2, bx, by, { blockable: false });
      e.b = bx; e.c = by;
      if (e.t > (phase2 ? 2.6 : 2.2)) { e.st = phase2 ? "tellcharge" : "rest"; e.t = 0; e.face = ang; }
      break;
    }
    case "tellcharge":
      e.face = ang; e.a = ang;
      if (e.t > 0.55) { e.st = "charge"; e.t = 0; }
      break;
    case "charge":
      if (go(s, e, e.a, 125, dt) || e.t > 0.6) { e.st = "rest"; e.t = 0; s.sfx("clang"); s.emit({ t: "shake", amt: 2 }); }
      break;
    case "rest":
      if (e.t > 1.1) { e.st = "idle"; e.t = 0; }
      break;
  }
  touch(s, e);
}

/* ------------------------------------------------------------------ boss: Sluicejaw */
function sluicejaw(s: Sim, e: Enemy, dt: number): void {
  const p = s.p;
  if (s.bossActive !== "sluicejaw") { s.bossActive = "sluicejaw"; s.emit({ t: "music", track: "boss" }); }
  const px = 12 * TS, py = 6.5 * TS; // pool centre (tiles 8..15, 4..8)
  const rage = e.hp <= e.def.hp / 2;
  const poolPoint = (tx: number, ty: number): [number, number] => [Math.max(9.2 * TS, Math.min(14.8 * TS, tx)), Math.max(5 * TS, Math.min(8.4 * TS, ty))];
  switch (e.st) {
    case "idle": // start: submerge
      e.st = "submerged"; e.t = 0; e.vis = 0.25;
      break;
    case "submerged": {
      e.vis = 0.25;
      const [tx, ty] = poolPoint(p.x, p.y);
      const a = Math.atan2(ty - e.y, tx - e.x);
      const sp = rage ? 62 : 48;
      if (Math.hypot(tx - e.x, ty - e.y) > 3) { e.x += Math.cos(a) * sp * dt; e.y += Math.sin(a) * sp * dt; }
      if (e.t > (rage ? 1.6 : 2.2)) { e.st = "tell"; e.t = 0; e.a = Math.atan2(p.y - e.y, p.x - e.x); }
      break;
    }
    case "tell":
      e.vis = 0.6 + Math.min(0.4, e.t);
      if (e.t > 0.7) { e.st = s.rand() < 0.5 ? "lunge" : "spit"; e.t = 0; e.b = 0; e.a = Math.atan2(p.y - e.y, p.x - e.x); e.vis = 1; }
      break;
    case "lunge": {
      e.vis = 1;
      const sp = 140;
      if (e.t < 0.45) { e.x += Math.cos(e.a) * sp * dt; e.y += Math.sin(e.a) * sp * dt; e.x = Math.max(3.2 * TS, Math.min(20.8 * TS, e.x)); e.y = Math.max(3.2 * TS, Math.min(12.6 * TS, e.y)); }
      else if (e.t > 1.5) { e.st = "retreat"; e.t = 0; }
      if (e.t < 1.0) touch(s, e, 4);
      return;
    }
    case "spit": {
      e.vis = 1;
      e.face = Math.atan2(p.y - e.y, p.x - e.x);
      const n = rage ? 5 : 3;
      if (e.t > 0.4 && e.b === 0) {
        e.b = 1;
        for (let i = 0; i < n; i++) s.spawnProj("bubble", e.x, e.y - 8, e.face + (i - (n - 1) / 2) * 0.28, 70, 2);
      }
      if (e.t > 1.6) { e.st = "retreat"; e.t = 0; }
      break;
    }
    case "retreat": {
      e.vis = 1;
      const a = Math.atan2(py - e.y, px - e.x);
      e.x += Math.cos(a) * 110 * dt; e.y += Math.sin(a) * 110 * dt;
      if (Math.hypot(px - e.x, py - e.y) < 22 || e.t > 2) { e.st = "submerged"; e.t = 0; }
      break;
    }
    case "stunned":
      e.vis = 1;
      if (e.t > 3.2) { e.st = "retreat"; e.t = 0; }
      return;
  }
  if (e.st === "tell" || e.st === "spit") touch(s, e, 2);
}

/* ------------------------------------------------------------------ more field enemies */
function ring(s: Sim, e: Enemy, n: number, speed: number, off = 0): void {
  for (let i = 0; i < n; i++) s.spawnProj("seed", e.x, e.y - 6, off + (i / n) * TAU, speed, 2);
}
/** Thornling: rooted bulb, spits a fan of seeds when you come close. Hit it while it winds up. */
function thornling(s: Sim, e: Enemy, dt: number): void {
  const d = dist(s, e);
  e.face = toward(e, s.p.x, s.p.y);
  if (e.st === "idle") { if (d < 105 && e.t > 1.2) { e.st = "tell"; e.t = 0; } }
  else if (e.st === "tell" && e.t > 0.6) {
    for (let i = -1; i <= 1; i++) s.spawnProj("seed", e.x, e.y - 6, e.face + i * 0.3, 66, 1);
    e.st = "idle"; e.t = 0;
  }
  touch(s, e);
  void dt;
}
/** Beetle: lowers its horn, charges in a line, and is dazed when it slams a wall. */
function beetle(s: Sim, e: Enemy, dt: number): void {
  const d = dist(s, e);
  switch (e.st) {
    case "idle":
      e.face = toward(e, s.p.x, s.p.y);
      if (d > 20 && d < 110) go(s, e, e.face, 14, dt);
      if (d < 100 && e.t > 1.5) { e.st = "tell"; e.t = 0; e.a = toward(e, s.p.x, s.p.y); }
      break;
    case "tell":
      if (e.t > 0.55) { e.st = "charge"; e.t = 0; }
      break;
    case "charge":
      if (go(s, e, e.a, 132, dt) || e.t > 0.9) { e.st = "stunned"; e.t = 0; s.emit({ t: "spark", x: e.x + Math.cos(e.a) * 8, y: e.y - 4, color: "#ffe9a0", n: 4 }); s.sfx("clang"); }
      break;
    case "stunned":
      if (e.t > 1.3) { e.st = "idle"; e.t = 0; }
      break;
  }
  touch(s, e);
}
/** Sandskipper: quick erratic hops, calm when you are far. */
function skipper(s: Sim, e: Enemy, dt: number): void {
  const d = dist(s, e);
  switch (e.st) {
    case "idle":
      if (e.t > (d < 110 ? 0.35 : 1.6)) { e.st = "hop"; e.t = 0; e.a = d < 110 ? toward(e, s.p.x, s.p.y) + s.rnd(-0.9, 0.9) : s.rnd(0, TAU); }
      break;
    case "hop":
      go(s, e, e.a, 92 * Math.sin(Math.min(1, e.t / 0.3) * Math.PI) + 10, dt);
      if (e.t > 0.3) { e.st = "idle"; e.t = 0; }
      break;
  }
  touch(s, e);
}
/** Mirefly: a darting glow that weaves around you. */
function mirefly(s: Sim, e: Enemy, dt: number): void {
  const d = dist(s, e);
  if (e.st === "idle" && d < 90) { e.st = "swarm"; e.t = 0; }
  if (e.st === "swarm") go(s, e, toward(e, s.p.x, s.p.y) + Math.sin(e.t * 7 + e.uid) * 1.3, 52, dt);
  else go(s, e, e.a + Math.sin(e.t * 2) * 0.8, 14, dt);
  if (e.st === "idle" && e.t > 2) { e.a = s.rnd(0, TAU); e.t = 0; }
  e.face = e.a;
  touch(s, e);
}
/** Hollow archer: keeps its distance, strafes, and looses arrows. */
function archer(s: Sim, e: Enemy, dt: number): void {
  const d = dist(s, e);
  const ang = toward(e, s.p.x, s.p.y);
  e.face = ang;
  switch (e.st) {
    case "idle":
      if (d < 54) go(s, e, ang + Math.PI, 36, dt);
      else if (d > 120) { if (d < 160) go(s, e, ang, 22, dt); }
      else if (d < 150) go(s, e, ang + (Math.PI / 2) * (e.uid % 2 ? 1 : -1), 18, dt);
      if (d < 150 && e.t > 2) { e.st = "tell"; e.t = 0; }
      break;
    case "tell":
      if (e.t > 0.55) { s.spawnProj("arrow", e.x, e.y - 8, toward(e, s.p.x, s.p.y - 6), 135, 2); e.st = "idle"; e.t = 0; s.sfx("clang"); }
      break;
  }
  touch(s, e);
}

/* ------------------------------------------------------------------ Mossgate mini-boss: Rootknight Ulm (2 phases) */
function rootknight(s: Sim, e: Enemy, dt: number): void {
  const p = s.p;
  const phase2 = e.hp <= e.def.hp / 2;
  const ang = toward(e, p.x, p.y);
  if (s.bossActive !== "rootknight") { s.bossActive = "rootknight"; s.emit({ t: "music", track: "miniboss" }); }
  if (phase2 && e.c === 0) { e.c = 1; s.emit({ t: "shake", amt: 3 }); s.toast("Ulm's roots tear loose!"); s.sfx("clang"); }
  switch (e.st) {
    case "idle":
      e.face = ang; go(s, e, ang, phase2 ? 34 : 24, dt);
      if (e.t > (phase2 ? 1.2 : 1.7)) { e.st = "windup"; e.t = 0; }
      break;
    case "windup":
      if (e.t > 0.6) { e.st = "slam"; e.t = 0; ring(s, e, phase2 ? 12 : 8, 76, e.t); s.emit({ t: "shake", amt: 2 }); s.sfx("clang"); }
      break;
    case "slam":
      if (e.t > 0.5) { e.st = phase2 ? "tellcharge" : "rest"; e.t = 0; e.face = ang; }
      break;
    case "tellcharge":
      e.face = ang; e.a = ang;
      if (e.t > 0.5) { e.st = "charge"; e.t = 0; }
      break;
    case "charge":
      if (go(s, e, e.a, 120, dt) || e.t > 0.6) { e.st = "rest"; e.t = 0; s.sfx("clang"); s.emit({ t: "shake", amt: 2 }); }
      break;
    case "rest":
      if (e.t > 1.2) { e.st = "idle"; e.t = 0; }
      break;
  }
  touch(s, e);
}

/* ------------------------------------------------------------------ Mossgate boss: the Bark Warden (3 phases) */
function barkwarden(s: Sim, e: Enemy, dt: number): void {
  const p = s.p;
  const ang = toward(e, p.x, p.y);
  const ph = e.hp > e.def.hp * 0.66 ? 1 : e.hp > e.def.hp * 0.33 ? 2 : 3;
  if (s.bossActive !== "barkwarden") { s.bossActive = "barkwarden"; s.emit({ t: "music", track: s.trackFor() }); }
  if (ph !== e.c && e.c !== 0) {
    s.emit({ t: "shake", amt: 4 }); s.emit({ t: "flash" }); s.sfx("clang");
    s.toast(ph === 2 ? "The Warden's arms writhe!" : "The Warden bursts into bloom!");
    if (ph === 3) for (const [dx, dy] of [[-40, 6], [40, 6]]) { const t = s.makeEnemy("thornling", e.x + dx, e.y + dy, e.ck); s.enemies.push(t); }
    e.st = "rest"; e.t = 0;
  }
  e.c = ph;
  const sp = ph === 1 ? 16 : ph === 2 ? 22 : 28;
  switch (e.st) {
    case "idle":
      e.face = ang; go(s, e, ang, sp, dt);
      if (e.t > (ph === 3 ? 1.1 : 1.6)) { e.t = 0; const r = s.rand(); e.st = ph === 1 ? "slamtell" : ph === 2 ? (r < 0.5 ? "slamtell" : "whirl") : r < 0.34 ? "slamtell" : r < 0.67 ? "whirl" : "rushtell"; e.a = 0; e.b = 0; }
      break;
    case "slamtell":
      if (e.t > 0.8) { ring(s, e, ph === 1 ? 8 : ph === 2 ? 10 : 12, 72, ph === 2 ? 0.2 : 0); if (ph === 3) s.spawnProj("seed", e.x, e.y - 6, ang, 110, 2); s.emit({ t: "shake", amt: 2 }); s.sfx("clang"); e.st = "rest"; e.t = 0; }
      break;
    case "whirl": {
      e.a += dt * (ph === 2 ? 4.2 : 5.4);
      go(s, e, ang, 10, dt);
      const R = 38;
      for (let k = 0; k < 2; k++) {
        const bx = e.x + Math.cos(e.a + k * Math.PI) * R, by = e.y - 8 + Math.sin(e.a + k * Math.PI) * R * 0.8;
        if (Math.hypot(bx - p.x, by - (p.y - 6)) < 8) s.hurtPlayer(2, bx, by, { blockable: false });
      }
      if (e.t > 2.4) { e.st = "rest"; e.t = 0; }
      break;
    }
    case "rushtell":
      e.face = ang; e.a = ang;
      if (e.t > 0.6) { e.st = "rush"; e.t = 0; }
      break;
    case "rush":
      if (go(s, e, e.a, 130, dt) || e.t > 0.7) { e.st = "rest"; e.t = 0; s.sfx("clang"); s.emit({ t: "shake", amt: 3 }); ring(s, e, 6, 70, 0.3); }
      break;
    case "rest":
      if (e.t > (ph === 3 ? 0.9 : 1.4)) { e.st = "idle"; e.t = 0; }
      break;
  }
  if (e.st !== "rest") touch(s, e); else touch(s, e, 2);
}

function fan(s: Sim, e: Enemy, n: number, spread: number, speed: number, ang: number): void {
  for (let i = 0; i < n; i++) s.spawnProj("arrow", e.x, e.y - 8, ang + (i - (n - 1) / 2) * spread, speed, 2);
}

/* ------------------------------------------------------------------ Skyreach mini-boss: Cloudmarshal Vesk (2 phases) */
function cloudmarshal(s: Sim, e: Enemy, dt: number): void {
  const p = s.p;
  const phase2 = e.hp <= e.def.hp / 2;
  const ang = toward(e, p.x, p.y);
  const d = dist(s, e);
  if (s.bossActive !== "cloudmarshal") { s.bossActive = "cloudmarshal"; s.emit({ t: "music", track: "miniboss" }); }
  if (phase2 && e.c === 0) { e.c = 1; s.emit({ t: "shake", amt: 3 }); s.toast("Vesk whips up a gale!"); s.sfx("gust"); }
  switch (e.st) {
    case "idle":
      e.face = ang;
      if (d < 56) go(s, e, ang + Math.PI, 40, dt);
      else if (d > 100) go(s, e, ang, 30, dt);
      else go(s, e, ang + (Math.PI / 2) * (e.uid % 2 ? 1 : -1), phase2 ? 36 : 26, dt);
      if (e.t > (phase2 ? 1.2 : 1.8)) { e.st = "tell"; e.t = 0; }
      break;
    case "tell":
      e.face = ang;
      if (e.t > 0.55) { fan(s, e, phase2 ? 5 : 3, 0.26, 105, ang); e.st = phase2 ? "tellcharge" : "rest"; e.t = 0; e.a = ang; }
      break;
    case "tellcharge":
      e.face = ang; e.a = ang;
      if (e.t > 0.5) { e.st = "charge"; e.t = 0; }
      break;
    case "charge":
      if (go(s, e, e.a, 130, dt) || e.t > 0.6) { e.st = "rest"; e.t = 0; s.sfx("clang"); s.emit({ t: "shake", amt: 2 }); }
      break;
    case "rest":
      if (e.t > 1.1) { e.st = "idle"; e.t = 0; }
      break;
  }
  touch(s, e);
}

/* ------------------------------------------------------------------ Skyreach boss: Stormfinch Mol (3 phases, airborne until grounded) */
function stormfinch(s: Sim, e: Enemy, dt: number): void {
  const p = s.p;
  const ph = e.hp > e.def.hp * 0.66 ? 1 : e.hp > e.def.hp * 0.33 ? 2 : 3;
  if (s.bossActive !== "stormfinch") { s.bossActive = "stormfinch"; s.emit({ t: "music", track: s.trackFor() }); e.hx = e.x; e.hy = e.y; }
  if (e.b !== ph && e.b !== 0) { s.emit({ t: "shake", amt: 4 }); s.emit({ t: "flash" }); s.toast(ph === 2 ? "Mol shrieks and beats the air!" : "Mol is in a storm rage!"); s.sfx("gust"); }
  e.b = ph;
  const cx = 12 * TS, cy = 7.5 * TS;
  const clampX = (x: number): number => Math.max(3.4 * TS, Math.min(20.6 * TS, x));
  const clampY = (y: number): number => Math.max(3.4 * TS, Math.min(12.2 * TS, y));
  e.vis = e.st === "grounded" ? 1 : 0.82;
  switch (e.st) {
    case "idle": // start: take wing
      e.st = "aloft"; e.t = 0; break;
    case "aloft": {
      e.a += dt * (ph === 1 ? 1.1 : ph === 2 ? 1.5 : 1.9);
      const tx = cx + Math.cos(e.a) * 70, ty = cy + Math.sin(e.a) * 40;
      e.x += (tx - e.x) * Math.min(1, dt * 3); e.y += (ty - e.y) * Math.min(1, dt * 3);
      e.face = Math.atan2(p.y - e.y, p.x - e.x);
      if (e.t > (ph === 3 ? 1.4 : 2.1)) {
        e.t = 0;
        const r = s.rand();
        e.st = ph === 1 ? "tell" : ph === 2 ? (r < 0.5 ? "tell" : "volley") : r < 0.4 ? "tell" : r < 0.75 ? "volley" : "gust";
        e.hx = p.x; e.hy = p.y;
      }
      break;
    }
    case "tell":
      e.x += (e.hx - e.x) * 0.0; // hold position, shadow marks the target
      if (e.t > 0.75) { e.st = "dive"; e.t = 0; e.a = Math.atan2(e.hy - e.y, e.hx - e.x); }
      break;
    case "dive":
      e.x = clampX(e.x + Math.cos(e.a) * 170 * dt); e.y = clampY(e.y + Math.sin(e.a) * 170 * dt);
      if (Math.hypot(e.hx - e.x, e.hy - e.y) < 8 || e.t > 0.6) { e.st = "grounded"; e.t = 0; e.c = 0; s.emit({ t: "shake", amt: 3 }); s.sfx("clang"); fan(s, e, ph === 1 ? 0 : 6, Math.PI / 3, 80, 0); }
      if (e.t < 0.6) touch(s, e, 4);
      return;
    case "volley":
      e.face = Math.atan2(p.y - e.y, p.x - e.x);
      if (e.t > 0.6 && e.c === 0) { e.c = 1; fan(s, e, ph === 2 ? 5 : 7, 0.24, 100, e.face); }
      if (e.t > 1.5) { e.st = "aloft"; e.t = 0; e.c = 0; }
      break;
    case "gust":
      // a crosswind that shoves the hero and a ring of feathers
      if (e.t < 1.2) { p.x += Math.cos(e.face) * 38 * dt; p.y += Math.sin(e.face) * 38 * dt; if (Math.floor(e.t * 10) !== Math.floor((e.t - dt) * 10)) s.sfx("gust"); }
      else if (e.c === 0) { e.c = 1; for (let i = 0; i < 10; i++) s.spawnProj("arrow", e.x, e.y - 8, (i / 10) * TAU, 85, 2); }
          if (e.t > 2) { e.st = "aloft"; e.t = 0; e.c = 0; }
      break;
    case "grounded":
      if (e.t > (ph === 1 ? 2.6 : ph === 2 ? 2.0 : 1.5)) { e.st = "aloft"; e.t = 0; e.c = 0; }
      break;
  }
  if (e.st !== "grounded") touch(s, e, 2); else touch(s, e, 2);
}

/* ------------------------------------------------------------------ Final boss: Vael Orsek, the Crown-Snuffer (3 phases) */
function vael(s: Sim, e: Enemy, dt: number): void {
  const p = s.p;
  const ang = toward(e, p.x, p.y);
  const d = dist(s, e);
  const ph = e.hp > e.def.hp * 0.66 ? 1 : e.hp > e.def.hp * 0.33 ? 2 : 3;
  if (s.bossActive !== "vael") { s.bossActive = "vael"; s.emit({ t: "music", track: s.trackFor() }); e.c = 0; }
  if (ph !== e.c && e.c !== 0) {
    s.emit({ t: "shake", amt: 5 }); s.emit({ t: "flash" }); s.sfx("clang");
    s.toast(ph === 2 ? "Vael's crown flares: the Hollow answer his call!" : "Vael tears the Veil open around him!");
    if (ph === 2) for (const dx of [-44, 44]) if (s.enemies.filter((q) => q.alive && !q.def.boss).length < 4) s.enemies.push(s.makeEnemy("wisp", e.x + dx, e.y + 6, e.ck));
    if (ph === 3) ring(s, e, 14, 70, 0);
    e.st = "rest"; e.t = 0;
  }
  e.c = ph;
  const sp = ph === 1 ? 17 : ph === 2 ? 22 : 28;
  switch (e.st) {
    case "idle": {
      e.face = ang; go(s, e, ang, d > 30 ? sp : 0, dt);
      if (e.t > (ph === 3 ? 0.6 : ph === 2 ? 0.8 : 1.0)) {
        e.t = 0; const r = s.rand();
        e.st = d < 44 && r < 0.6 ? "slashtell" : ph === 1 ? (r < 0.5 ? "volley" : "slashtell") : ph === 2 ? (r < 0.34 ? "volley" : r < 0.67 ? "blink" : "slashtell") : r < 0.3 ? "volley" : r < 0.55 ? "blink" : r < 0.8 ? "burst" : "slashtell";
        e.a = ang;
      }
      break;
    }
    case "slashtell":
      e.face = ang;
      if (e.t > (ph === 3 ? 0.45 : 0.65)) {
        e.st = "rest"; e.t = 0; s.sfx("clang"); s.emit({ t: "shake", amt: 2 });
        if (d < 44 && Math.abs(Math.atan2(Math.sin(ang - Math.atan2(p.y - e.y, p.x - e.x)), 1)) < 1) s.hurtPlayer(3, e.x, e.y - 4);
        s.emit({ t: "spark", x: e.x + Math.cos(ang) * 18, y: e.y - 8 + Math.sin(ang) * 18, color: "#ff8a6a", n: 8 });
      }
      break;
    case "volley":
      e.face = ang;
      if (e.t > 0.7) { fan(s, e, ph === 3 ? 5 : 3, 0.28, ph === 3 ? 110 : 90, ang); s.sfx("arrow"); e.st = "rest"; e.t = 0; }
      break;
    case "blink":
      if (e.t > 0.4 && e.b === 0) {
        e.b = 1; const a = s.rand() * Math.PI * 2;
        const nx = p.x + Math.cos(a) * 34, ny = p.y + Math.sin(a) * 28;
        if (s.standable(Math.floor(nx / 16), Math.floor((ny - 3) / 16))) { e.x = nx; e.y = ny; }
        s.emit({ t: "spark", x: e.x, y: e.y - 8, color: "#d89aff", n: 12 });
      }
      if (e.t > 0.9) { e.b = 0; ring(s, e, ph === 3 ? 12 : 8, 66, 0.2); s.emit({ t: "shake", amt: 2 }); e.st = "rest"; e.t = 0; }
      break;
    case "burst":
      if (e.t > 0.6) { ring(s, e, 10, 60, 0); ring(s, e, 10, 90, 0.31); s.sfx("clang"); e.st = "rest"; e.t = 0; }
      break;
    case "rest":
      if (e.t > (ph === 3 ? 0.45 : 0.7)) { e.st = "idle"; e.t = 0; }
      break;
  }
  if (e.st !== "rest") touch(s, e); else touch(s, e, 2);
}
