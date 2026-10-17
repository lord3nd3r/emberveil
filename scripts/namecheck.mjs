// Fails when original-name rules are broken: scans shipped sources and data for banned third-party names.
// PLAN.md / PLAN.orig.md are reference notes and are not scanned. Run: npm run namecheck
import fs from "node:fs";
import path from "node:path";

const ROOTS = ["src", "tools", "scripts", "server", "public/world", "index.html", "package.json"];
const SKIP_FILES = new Set(["namecheck.mjs"]);
// case-insensitive terms
const BANNED_I = [
  "zelda", "hyrule", "ganon", "ganondorf", "triforce", "master sword", "hylia", "kakariko", "agahnim", "moldorm", "helmasaur", "arrghus",
  "mothula", "kholdstare", "vitreous", "trinexx", "pegasus", "epona", "navi", "impa", "sheikah", "gerudo", "zora", "goron", "korok", "deku",
  "octorok", "moblin", "lynel", "bokoblin", "tingle", "nayru", "farore", "death mountain", "lost woods", "skull woods", "eastern palace",
  "tower of hera", "turtle rock", "misery mire", "ganon's tower", "dark world", "light world", "nintendo", "hookshot", "rupee", "magic cape",
  "cane of", "fire rod", "ice rod", "moon pearl", "pendant of", "heart piece", "piece of heart", "heart container", "ocarina", "great fairy",
];
// case-sensitive whole words
const BANNED_CS = ["Link", "Din", "Ganon", "Hylian", "Rupees"];
// allowlist: phrases that legitimately contain a banned substring in our own naming
const ALLOW = [/Heart Container/g, /heart_container/g, /heartContainer/g, /heart_piece/g, /heartPiece/g, /Heart piece/g, /heart piece/g, /Heart Lamp/g, /Heart container/g, /heart container/g];

const hits = [];
function scan(file) {
  if (SKIP_FILES.has(path.basename(file))) return;
  let text = fs.readFileSync(file, "utf8");
  for (const a of ALLOW) text = text.replace(a, (m) => " ".repeat(m.length));
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    const low = line.toLowerCase();
    for (const t of BANNED_I) {
      // word-ish match, so "navigate" does not trip "navi"
      const re = new RegExp(`(^|[^a-z])${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z])`);
      if (re.test(low)) hits.push(`${file}:${i + 1}: banned name "${t}"`);
    }
    for (const t of BANNED_CS) if (new RegExp(`(^|[^A-Za-z])${t}($|[^A-Za-z])`).test(line)) hits.push(`${file}:${i + 1}: banned name "${t}"`);
  });
}
function walk(p) {
  if (!fs.existsSync(p)) return;
  const st = fs.statSync(p);
  if (st.isDirectory()) { for (const f of fs.readdirSync(p)) walk(path.join(p, f)); return; }
  if (/\.(ts|mjs|js|json|html|css|md|txt)$/.test(p)) scan(p);
}
for (const r of ROOTS) walk(r);
if (hits.length) {
  console.error(hits.slice(0, 40).join("\n"));
  console.error(`namecheck FAILED: ${hits.length} banned-name hit(s)`);
  process.exit(1);
}
console.log("namecheck OK: no banned names in src, tools, scripts, server, public/world");
