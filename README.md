# Emberveil

An original top-down action-adventure for the browser, built with Phaser 3, Vite and TypeScript. It is inspired by the feel of classic top-down adventures, but every name, character, map, sprite and piece of music in it is original. Art and audio are generated procedurally in code, so there are no borrowed assets.

## Quick start

Requires Node 22.5 or newer.

```
npm install
npm run dev          # http://localhost:5173
npm run check        # full self-check suite
```

Other scripts:

```
npm run server       # optional accounts/saves server (dev falls back to local saves without it)
npm run browser      # real-browser input test (needs the dev server and Chrome)
npm run perf         # texture memory / frame-time probe
npm run shots        # screenshot tour into screenshots/
npm run build        # production bundle in dist/
```

`npm run check` runs: banned-name check, `tsc`, mapgen determinism, a reachability/softlock audit of every chest, door, NPC, sign, warp and boss, a headless bot that plays through the game, save validation tests, XP/boss/item tests, and a server smoke test.

## Controls

WASD / arrows move. Space, J or left click: sword (hold to charge a spin). Shift, K or right click: shield. L or R: roll. Q: item (C cycles items). E or Enter: talk / open. H: Ember Tonic. M: map. Esc: menu. F10: settings. Touch: on-screen stick and buttons.

## Features

- An 8x8 region of 32x24-tile chunks (the Aurelane region): 47 areas, 100+ warps, 58 chests, 16 NPCs, 46 signs.
- Towns, a shop, side quests, a quest log and a world/dungeon map with fog of war.
- Multiple dungeons (Cistern Under-Hall, Mossgate, Skyreach Spire and more) with keys, big keys, compasses and maps.
- Six bosses with multi-phase fights, 16 enemy kinds including airborne and projectile enemies.
- Sword, spin attack, shield, roll, bow, and traversal items (Gale Disc, Spiral Boots dash, Dune Gauntlet, Ember Bow).
- XP and levels with modest perks; heart containers and life upgrades.
- Water shimmer, dark rooms lit by a lantern, 24 procedurally generated music tracks and sound effects.
- Touch controls and a settings menu.
- Optional accounts with server-side validated cloud saves; local saves otherwise.

## Status

Work in progress (version 0.2.0). Stages 0-1 (skeleton and vertical slice) are done, and Stage 2 (larger world, XP/levels, new dungeons, bosses and items, rendering polish) is largely in place. See `PROGRESS.md` for details.

## Project layout

- `src/sim/` Phaser-free simulation: movement, combat, enemies, doors/keys, quests, shop, saves, fog, map loader, data tables.
- `src/scenes/` boot, title and game scenes (chunk streaming, sprites, effects).
- `src/` art and sprite painters, HUD, menu, map view, input, audio, saves, accounts/settings/touch UI.
- `tools/mapgen.ts` generates `public/world/**` and `server/content.json`.
- `server/` optional accounts/saves server: sessions, CSRF protection, save whitelist validation, smoke test.
- `scripts/` namecheck, reachability audit, headless bot, selfcheck, screenshot and browser tests.
- `public/` generated world data and static assets.
- `screenshots/` a tour of the game.

## License

MIT, see `LICENSE`.
