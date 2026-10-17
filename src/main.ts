import Phaser from "phaser";
import "./style.css";
import { accounts } from "./accounts";
import { applyView, measure, setViewZoomPref, view, watchView } from "./gfx";
import { initGamepad } from "./gamepad";
import { settings, settingsStore } from "./settings";
import { BootScene } from "./scenes/boot";
import { TitleScene } from "./scenes/title";
import { initSettingsUI } from "./settingsui";
import { initTouch } from "./touch";

async function start(): Promise<void> {
  try { await accounts.init(); } catch { /* offline guest: the title screen still works with this device's save */ }
  setViewZoomPref(settings.viewZoom);
  measure();
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: "game",
    width: view.pw,
    height: view.ph,
    backgroundColor: "#06061a",
    scale: { mode: Phaser.Scale.NONE, zoom: 1 / view.dpr },
    render: { antialias: true, roundPixels: false },
    input: { activePointers: 3 },
    scene: [BootScene, TitleScene],
  });
  applyView(game, true);
  watchView(game);
  // "View zoom" setting (also fires when an account's settings load)
  settingsStore.subscribe(() => { if (setViewZoomPref(settings.viewZoom)) applyView(game, true); });
  initGamepad(game);
  initSettingsUI(game);
  initTouch(game);
  (window as unknown as { __game: Phaser.Game }).__game = game;
  (window as unknown as { __view: typeof view }).__view = view;
}
void start();
