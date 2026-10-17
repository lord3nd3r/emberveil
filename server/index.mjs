// Emberveil account + save server. Zero runtime dependencies: node:http, node:crypto (scrypt) and node:sqlite.
// Run behind a TLS-terminating reverse proxy (see deploy/Caddyfile). Never expose this port directly.
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { DatabaseSync } from "node:sqlite";

const scrypt = promisify(crypto.scrypt);
const PROD = process.env.NODE_ENV === "production";
const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? "127.0.0.1";
const DATA_DIR = path.resolve(process.env.DATA_DIR ?? "./data");
const STATIC_DIR = process.env.STATIC_DIR ? path.resolve(process.env.STATIC_DIR) : "";
const TRUST_PROXY = process.env.TRUST_PROXY === "1";
const ORIGINS = (process.env.ORIGIN ?? (PROD ? "" : "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8787"))
  .split(",").map((s) => s.trim()).filter(Boolean);
if (PROD && ORIGINS.length === 0) throw new Error("Set ORIGIN (for example https://game.example.com) in production.");
const SECURE = PROD || process.env.COOKIE_SECURE === "1";
const COOKIE = SECURE ? "__Host-ev_sid" : "ev_sid";

const DAY = 86_400_000;
const SESSION_ABSOLUTE = 14 * DAY;
const SESSION_IDLE = 3 * DAY;
const ROTATE_EVERY = 30 * 60_000;
const SCRYPT = { N: 32768, r: 8, p: 1, keylen: 64, maxmem: 96 * 1024 * 1024 };

fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
const db = new DatabaseSync(path.join(DATA_DIR, "emberveil.db"));
db.exec(`
  PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 4000;
  CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, pw TEXT NOT NULL, created INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS sessions (id_hash TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id) ON DELETE CASCADE, csrf TEXT NOT NULL, created INTEGER NOT NULL, last_seen INTEGER NOT NULL, rotated INTEGER NOT NULL, expires INTEGER NOT NULL);
  CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
  CREATE TABLE IF NOT EXISTS saves (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, rev INTEGER NOT NULL, data TEXT NOT NULL, updated INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS throttle (k TEXT PRIMARY KEY, fails INTEGER NOT NULL, first INTEGER NOT NULL, locked_until INTEGER NOT NULL);
`);
try { fs.chmodSync(path.join(DATA_DIR, "emberveil.db"), 0o600); } catch { /* best effort */ }
const q = {
  userByEmail: db.prepare("SELECT * FROM users WHERE email = ?"),
  userById: db.prepare("SELECT * FROM users WHERE id = ?"),
  insUser: db.prepare("INSERT INTO users (id, email, name, pw, created) VALUES (?, ?, ?, ?, ?)"),
  setName: db.prepare("UPDATE users SET name = ? WHERE id = ?"),
  setPw: db.prepare("UPDATE users SET pw = ? WHERE id = ?"),
  delUser: db.prepare("DELETE FROM users WHERE id = ?"),
  insSess: db.prepare("INSERT INTO sessions (id_hash, user_id, csrf, created, last_seen, rotated, expires) VALUES (?, ?, ?, ?, ?, ?, ?)"),
  sess: db.prepare("SELECT * FROM sessions WHERE id_hash = ?"),
  touch: db.prepare("UPDATE sessions SET last_seen = ? WHERE id_hash = ?"),
  delSess: db.prepare("DELETE FROM sessions WHERE id_hash = ?"),
  delUserSess: db.prepare("DELETE FROM sessions WHERE user_id = ?"),
  purge: db.prepare("DELETE FROM sessions WHERE expires < ? OR last_seen < ?"),
  getSave: db.prepare("SELECT rev, data, updated FROM saves WHERE user_id = ?"),
  putSave: db.prepare("INSERT INTO saves (user_id, rev, data, updated) VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET rev = excluded.rev, data = excluded.data, updated = excluded.updated"),
  thr: db.prepare("SELECT * FROM throttle WHERE k = ?"),
  putThr: db.prepare("INSERT INTO throttle (k, fails, first, locked_until) VALUES (?, ?, ?, ?) ON CONFLICT(k) DO UPDATE SET fails = excluded.fails, first = excluded.first, locked_until = excluded.locked_until"),
  delThr: db.prepare("DELETE FROM throttle WHERE k = ?"),
  purgeThr: db.prepare("DELETE FROM throttle WHERE locked_until < ? AND first < ?"),
};
setInterval(() => { const n = Date.now(); q.purge.run(n, n - SESSION_IDLE); q.purgeThr.run(n, n - 15 * 60_000); }, 10 * 60_000).unref();

