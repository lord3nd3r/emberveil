# Emberveil: build progress

Stages 0-1 (vertical slice) are complete: see the bottom of this file. Stage 2 is **nearly complete** (see the checklist).

## Stage 3 checklist: about 60% of the stated Stage 3 scope (scope cut by the user: Spire, music and the Keep/ending are the focus; items 3, 5, 6 below were partly built before the cut)

Weights: Skyreach Spire 25, music 15, allies 15, Crownwatch Keep + ending/credits 25, bot route + boss tuning 10, side quests/NPCs + audit 10.

### 1. Dungeon 3, Skyreach Spire: [x] (25/25) (authored, audited, selfcheck covered; browser/bot walk-through not yet done)
- [x] Ember Bow (equippable, 1 magic per fire arrow) + thicket terrain gate saved in `save.doors`
- [x] 17 rooms over 5 floors (foundation, gallery, library, belfry, roost), 3 small keys, crystal switch (needs a ranged strike), Belfry Key from the mini-boss, big chest, thicket-sealed great door
- [x] Mini-boss Cloudmarshal Vesk, boss Stormfinch Mol (grounded only by arrows/disc; 3 phases), heart container, quest "The Third Lamp"
- [x] Audit: thickets modelled, bow strikes crystals; selfcheck: thicket, armour rule, phases, flags
### 2. Music per biome and dungeon: [x] (15/15) (synthesised tracks are checked for existence/wiring only; nobody has listened to them yet)
- [x] 12 new procedural tracks: castle, desert, lake, mountain, plateau, moss, spire, bosswarden, bossstorm, keep, finalboss, credits (keep/finalboss/credits are ready for milestone 4)
- [x] Per-chunk music for castle/desert/lake/mountain/plateau, Mossgate and Spire rooms, boss variants via `trackFor()`
- [x] selfcheck: every chunk/room track exists with a spec
### 3. Allies that level up: [x] (15/15) Kit (bolts) and Dorn (blade), recruited by quests, level 1-5, emitLevelUp, saved in save.allies and whitelisted by the server; selfcheck covers it
### 4. Crownwatch Keep, phased final boss, ending, credits: [x] (25/25) (full check passed on the box)
- [x] Step 1: keep_a1 Keep Gate, keep_a2 Hall of Seals, keep_a3 Lantern-Crown Hall (sealed fight room); `w_keep` opens only with cisternCleared + wardenDead + stormfinchDead (comma-separated `needFlag`, also understood by the audit); Isolde starts quest "The Crown Unlit"
- [x] Step 2: Vael Orsek, 70 hp, three phases (slash/volley, blink + rings plus summoned wisps, bursts); `keep` room music, `finalboss` track while he is active
- [x] Step 3: defeat -> flag vaelDead, quest crown complete, `credits` track, scrolling credits overlay, confirm returns to free play (`endEnding`)
- [x] Step 4: audit (keep rooms, flags) and selfcheck (door barred/open, phases, flag, quest, ending, dismiss, boss damage bounds)
### 5. Bot route (Mossgate, side quests, Skyreach) and boss tuning: [~] (5/10; optional, `BOT_STAGE3=1` / `BOT_FAST=spire|keep`, not in npm run check) bot walks Kit quest, Mossgate (Warden) and the Spire in BOT_FAST mode and the full route reaches the Spire; walking to the Keep gate from the Spire is not yet solved; boss damage bounds are in selfcheck
### 6. Side quests to about 10, more NPCs, audit extension: [x] (10/10) 10 side quests, 17 NPCs; audit cross-checks quests/NPCs/allies/quest items/flags

## Stage 2 checklist: about 92% of the stated Stage 2 scope

Weights: perf 15, water/kit/dark 10, XP+levels (added mid-stage) 10, big overworld 20, items+dungeon 2 25, quests/enemies/bosses 15, audit/saves/screenshots 5.

### 1. Performance and memory: [x] (15/15)
- [x] World chunk textures baked at 2 px per unit (`CHUNK_TEX`) instead of 4: **108 MB -> 27 MB** of chunk texture for the 3x3 window
- [x] Texture pool: chunk canvases are reused and repainted in place (no GPU texture create/destroy while streaming)
- [x] Code split: `phaser` is its own chunk, the playable scene (HUD, menus, map views) is a lazy chunk
- [x] `scripts/perf.mjs` (texture MB, heap, frame times while crossing chunk borders). See the numbers in the final report / README

### 2. Water, kit NPC, dark-room lighting: [x] (10/10)
- [x] Water shimmer animation (deep, sea, lily, shallow), ~12 fps, off with "Reduce motion"
- [x] Kit placed in Emberfen (49,43)
- [x] Dark rooms: soft carved light around the hero and each brazier, warm flame glow, flicker, lantern widens it. The Reliquary of Wicks (cistern_r5) is now a dark room

