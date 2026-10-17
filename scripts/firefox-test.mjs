// Optional real-Firefox check (Firefox >= 129 speaks WebDriver BiDi). Launches Firefox with LibreWolf-like prefs
// (WebGL off -> Phaser Canvas renderer, resistFingerprinting, devPixelsPerPx) at 1024x487 and checks that the canvas
// fills the window and that no Text is drawn larger than its logical size. Needs a build/preview or dev server on URL.
//   FIREFOX=/usr/bin/firefox FIREFOX_PROFILE_DIR=/tmp/ff-prof URL=http://127.0.0.1:5173/ npm run browser:firefox
// (snap-packaged Firefox can only use a profile dir under ~/snap/firefox/common)
import puppeteer from "puppeteer-core";
const URL = process.env.URL || "http://127.0.0.1:5173/";
const sets = {
  "plain": {},
  "no WebGL (LibreWolf default)": { "webgl.disabled": true },
  "no WebGL + resistFingerprinting": { "webgl.disabled": true, "privacy.resistFingerprinting": true },
  "no WebGL + devPixelsPerPx 2": { "webgl.disabled": true, "layout.css.devPixelsPerPx": "2.0" },
  "WebGL + devPixelsPerPx 1.5": { "layout.css.devPixelsPerPx": "1.5" },
};
let fails = 0;
let n = 0;
for (const [name, prefs] of Object.entries(sets)) {
  const b = await puppeteer.launch({ browser: "firefox", executablePath: process.env.FIREFOX || "/usr/bin/firefox", headless: true, protocol: "webDriverBiDi", extraPrefsFirefox: prefs, userDataDir: process.env.FIREFOX_PROFILE_DIR ? `${process.env.FIREFOX_PROFILE_DIR}-${n++}` : undefined, defaultViewport: { width: 1024, height: 487 } });
  const p = await b.newPage();
  await p.goto(URL, { waitUntil: "load" });
  await p.waitForFunction(() => window.__game && window.__game.scene.isActive("title"), { timeout: 60000 });
  await new Promise((r) => setTimeout(r, 1000));
  const r = await p.evaluate(() => {
    const g = window.__game, c = document.querySelector("#game canvas").getBoundingClientRect(), v = window.__view;
    const texts = g.scene.getScene("title").children.list.filter((o) => o.type === "Text");
    const res = g.renderer.type === 1;
    return { renderer: res ? "canvas" : "webgl", dpr: devicePixelRatio, rect: [Math.round(c.width), Math.round(c.height)], tiles: [+(v.w / 16).toFixed(1), +(v.h / 16).toFixed(1)], badText: res ? texts.filter((t) => Math.abs(t.frame.cutWidth / t.frame.source.resolution - t.width) > 1.5).length : 0, inner: [innerWidth, innerHeight] };
  });
  const good = r.rect[0] === 1024 && r.rect[1] === 487 && r.tiles[0] >= 20 && r.tiles[1] >= 14 && r.badText === 0;
  console.log(good ? "ok  " : "FAIL", name, JSON.stringify(r));
  if (!good) fails++;
  await b.close();
}
process.exit(fails ? 1 : 0);