/* ------------------------------------------------------------ small helpers */
const b64u = (buf) => buf.toString("base64url");
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
const rand = (n) => b64u(crypto.randomBytes(n));
const eq = (a, b) => { const x = Buffer.from(String(a)); const y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

function clientIp(req) {
  if (TRUST_PROXY) {
    const xff = String(req.headers["x-forwarded-for"] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    if (xff.length) return xff[xff.length - 1]; // the hop our own proxy appended; earlier entries are client-controlled
  }
  return req.socket.remoteAddress ?? "unknown";
}

const buckets = new Map();
function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now > b.reset) { buckets.set(key, { n: 1, reset: now + windowMs }); return true; }
  b.n += 1;
  return b.n <= max;
}
setInterval(() => { const n = Date.now(); for (const [k, v] of buckets) if (n > v.reset) buckets.delete(k); }, 60_000).unref();

function secHeaders(extra = {}) {
  const h = {
    "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; media-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), accelerometer=(), gyroscope=(), fullscreen=(self)",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    ...extra,
  };
  if (SECURE) { h["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload"; h["Content-Security-Policy"] += "; upgrade-insecure-requests"; }
  return h;
}

function send(res, code, obj, headers = {}) {
  const body = JSON.stringify(obj);
  res.writeHead(code, secHeaders({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "Content-Length": Buffer.byteLength(body), ...headers }));
  res.end(body);
}

class HttpError extends Error { constructor(code, msg) { super(msg); this.code = code; } }

function readJson(req, limit) {
  return new Promise((resolve, reject) => {
    if (!/^application\/json(;|$)/i.test(req.headers["content-type"] ?? "")) return reject(new HttpError(415, "Send JSON."));
    let size = 0; const chunks = [];
    const timer = setTimeout(() => { req.destroy(); reject(new HttpError(408, "Timeout.")); }, 8000);
    req.on("data", (c) => { size += c.length; if (size > limit) { clearTimeout(timer); req.destroy(); reject(new HttpError(413, "Too large.")); } else chunks.push(c); });
    req.on("end", () => {
      clearTimeout(timer);
      try { const v = JSON.parse(Buffer.concat(chunks).toString("utf8")); if (v === null || typeof v !== "object" || Array.isArray(v)) throw new Error(); resolve(v); }
      catch { reject(new HttpError(400, "Bad request.")); }
    });
    req.on("error", () => reject(new HttpError(400, "Bad request.")));
  });
}

/* ------------------------------------------------------------ validation */
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;
const NAME = /^[\p{L}\p{N} _.'-]+$/u;
const str = (v, max) => (typeof v === "string" && v.length <= max ? v : null);
function vEmail(v) { const s = str(v, 254)?.trim().toLowerCase(); return s && EMAIL.test(s) ? s : null; }
function vName(v) { const s = str(v, 40)?.normalize("NFC").trim(); return s && s.length >= 2 && s.length <= 16 && NAME.test(s) ? s : null; }
function vPass(v) { return typeof v === "string" && v.length >= 10 && v.length <= 128 && Buffer.byteLength(v) <= 256 ? v : null; }

import { cleanSave, progressOk } from "./save.mjs";
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/* ------------------------------------------------------------ passwords */
async function hashPw(pw) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(pw.normalize("NFKC"), salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: SCRYPT.maxmem });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${b64u(salt)}$${b64u(key)}`;
}
async function verifyPw(pw, stored) {
  const [alg, N, r, p, salt, hash] = String(stored).split("$");
  if (alg !== "scrypt") return false;
  const want = Buffer.from(hash, "base64url");
  const got = await scrypt(pw.normalize("NFKC"), Buffer.from(salt, "base64url"), want.length, { N: +N, r: +r, p: +p, maxmem: SCRYPT.maxmem });
  return crypto.timingSafeEqual(got, want);
}
let dummy = null; // verified against for unknown emails so response time does not reveal which emails exist
const dummyHash = async () => (dummy ??= await hashPw("emberveil-dummy-password"));
let inflight = 0; // cap concurrent hashing so a flood cannot exhaust memory
async function withHashSlot(fn) {
  if (inflight >= 6) throw new HttpError(503, "Busy. Try again shortly.");
  inflight++;
  try { return await fn(); } finally { inflight--; }
}

/* ------------------------------------------------------------ throttle / lockout */
function lockedFor(k) { const r = q.thr.get(k); return r && r.locked_until > Date.now() ? r.locked_until - Date.now() : 0; }
function recordFail(k, limit) {
  const now = Date.now();
  let r = q.thr.get(k);
  if (!r || now - r.first > 15 * 60_000) r = { fails: 0, first: now, locked_until: 0 };
  r.fails += 1;
  if (r.fails >= limit) r.locked_until = now + Math.min(24 * 3600_000, 15 * 60_000 * 2 ** Math.min(6, r.fails - limit));
  q.putThr.run(k, r.fails, r.first, r.locked_until);
}

/* ------------------------------------------------------------ sessions */
function cookieHeader(token, maxAgeSec) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict${SECURE ? "; Secure" : ""}; Max-Age=${maxAgeSec}`;
}
function parseCookie(req) {
  for (const part of String(req.headers.cookie ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === COOKIE) return part.slice(i + 1).trim();
  }
  return "";
}
function createSession(userId) {
  const token = rand(32), csrf = rand(24), now = Date.now();
  q.insSess.run(sha(token), userId, csrf, now, now, now, now + SESSION_ABSOLUTE);
  return { token, csrf };
}
/** Returns { row, setCookie } for the request's session, creating an anonymous one when absent or expired. */
function getSession(req) {
  const token = parseCookie(req);
  const now = Date.now();
  if (token && token.length < 100) {
    const row = q.sess.get(sha(token));
    if (row && row.expires > now && now - row.last_seen < SESSION_IDLE) {
      if (row.user_id && now - row.rotated > ROTATE_EVERY) {
        const fresh = createSession(row.user_id);
        q.delSess.run(row.id_hash);
        return { row: q.sess.get(sha(fresh.token)), setCookie: cookieHeader(fresh.token, SESSION_ABSOLUTE / 1000) };
      }
      q.touch.run(now, row.id_hash);
      return { row, setCookie: null };
    }
    if (row) q.delSess.run(row.id_hash);
  }
  const fresh = createSession(null);
  return { row: q.sess.get(sha(fresh.token)), setCookie: cookieHeader(fresh.token, SESSION_ABSOLUTE / 1000) };
}
const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name, created: u.created });

