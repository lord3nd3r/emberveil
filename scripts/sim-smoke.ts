import { Sim } from "../src/sim/core";
import { NO_INPUT } from "../src/sim/types";
import { nodeWorld } from "../src/sim/node";
const w = nodeWorld();
await w.init();
const s = new Sim(w);
await s.enterArea("ren_house", 8.5, 6.5, "down");
for (let i = 0; i < 120; i++) { s.step(1 / 60, { ...NO_INPUT, my: 1 }); await s.settle(); }
console.log("pos", s.p.x / 16, s.p.y / 16, s.area.id, s.mode);
