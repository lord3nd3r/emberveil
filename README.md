# Emberveil

An original top-down action-adventure for the browser, built with Phaser 3, Vite and TypeScript. It is inspired by the feel of classic top-down adventures, but every name, character, map, sprite and piece of music in it is original. Art and audio are generated procedurally in code, so there are no borrowed assets.

The game is complete from start to finish: explore the Aurelane region, clear three dungeons, light their lamps, and storm Crownwatch Keep to face the final boss and reach the ending.

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

`npm run check` runs: banned-name check, `tsc`, mapgen determinism, a reachability/softlock audit of every chest, door, NPC, sign, warp, boss, quest, ally and quest item, a headless bot that plays through the game, save validation tests, XP/boss/item/ally/ending tests (including boss damage-per-second bounds), and a server smoke test.

## Controls

WASD / arrows move. Space, J or left click: sword (hold to charge a spin). Shift, K or right click: shield. L or R: roll. Q: item (C cycles items). E or Enter: talk / open. H: Ember Tonic. M: map. Esc: menu. F10: settings. Touch: on-screen stick and buttons.

## Features

- A large region of 32x24-tile chunks (the Aurelane region) with towns, a shop, many interiors, chests, NPCs and signs, plus a world/dungeon map with fog of war.
- Three dungeons, each ending in a lamp: the Cistern Under-Hall, Mossgate and Skyreach Spire, with small keys, big keys, compasses, maps, switches and mini-bosses.
- A final dungeon, Crownwatch Keep, that opens only when all three lamps burn. Its boss, Vael Orsek, has three phases; defeating him plays the ending and scrolling credits, and you can keep exploring afterwards.
- Bosses with multi-phase fights (including the airborne Stormfinch Mol) and many enemy kinds, including flying and projectile enemies.
- Sword, spin attack, shield, roll, and traversal items: Gale Disc, Spiral Boots dash, Dune Gauntlet and the Ember Bow.
- XP and levels with modest perks; heart containers and life upgrades.
- Allies: Kit (light bolts) and Dorn (blade) join you by finishing their side quests, follow and fight, earn their own XP and level up.
- Four main quests and ten side quests, with a quest log.
- Water shimmer, dark rooms lit by a lantern, 24 procedurally generated music tracks and sound effects.
- Touch controls and a settings menu.
- Optional accounts with server-side validated cloud saves (progress can only move forward); local saves otherwise.

## Status

Version 0.2.0: all stages are in place (Stage 3: Skyreach Spire, Crownwatch Keep, ending, allies and quests). See `PROGRESS.md` for the development log.

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
