import Phaser from "phaser";

export type VName = "up" | "down" | "left" | "right" | "confirm" | "cancel" | "attack" | "dodge" | "item" | "map" | "menu" | "tonic";

/** Virtual input fed by the on-screen touch controls; Controls merges it with the keyboard. */
export const vin = {
  held: { up: false, down: false, left: false, right: false } as Record<"up" | "down" | "left" | "right", boolean>,
  /** analog stick, -1..1 */
  axis: { x: 0, y: 0 },
  /** buttons that are held rather than tapped */
  hold: { attack: false, shield: false },
  queue: { up: 0, down: 0, left: 0, right: 0, confirm: 0, cancel: 0, attack: 0, dodge: 0, item: 0, map: 0, menu: 0, tonic: 0 } as Record<VName, number>,
  press(n: VName): void {
    this.queue[n] = Math.min(3, this.queue[n] + 1);
  },
};

export function vtap(n: VName): Tap {
  return {
    pressed() {
      if (vin.queue[n] <= 0) return false;
      vin.queue[n] -= 1;
      return true;
    },
    stop() {
      // nothing to detach
    },
  };
}

/** Remember a key tap until the next update, so a short press is not lost between frames. */
export function tap(key: Phaser.Input.Keyboard.Key): { pressed(): boolean; stop(): void } {
  let queued = false;
  const onDown = () => {
    queued = true;
  };
  key.on("down", onDown);
  return {
    pressed() {
      const hit = queued;
      queued = false;
      return hit;
    },
    stop() {
      key.off("down", onDown);
    },
  };
}

export interface Tap {
  pressed(): boolean;
  stop(): void;
}



/** Consumes one queued virtual press, if any. */
export function takeV(n: VName): boolean {
  if (vin.queue[n] <= 0) return false;
  vin.queue[n] -= 1;
  return true;
}
