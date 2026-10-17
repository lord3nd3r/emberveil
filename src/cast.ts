/** Shared type and colour constants. */
import { settings } from "./settings";

export const FONT = "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
/** Font size in px for the current text-size setting (drawn at logical scale; the text is rendered at high resolution). */
export function fs(): string {
  return `${[7.4, 8.4, 9.6][settings.textSize] ?? 8.4}px`;
}
export const WHITE = "#f4f1e8";
export const GOLD = "#f2c85a";
export const EMBER = "#ff8a3d";
export const DIM = "#9aa3c0";
export const GREEN = "#7fd66a";
export const RED = "#ff5a5a";
export const AQUA = "#6fd6e6";
