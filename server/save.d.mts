export const SAVE_VERSION: number;
export function cleanSave(raw: unknown): import("../src/sim/types").SaveV2 | null;
export function progressOk(prev: import("../src/sim/types").SaveV2 | null, next: import("../src/sim/types").SaveV2): boolean;
