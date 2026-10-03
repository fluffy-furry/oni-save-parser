import { parseSaveGame, writeSaveGame } from "../src/index.ts";
import { createSaveGame } from "../tests/fixtures/save_game.ts";

// A deterministic synthetic workload, not a claim about current game saves.
// Many templates and repeated objects exercise lookups, strings and framing.
for (const compressed of [false, true]) {
  const save = createSaveGame(compressed);
  save.templates.unshift(...Array.from({ length: 512 }, (_, index) => ({
    name: `Unused.Template${index}`,
    fields: [],
    properties: [],
  })));
  const group = save.gameObjects[0];
  if (!group?.gameObjects[0]) {
    throw new Error("Missing benchmark fixture object");
  }
  group.gameObjects = Array.from(
    { length: 1000 },
    () => structuredClone(group.gameObjects[0]!),
  );
  const terrain = new Uint8Array(1024 * 1024);
  for (let index = 0; index < terrain.length; index++) {
    terrain[index] = index * 31;
  }
  save.world.streamed = [["terrain", terrain]];
  save.simData = terrain.slice().buffer;
  const encoded = writeSaveGame(save);
  const mode = compressed ? "compressed" : "uncompressed";
  Deno.bench(
    `save parse: ${mode}, 512 templates / 1000 objects / 2 MiB`,
    () => {
      parseSaveGame(encoded);
    },
  );
  Deno.bench(
    `save write: ${mode}, 512 templates / 1000 objects / 2 MiB`,
    () => {
      writeSaveGame(save);
    },
  );
}