### 2b. XP and levels (requested mid-stage): [x] (10/10)
- [x] Enemies, bosses and finished side quests give XP; 10 levels (`LEVEL_XP` in `src/sim/data.ts`)
- [x] Perks (modest): +1 heart of max life at level 4 and 8, +8% sword damage per level, guard (-1 half heart per hit of 2+) at level 6, -2 at level 9. Heart containers and shards stay the big gains
- [x] Grinding is optional: XP fades once you are 3+ levels above a foe's tier, bosses never fade, XP caps at level 10
- [x] HUD level + XP bar, pause menu (Items tab) shows level, XP, perks
- [x] Level-up effect: rising light pillar, three ground rings, star sparkles, screen glow, floating "LEVEL UP!", rising chime. Works for any entity via `sim.emitLevelUp(who, x, y, lvl)` (no allies exist yet). "Reduce motion" (new setting, defaults to the OS preference) turns it into a still label and soft glow; "Reduce flashing" dims the glow
- [x] SaveV2 (`xp`), SaveV1 saves migrate (client `src/sim/migrate.ts`, server `cleanSave`), server whitelist + hp-bonus rule + XP-never-decreases rule, tests in `npm run check`

### 3. 8x8 Aurelane overworld: [x] (19/20)
- [x] Size constants first (`REGION_COLS/ROWS`, fog, minimap, map view, server whitelist all derive from them); v1/v2 fog migrates into the 8x8 grid
- [x] 64 chunks (256x192 tiles) generated deterministically by `tools/mapgen.ts`; old 4x4 land keeps its coordinates, new land opens east and south
- [x] Biomes: Crownwatch Castle with a three-bridge moat (centre), northern Emberspine range with Skyreach Spire, west woods (Gloamwood/Grove), Ashglass Dunes (SW desert, oasis), Mirewick Swamp (south), Greatwater lake with Heron Island (SE), Kestrel Plateau (east) with cliffs, ramps and hop-down ledges
- [x] Caves (Quarry Cache, Sand Vault), houses (Kestrel Outpost, Pell's Hut, Nell's Pier House), sealed pockets behind bushes, bush-ring secrets, ruins, hint stones
- [x] Ember Shards: **24** = 21 chests (Cinder Heights, Quarry Cache and 19 across the new land) + 3 quest rewards (Maple, Nell, Mossa); 4 shards = 1 heart (6 hearts in total)
- [x] World map draws all 8x8 chunks (unloaded explored chunks are fetched on demand), minimap crop window, smaller wrapped chunk labels
- [ ] Not play-tested by hand: only the audit, the bot (old region), puppeteer shots and the perf probe cover the new land

### 4. Item framework, Dune Gauntlet, Spiral Boots, Mossgate Ruins: [x] (22/25)
- [x] Item framework: equippable items (C cycles, server whitelist), terrain gates are Things whose state persists in `save.doors`: slab (Gauntlet, E to lift), rubble (Boots dash), chasm tile (Boots dash up to 3 tiles)
- [x] Audit models gates (slab/rubble by owned item, dash edges across 1-3 pit tiles, quest givers that turn a quest item into an item); selfcheck unit tests for lift/dash/rubble/cycle
- [x] Mossgate Ruins: 11 rooms on 3 floors (ground, upper, cellar) with stairs, 2 small keys, a Warden's Key (from Rootknight Ulm), big chest (Dune Gauntlet), slab-sealed great door to the boss, Mossgate Map + Compass, Archivist's Folio, floor-aware dungeon map/minimap (`DUNGEONS` in data.ts)
- [x] Boss: The Bark Warden (3 phases: seed rings, spinning root arms, rush + thornling summons) drops a Heart Lamp; mini-boss Rootknight Ulm (2 phases)
- [x] Gauntlet gates: slab-sealed tomb (shard) in the dunes; Boots gates: chasm nook (shard) and rubble-sealed Quarry Cache (shard), boots come from Pell's quest (folio found in Mossgate)
- [ ] Dungeon 3 (Skyreach Spire) is only a sealed door; the Crownwatch Keep is sealed until three wardstones (stage 3)

### 5. More side quests (6), NPCs, shop tier 2, hint stones, 12 enemies, phased bosses: [x] (14/15)
- [x] Side quests: Maple's Hen, Oswin's Lantern, Pell's Folio, Ferris's Parcel, Nell's Heron Feather, Mossa's Waterskin (6) + main quests The Dark Beacon and The Second Lamp
- [x] NPCs: Pell, Garrick, Nell, Ferris, Mossa; shop tier 2 at Kestrel Outpost (tonic 26, Fenwick Stew, Ember Elixir, Mote Jar); 6 hint stones
- [x] Enemies: 14 kinds (new: thornling, plate beetle, sandskipper, mirefly, hollow archer; bosses rootknight, barkwarden) with XP/tier values
- [ ] The bot does not yet walk Mossgate or the side quests with real inputs (selfcheck covers boss phases, enemies, quests logic only partly)

### 6. Audit / bot / saves / screenshots: [x] (5/5)
- [x] `npm run check` green; audit covers 64 chunks, 29 areas, gated terrain, key softlocks; screenshots 27-44 (`node scripts/shot2.mjs`)

**Stage 2 total: about 92%.**

## Stages 0-1: vertical slice (done)
1. Skeleton, namecheck. 2. Chunked overworld (4x4 region, 13 rooms), minimap, world map. 3. Movement and combat, HUD. 4. Enemies (slime, bat, crab, wisp, soldier, Gaol-Marshal). 5. Cistern Under-Hall (8 rooms, Sluicejaw). 6. 9 NPCs, 2 side quests, shop. 7. 12 tracks, ~36 sfx. 8. Versioned saves + account sync. 9. Audit, bot, `npm run check`.
