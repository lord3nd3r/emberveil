/** Node-side world loader for tests, the audit and the bot. */
import fs from "node:fs";
import path from "node:path";
import { WorldData } from "./maps";

export function nodeWorld(root = path.resolve("public/world")): WorldData {
  return new WorldData(async (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), "utf8")));
}
