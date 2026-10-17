// Stage 2 screenshot tour: the 8x8 overworld biomes, Mossgate Ruins, shops. Needs the dev server on URL.
import puppeteer from "puppeteer-core";
import fs from "node:fs";
const URL = process.env.URL || "http://127.0.0.1:5173/";
const OUT = "screenshots";
fs.mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", headless: "new", args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error" && !/status of 500/.test(m.text())) errors.push(m.text()); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (name) => { await page.screenshot({ path: `${OUT}/${name}.png` }); console.log("shot", name); };
const ev = (fn, ...a) => page.evaluate(fn, ...a);
await page.evaluateOnNewDocument(() => localStorage.clear());
await page.goto(URL, { waitUntil: "load" });
await page.waitForFunction(() => window.__game && window.__game.scene.isActive("title"), { timeout: 60000 });
await sleep(1000);
await page.keyboard.press("Enter");
await page.waitForFunction(() => window.__ev && window.__ev.ready, { timeout: 60000 });
await sleep(1000);
const warp = async (a, x, y, d = "down", wait = 2200) => { await ev((a, x, y, d) => window.__ev.warp(a, x, y, d), a, x, y, d); await sleep(wait); };
await ev(() => { for (const i of ["keeper_blade", "wicker_buckler", "gale_disc", "spiral_boots", "dune_gauntlet"]) window.__ev.give(i); });
for (const [name, x, y] of [
  ["27-castle-moat", 143.5, 80.5], ["28-castle-courtyard", 143.5, 100.5], ["29-kestrel-plateau", 150.5, 40.5], ["30-oasis-desert", 28.5, 150.5],
  ["31-mirewick-swamp", 90.5, 128.5], ["32-greatwater-bridge", 205.5, 142.5], ["33-heron-island", 205.5, 153.5], ["34-skyreach-spire", 205.5, 14.5],
  ["35-chasm-nook", 211.5, 34.5], ["36-quarry-rubble", 238.5, 61.5], ["37-slab-tomb", 53.5, 147.5],
]) { await warp("world", x, y); await shot(name); }
await warp("moss_a1", 12, 11, "up", 1500); await shot("38-mossgate-gate");
await warp("moss_b1", 12, 11, "up", 1500); await shot("39-mossgate-upper");
await warp("moss_c1", 12, 11, "up", 1500); await shot("40-mossgate-cellar-slabs");
await warp("moss_c3", 5, 8, "right", 1500);
await ev(() => { window.__ev.sim.hp = window.__ev.sim.maxHp; });
await sleep(2500); await shot("41-bark-warden");
await ev(() => { const s = window.__ev.sim; const e = s.enemies.find((q) => q.kind === "barkwarden"); if (e) { e.hp = 14; e.st = "whirl"; e.t = 0; } });
await sleep(900); await shot("42-bark-warden-phase3");
await warp("kestrel_outpost", 8.5, 8, "up", 1500); await shot("43-kestrel-outpost");
await warp("world", 143.5, 100.5); await ev(() => window.__ev.sim.fog.fill(255)); await page.keyboard.press("KeyM"); await sleep(900); await shot("44-world-map-8x8");
await page.keyboard.press("Escape");
console.log(errors.length ? "PAGE ERRORS:\n" + [...new Set(errors)].slice(0, 12).join("\n") : "no page errors");
await browser.close();
process.exit(errors.length ? 1 : 0);
