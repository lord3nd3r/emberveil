/**
 * Accounts. In production every account lives on the server (see server/index.mjs): scrypt-hashed
 * passwords, httpOnly SameSite=Strict session cookies, CSRF tokens and server-side saves. The browser never
 * sees a password hash or session token. A localStorage store remains for `npm run dev` without the
 * server, and is never used in a production build.
 */
import { setSaveSlot, setSaveHook, readSave, writeSaveLocal } from "./save";
import type { SaveV2 as SaveData } from "./sim/types";
import { settingsStore } from "./settings";

export interface Account {
  id: string;
  email: string;
  name: string;
  created: number;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export interface SaveStatus {
  mode: "server" | "local";
  state: "idle" | "saving" | "saved" | "offline" | "error" | "conflict";
  at: number;
  rev: number;
  message: string;
}

export interface AccountStore {
  readonly mode: "server" | "local";
  init(): Promise<void>;
  register(email: string, password: string, name: string): Promise<Result<Account>>;
  login(email: string, password: string): Promise<Result<Account>>;
  logout(): Promise<void>;
  current(): Account | null;
  updateName(name: string): Promise<Result<Account>>;
  changePassword(current: string, next: string): Promise<Result<null>>;
  deleteAccount(password: string): Promise<Result<null>>;
  status(): SaveStatus;
  flush(): Promise<void>;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateEmail(email: string): string | null {
  const e = email.trim();
  if (!e) return "Enter your email address.";
  if (e.length > 254 || !EMAIL.test(e)) return "That email address does not look right.";
  return null;
}

export function validatePassword(password: string): string | null {
  if (password.length < 10) return "Password needs at least 10 characters.";
  if (password.length > 128) return "Password is too long.";
  return null;
}

export function validateName(name: string): string | null {
  const n = name.trim();
  if (n.length < 2 || n.length > 16) return "Name must be 2 to 16 characters.";
  if (!/^[\p{L}\p{N} _.'-]+$/u.test(n)) return "Name has characters we cannot show.";
  return null;
}

/* ------------------------------------------------------------------ server store */

class ServerStore implements AccountStore {
  readonly mode = "server" as const;
  private user: Account | null = null;
  private csrf = "";
  private rev = 0;
  private state: SaveStatus = { mode: "server", state: "idle", at: 0, rev: 0, message: "Not signed in." };
  private timer = 0;
  private pending: SaveData | null = null;

  private async call<T>(method: string, url: string, body?: unknown): Promise<{ status: number; data: T & { error?: string } }> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (method !== "GET") headers["X-CSRF-Token"] = this.csrf;
    const res = await fetch(url, { method, headers, credentials: "same-origin", cache: "no-store", body: body === undefined ? undefined : JSON.stringify(body) });
    const data = (await res.json().catch(() => ({}))) as T & { error?: string; csrf?: string };
    if (typeof data.csrf === "string") this.csrf = data.csrf;
    return { status: res.status, data };
  }

  async init(): Promise<void> {
    const r = await this.call<{ user: Account | null; csrf: string }>("GET", "/api/session");
    if (r.status !== 200) throw new Error("session");
    this.user = r.data.user;
    setSaveHook((s) => this.queue(s));
    if (this.user) await this.begin(this.user);
  }

  private async begin(user: Account): Promise<void> {
    this.user = user;
    setSaveSlot(user.id);
    settingsStore.useAccount(user.id);
    await this.pull();
  }

  /** The server copy wins; a device-only save is uploaded once if the server has none. */
  private async pull(): Promise<void> {
    try {
      const r = await this.call<{ rev: number; updated: number; save: SaveData | null }>("GET", "/api/save");
      if (r.status !== 200) throw new Error("save");
      this.rev = r.data.rev;
      if (r.data.save) {
        writeSaveLocal(r.data.save);
        this.set("saved", "Loaded from the server.", r.data.updated || Date.now());
      } else {
        const local = readSave();
        if (local) this.queue(local);
        else this.set("idle", "No save yet.", 0);
      }
    } catch {
      this.set("offline", "Could not reach the server; playing from this device's copy.", Date.now());
    }
  }

  private set(state: SaveStatus["state"], message: string, at: number): void {
    this.state = { mode: "server", state, at, rev: this.rev, message };
  }

  private queue(s: SaveData): void {
    if (!this.user) return;
    this.pending = s;
    this.set("saving", "Saving…", this.state.at);
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => void this.flush(), 2000);
  }

  async flush(): Promise<void> {
    window.clearTimeout(this.timer);
    const save = this.pending;
    if (!save || !this.user) return;
    this.pending = null;
    try {
      const r = await this.call<{ rev: number; updated: number; save?: SaveData | null }>("PUT", "/api/save", { rev: this.rev, save });
      if (r.status === 200) {
        this.rev = r.data.rev;
        this.set("saved", "Saved to the server.", r.data.updated);
      } else if (r.status === 409 && r.data.save) {
        this.rev = r.data.rev;
        writeSaveLocal(r.data.save);
        this.set("conflict", "Another device saved newer progress. It will load next time you enter the game.", Date.now());
      } else {
        this.set("error", r.data.error ?? "The server refused this save.", Date.now());
      }
    } catch {
      this.pending = save;
      this.set("offline", "Offline. Your progress is kept on this device and will upload when the server is back.", Date.now());
      this.timer = window.setTimeout(() => void this.flush(), 15000);
    }
  }

  async register(email: string, password: string, name: string): Promise<Result<Account>> {
    const bad = validateEmail(email) ?? validatePassword(password) ?? validateName(name);
    if (bad) return { ok: false, error: bad };
    return this.enter("/api/register", { email: email.trim(), password, name: name.trim() });
  }

  async login(email: string, password: string): Promise<Result<Account>> {
    const bad = validateEmail(email);
    if (bad) return { ok: false, error: bad };
    return this.enter("/api/login", { email: email.trim(), password });
  }

  private async enter(url: string, body: unknown): Promise<Result<Account>> {
    try {
      const r = await this.call<{ user: Account }>("POST", url, body);
      if (r.status !== 200 && r.status !== 201) return { ok: false, error: r.data.error ?? "Something went wrong." };
      await this.begin(r.data.user);
      return { ok: true, value: r.data.user };
    } catch {
      return { ok: false, error: "Cannot reach the server. Check your connection." };
    }
  }

  async logout(): Promise<void> {
    await this.flush();
    try {
      await this.call("POST", "/api/logout", {});
    } catch {
      // the cookie expires on its own
    }
    this.user = null;
    setSaveSlot("");
    settingsStore.useAccount("");
  }

  current(): Account | null {
    return this.user;
  }

  async updateName(name: string): Promise<Result<Account>> {
    const bad = validateName(name);
    if (bad) return { ok: false, error: bad };
    try {
      const r = await this.call<{ user: Account }>("POST", "/api/account/name", { name: name.trim() });
      if (r.status !== 200) return { ok: false, error: r.data.error ?? "Could not change the name." };
      this.user = r.data.user;
      return { ok: true, value: r.data.user };
    } catch {
      return { ok: false, error: "Cannot reach the server." };
    }
  }

  async changePassword(current: string, next: string): Promise<Result<null>> {
    const bad = validatePassword(next);
    if (bad) return { ok: false, error: bad };
    try {
      const r = await this.call("POST", "/api/account/password", { password: current, newPassword: next });
      return r.status === 200 ? { ok: true, value: null } : { ok: false, error: r.data.error ?? "Could not change the password." };
    } catch {
      return { ok: false, error: "Cannot reach the server." };
    }
  }

  async deleteAccount(password: string): Promise<Result<null>> {
    try {
      const r = await this.call("POST", "/api/account/delete", { password });
      if (r.status !== 200) return { ok: false, error: r.data.error ?? "Could not delete the account." };
      this.user = null;
      this.pending = null;
      setSaveSlot("");
      settingsStore.useAccount("");
      return { ok: true, value: null };
    } catch {
      return { ok: false, error: "Cannot reach the server." };
    }
  }

  status(): SaveStatus {
    return { ...this.state, rev: this.rev };
  }
}

/* ------------------------------------------------------------------ local (development only) */

interface Stored extends Account {
  salt: string;
  hash: string;
}

const USERS_KEY = "emberveil-accounts-v1";
const SESSION_KEY = "emberveil-session-v1";
const toHex = (buf: ArrayBuffer | Uint8Array) => [...new Uint8Array(buf as ArrayBuffer)].map((b) => b.toString(16).padStart(2, "0")).join("");

async function pbkdf2(password: string, salt: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: enc.encode(salt), iterations: 210000, hash: "SHA-256" }, key, 256);
  return toHex(bits);
}

