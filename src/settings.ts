/** Per-device settings, with a per-account copy when someone is signed in. Plain localStorage, no secrets. */
export interface Settings {
  master: number;
  music: number;
  sfx: number;
  muted: boolean;
  reduceShake: boolean;
  reduceFlash: boolean;
  /** Calms decorative motion: level-up pillar, rings and sparkles become a still label and soft glow. */
  reduceMotion: boolean;
  textSize: 0 | 1 | 2;
  /** Floating name labels over people, gates, signs and pickups. */
  labels: "all" | "near" | "off";
  minimap: boolean;
  /** How close the camera sits: Auto picks a size from the window, Closer / Wider nudge it (always at least 20 x 14 tiles). */
  viewZoom: "auto" | "closer" | "wider";
  /** Gamepad stick dead zone, 0.05 to 0.6. */
  padDeadzone: number;
}

function prefersReducedMotion(): boolean {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
}

const DEFAULTS: Settings = { master: 0.7, music: 0.8, sfx: 0.9, muted: false, reduceShake: false, reduceFlash: false, reduceMotion: prefersReducedMotion(), textSize: 1, labels: "all", minimap: true, viewZoom: "auto", padDeadzone: 0.25 };
const KEY = "emberveil-settings-v1";

function clamp01(v: unknown, d: number): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : d;
}

function parse(raw: string | null): Settings | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Partial<Settings>;
    return {
      master: clamp01(o.master, DEFAULTS.master),
      music: clamp01(o.music, DEFAULTS.music),
      sfx: clamp01(o.sfx, DEFAULTS.sfx),
      muted: o.muted === true,
      reduceShake: o.reduceShake === true,
      reduceFlash: o.reduceFlash === true,
      reduceMotion: typeof o.reduceMotion === "boolean" ? o.reduceMotion : DEFAULTS.reduceMotion,
      textSize: o.textSize === 0 || o.textSize === 2 ? o.textSize : 1,
      labels: o.labels === "near" || o.labels === "off" ? o.labels : "all",
      minimap: o.minimap !== false,
      viewZoom: o.viewZoom === "closer" || o.viewZoom === "wider" ? o.viewZoom : "auto",
      padDeadzone: typeof o.padDeadzone === "number" && Number.isFinite(o.padDeadzone) ? Math.max(0.05, Math.min(0.6, o.padDeadzone)) : DEFAULTS.padDeadzone,
    };
  } catch {
    return null;
  }
}

class Store {
  value: Settings = { ...DEFAULTS };
  private slot = "";
  private listeners = new Set<() => void>();

  constructor() {
    try {
      const loaded = parse(localStorage.getItem(KEY));
      if (loaded) this.value = loaded;
    } catch {
      // storage blocked: keep defaults
    }
  }

  /** Switch to an account's settings (falls back to this device's current ones). */
  useAccount(id: string): void {
    this.slot = id;
    try {
      const mine = id ? parse(localStorage.getItem(`${KEY}:${id}`)) : null;
      if (mine) this.value = mine;
    } catch {
      // ignore
    }
    this.emit();
  }

  update(patch: Partial<Settings>): void {
    this.value = { ...this.value, ...patch };
    try {
      const raw = JSON.stringify(this.value);
      localStorage.setItem(KEY, raw);
      if (this.slot) localStorage.setItem(`${KEY}:${this.slot}`, raw);
    } catch {
      // ignore
    }
    this.emit();
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    this.listeners.forEach((f) => f());
  }
}

export const settingsStore = new Store();
/** Live read-only view; always reflects the latest values. */
export const settings = new Proxy({} as Settings, {
  get: (_t, k: string) => (settingsStore.value as unknown as Record<string, unknown>)[k],
});

if (import.meta.env.DEV) (window as unknown as { __settings: typeof settingsStore }).__settings = settingsStore;