function checkWrite(req, sess) {
  const origin = req.headers.origin;
  if (!origin || !ORIGINS.includes(origin)) throw new HttpError(403, "Forbidden.");
  if (req.headers["sec-fetch-site"] && !["same-origin", "none"].includes(req.headers["sec-fetch-site"]) && !(ORIGINS.includes(origin) && !PROD)) throw new HttpError(403, "Forbidden.");
  const t = req.headers["x-csrf-token"];
  if (typeof t !== "string" || !eq(t, sess.row.csrf)) throw new HttpError(403, "Forbidden.");
}

/* ------------------------------------------------------------ routes */
async function api(req, res, url) {
  const ip = clientIp(req);
  if (!rateLimit(`ip:${ip}`, 240, 60_000)) throw new HttpError(429, "Too many requests.");
  const sess = getSession(req);
  const out = (code, obj) => send(res, code, obj, sess.setCookie ? { "Set-Cookie": sess.setCookie } : {});
  const user = sess.row.user_id ? q.userById.get(sess.row.user_id) : null;
  const route = `${req.method} ${url.pathname}`;

  if (route === "GET /api/session") return out(200, { user: user ? publicUser(user) : null, csrf: sess.row.csrf });
  if (req.method === "GET" && url.pathname === "/api/save") {
    if (!user) throw new HttpError(401, "Sign in first.");
    const r = q.getSave.get(user.id);
    return out(200, r ? { rev: r.rev, updated: r.updated, save: JSON.parse(r.data) } : { rev: 0, updated: 0, save: null });
  }
  if (req.method !== "POST" && req.method !== "PUT" && req.method !== "DELETE") throw new HttpError(405, "Not allowed.");
  checkWrite(req, sess);

  if (route === "POST /api/register" || route === "POST /api/login") {
    if (!rateLimit(`auth:${ip}`, 12, 60_000)) throw new HttpError(429, "Too many attempts. Try again later.");
    const body = await readJson(req, 4096);
    const email = vEmail(body.email);
    const pw = vPass(body.password);
    const generic = new HttpError(401, "Email or password is wrong.");
    if (route === "POST /api/login") {
      if (!email || !pw) throw generic;
      if (lockedFor(`e:${email}`) || lockedFor(`i:${ip}`)) throw new HttpError(429, "Too many attempts. Try again later.");
      const u = q.userByEmail.get(email);
      const ok = await withHashSlot(async () => (u ? verifyPw(pw, u.pw) : (await verifyPw(pw, await dummyHash()), false)));
      if (!ok) { recordFail(`e:${email}`, 5); recordFail(`i:${ip}`, 25); throw generic; }
      q.delThr.run(`e:${email}`);
      q.delSess.run(sess.row.id_hash); // never reuse the pre-login session id
      const fresh = createSession(u.id);
      return send(res, 200, { user: publicUser(u), csrf: q.sess.get(sha(fresh.token)).csrf }, { "Set-Cookie": cookieHeader(fresh.token, SESSION_ABSOLUTE / 1000) });
    }
    const name = vName(body.name);
    if (!email || !pw || !name) throw new HttpError(400, "Check your name, email and password (10+ characters).");
    if (!rateLimit(`reg:${ip}`, 5, 3600_000)) throw new HttpError(429, "Too many sign-ups from here. Try later.");
    const pwHash = await withHashSlot(() => hashPw(pw));
    const id = rand(12);
    try { q.insUser.run(id, email, name, pwHash, Date.now()); }
    catch { throw new HttpError(400, "That email cannot be used."); } // same text whether taken or malformed
    q.delSess.run(sess.row.id_hash);
    const fresh = createSession(id);
    return send(res, 201, { user: publicUser(q.userById.get(id)), csrf: q.sess.get(sha(fresh.token)).csrf }, { "Set-Cookie": cookieHeader(fresh.token, SESSION_ABSOLUTE / 1000) });
  }
  if (route === "POST /api/logout") {
    q.delSess.run(sess.row.id_hash);
    const fresh = createSession(null);
    return send(res, 200, { ok: true, csrf: q.sess.get(sha(fresh.token)).csrf }, { "Set-Cookie": cookieHeader(fresh.token, SESSION_ABSOLUTE / 1000) });
  }
  if (!user) throw new HttpError(401, "Sign in first.");

  if (route === "PUT /api/save") {
    if (!rateLimit(`save:${user.id}`, 40, 60_000)) throw new HttpError(429, "Saving too fast.");
    const body = await readJson(req, 16 * 1024);
    const save = cleanSave(body.save);
    if (!save || !Number.isInteger(body.rev) || body.rev < 0) throw new HttpError(400, "Bad save.");
    const cur = q.getSave.get(user.id);
    const curRev = cur ? cur.rev : 0;
    if (body.rev !== curRev) return out(409, { error: "Out of date.", rev: curRev, save: cur ? JSON.parse(cur.data) : null });
    if (!progressOk(cur ? JSON.parse(cur.data) : null, save)) throw new HttpError(422, "Save rejected.");
    q.putSave.run(user.id, curRev + 1, JSON.stringify(save), Date.now());
    return out(200, { rev: curRev + 1, updated: Date.now() });
  }
  if (route === "POST /api/account/name") {
    const body = await readJson(req, 1024);
    const name = vName(body.name);
    if (!name) throw new HttpError(400, "Name must be 2 to 16 letters, numbers or . _ ' -");
    q.setName.run(name, user.id);
    return out(200, { user: publicUser(q.userById.get(user.id)) });
  }
  if (route === "POST /api/account/password" || route === "POST /api/account/delete") {
    if (!rateLimit(`pw:${user.id}`, 8, 15 * 60_000)) throw new HttpError(429, "Too many attempts.");
    const body = await readJson(req, 2048);
    const cur = vPass(body.password);
    if (!cur || !(await withHashSlot(() => verifyPw(cur, user.pw)))) throw new HttpError(403, "Password is wrong.");
    if (route === "POST /api/account/delete") {
      q.delUser.run(user.id);
      const fresh = createSession(null);
      return send(res, 200, { ok: true, csrf: q.sess.get(sha(fresh.token)).csrf }, { "Set-Cookie": cookieHeader(fresh.token, SESSION_ABSOLUTE / 1000) });
    }
    const next = vPass(body.newPassword);
    if (!next) throw new HttpError(400, "New password needs 10 to 128 characters.");
    q.setPw.run(await withHashSlot(() => hashPw(next)), user.id);
    q.delUserSess.run(user.id); // sign out everywhere, then issue a fresh session for this device
    const fresh = createSession(user.id);
    return send(res, 200, { ok: true, csrf: q.sess.get(sha(fresh.token)).csrf }, { "Set-Cookie": cookieHeader(fresh.token, SESSION_ABSOLUTE / 1000) });
  }
  throw new HttpError(404, "Not found.");
}

