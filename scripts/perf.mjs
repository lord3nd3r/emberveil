// Perf probe: texture memory, JS heap, and frame hitches while streaming across chunk boundaries. URL=... node scripts/perf.mjs [label]
import puppeteer from "puppeteer-core";
const URL = process.env.URL || "http://127.0.0.1:5191/";
const label = process.argv[2] || "run";
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", headless: "new", args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-precise-memory-info", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cdp = await page.createCDPSession();
await cdp.send("Performance.enable");
const heap = async () => (await cdp.send("Performance.getMetrics")).metrics.find((m) => m.name === "JSHeapUsedSize").value / 1048576;
await page.goto(URL, { waitUntil: "load" });
await page.waitForFunction(() => window.__game && window.__game.scene.isActive("title"), { timeout: 60000 });
await page.keyboard.press("Enter");
await page.waitForFunction(() => window.__ev && window.__ev.ready, { timeout: 60000 });
await sleep(1000);
await page.evaluate(() => window.__ev.warp("world", 47, 40.5, "down"));
await sleep(2500);
const texInfo = () => page.evaluate(() => {
  const list = window.__game.textures.list; let chunk = 0, all = 0, n = 0;
  for (const k of Object.keys(list)) { const s = list[k].source?.[0]; if (!s) continue; const b = s.width * s.height * 4; all += b; if (/^chunk_|^cpool_/.test(k)) { chunk += b; n++; } }
  return { chunkMB: +(chunk / 1048576).toFixed(1), allMB: +(all / 1048576).toFixed(1), chunkTex: n };
});
const idle = await texInfo();
const heapIdle = await heap();
const res = await page.evaluate(async () => {
  const sim = window.__ev.sim; const dts = []; let last = performance.now();
  const path = [[1, 0, 420], [0, 1, 300], [-1, 0, 420], [0, -1, 300]];
  for (const [dx, dy, n] of path) for (let i = 0; i < n; i++) {
    await new Promise((r) => requestAnimationFrame(r));
    const t = performance.now(); dts.push(t - last); last = t;
    const nx = sim.p.x + dx * 3, ny = sim.p.y + dy * 3;
    if (!sim.blocked(nx - 5, ny - 6, nx + 5, ny, true)) { sim.p.x = nx; sim.p.y = ny; }
  }
  dts.sort((a, b) => a - b);
  const q = (p) => dts[Math.min(dts.length - 1, Math.floor(dts.length * p))];
  const f = (v) => +v.toFixed(1);
  return { frames: dts.length, p50: f(q(0.5)), p95: f(q(0.95)), p99: f(q(0.99)), max: f(dts[dts.length - 1]), over50: dts.filter((d) => d > 50).length, over100: dts.filter((d) => d > 100).length };
});
const after = await texInfo();
const heapAfter = await heap();
console.log(JSON.stringify({ label, idle, heapIdleMB: +heapIdle.toFixed(1), after, heapAfterMB: +heapAfter.toFixed(1), stream: res }));
await browser.close();