class LocalStore implements AccountStore {
  readonly mode = "local" as const;
  private note = "Saved on this device only (development mode).";

  private read(): Stored[] {
    try {
      return JSON.parse(localStorage.getItem(USERS_KEY) ?? "[]") as Stored[];
    } catch {
      return [];
    }
  }
  private write(list: Stored[]): void {
    localStorage.setItem(USERS_KEY, JSON.stringify(list));
  }
  private pub(u: Stored): Account {
    return { id: u.id, email: u.email, name: u.name, created: u.created };
  }
  async init(): Promise<void> {
    this.current();
  }
  private start(u: Stored): void {
    localStorage.setItem(SESSION_KEY, u.id);
    setSaveSlot(u.id);
    settingsStore.useAccount(u.id);
  }
  async register(email: string, password: string, name: string): Promise<Result<Account>> {
    const bad = validateEmail(email) ?? validatePassword(password) ?? validateName(name);
    if (bad) return { ok: false, error: bad };
    const clean = email.trim().toLowerCase();
    const users = this.read();
    if (users.some((u) => u.email === clean)) return { ok: false, error: "That email cannot be used." };
    const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
    const u: Stored = { id: toHex(crypto.getRandomValues(new Uint8Array(8))), email: clean, name: name.trim(), salt, hash: await pbkdf2(password, salt), created: Date.now() };
    users.push(u);
    this.write(users);
    this.start(u);
    return { ok: true, value: this.pub(u) };
  }
  async login(email: string, password: string): Promise<Result<Account>> {
    const bad = validateEmail(email);
    if (bad) return { ok: false, error: bad };
    const u = this.read().find((x) => x.email === email.trim().toLowerCase());
    const fail: Result<Account> = { ok: false, error: "Email or password is wrong." };
    if (!u || (await pbkdf2(password, u.salt)) !== u.hash) return fail;
    this.start(u);
    return { ok: true, value: this.pub(u) };
  }
  async logout(): Promise<void> {
    localStorage.removeItem(SESSION_KEY);
    setSaveSlot("");
    settingsStore.useAccount("");
  }
  current(): Account | null {
    const id = localStorage.getItem(SESSION_KEY);
    const u = id ? this.read().find((x) => x.id === id) : undefined;
    if (!u) return null;
    setSaveSlot(u.id);
    settingsStore.useAccount(u.id);
    return this.pub(u);
  }
  async updateName(name: string): Promise<Result<Account>> {
    const bad = validateName(name);
    const id = localStorage.getItem(SESSION_KEY);
    const users = this.read();
    const u = users.find((x) => x.id === id);
    if (bad || !u) return { ok: false, error: bad ?? "Not signed in." };
    u.name = name.trim();
    this.write(users);
    return { ok: true, value: this.pub(u) };
  }
  async changePassword(current: string, next: string): Promise<Result<null>> {
    const bad = validatePassword(next);
    if (bad) return { ok: false, error: bad };
    const id = localStorage.getItem(SESSION_KEY);
    const users = this.read();
    const u = users.find((x) => x.id === id);
    if (!u || (await pbkdf2(current, u.salt)) !== u.hash) return { ok: false, error: "Password is wrong." };
    u.salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
    u.hash = await pbkdf2(next, u.salt);
    this.write(users);
    return { ok: true, value: null };
  }
  async deleteAccount(password: string): Promise<Result<null>> {
    const id = localStorage.getItem(SESSION_KEY);
    const users = this.read();
    const u = users.find((x) => x.id === id);
    if (!u || (await pbkdf2(password, u.salt)) !== u.hash) return { ok: false, error: "Password is wrong." };
    this.write(users.filter((x) => x.id !== u.id));
    localStorage.removeItem(`emberveil-save-v1:${u.id}`);
    localStorage.removeItem(`emberveil-settings-v1:${u.id}`);
    await this.logout();
    return { ok: true, value: null };
  }
  status(): SaveStatus {
    return { mode: "local", state: "saved", at: Date.now(), rev: 0, message: this.note };
  }
  async flush(): Promise<void> {
    // local saves are written immediately
  }
}

/** Picks the server store; in development without the server it falls back to the local one. */
class Chooser implements AccountStore {
  private impl: AccountStore = new ServerStore();
  get mode(): "server" | "local" {
    return this.impl.mode;
  }
  async init(): Promise<void> {
    try {
      await this.impl.init();
    } catch (e) {
      if (!import.meta.env.DEV) throw e;
      this.impl = new LocalStore();
      await this.impl.init();
    }
  }
  register = (e: string, p: string, n: string) => this.impl.register(e, p, n);
  login = (e: string, p: string) => this.impl.login(e, p);
  logout = () => this.impl.logout();
  current = () => this.impl.current();
  updateName = (n: string) => this.impl.updateName(n);
  changePassword = (c: string, n: string) => this.impl.changePassword(c, n);
  deleteAccount = (p: string) => this.impl.deleteAccount(p);
  status = () => this.impl.status();
  flush = () => this.impl.flush();
}

export const accounts: AccountStore = new Chooser();