/* ------------------------------------------------------------ static files (optional; prefer Caddy/Nginx) */
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".txt": "text/plain; charset=utf-8" };
function serveStatic(req, res, url) {
  if (!STATIC_DIR || (req.method !== "GET" && req.method !== "HEAD")) throw new HttpError(404, "Not found.");
  let rel = decodeURIComponent(url.pathname);
  if (rel.includes("\0")) throw new HttpError(400, "Bad request.");
  let file = path.join(STATIC_DIR, path.normalize(rel).replace(/^([/\\])+/, ""));
  if (!file.startsWith(STATIC_DIR + path.sep) && file !== STATIC_DIR) throw new HttpError(403, "Forbidden.");
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(STATIC_DIR, "index.html");
  const ext = path.extname(file);
  const body = fs.readFileSync(file);
  const immutable = file.includes(`${path.sep}assets${path.sep}`);
  res.writeHead(200, secHeaders({ "Content-Type": TYPES[ext] ?? "application/octet-stream", "Content-Length": body.length, "Cache-Control": immutable ? "public, max-age=31536000, immutable" : "no-cache" }));
  res.end(req.method === "HEAD" ? undefined : body);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname.startsWith("/api/")) await api(req, res, url);
    else serveStatic(req, res, url);
  } catch (e) {
    if (res.headersSent) return res.destroy();
    if (e instanceof HttpError) return send(res, e.code, { error: e.message });
    console.error("error", e?.message ?? e); // never log bodies or credentials
    send(res, 500, { error: "Server error." });
  }
});
server.requestTimeout = 15_000;
server.headersTimeout = 10_000;
server.keepAliveTimeout = 5_000;
server.maxHeadersCount = 50;
server.listen(PORT, HOST, () => console.log(`emberveil server on http://${HOST}:${PORT} (${PROD ? "production" : "development"})`));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { server.close(); db.close(); process.exit(0); });
