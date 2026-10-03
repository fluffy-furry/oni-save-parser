import { deepStrictEqual, equal, ok } from "node:assert/strict";
import {
  parseSaveGame,
  writeSaveGame,
  writeSaveGameStream,
} from "../src/index.ts";
import { createLatestSaveGame } from "./fixtures/latest_save.ts";
import { createSaveGame } from "./fixtures/save_game.ts";

for (const minor of [28, 31, 33, 34, 37, 38] as const) {
  for (const compressed of [false, true]) {
    Deno.test(`7.${minor} ${compressed ? "compressed" : "plain"} templates and unknown payloads round-trip`, async () => {
      const modern = minor === 37 || minor === 38;
      const save = modern
        ? createLatestSaveGame(minor, compressed)
        : createSaveGame(compressed);
      save.version.minor = save.header.gameInfo.saveMinorVersion = minor;
      const bytes = new Uint8Array(writeSaveGame(save));
      const parsed = parseSaveGame(bytes);
      deepStrictEqual(parsed, save);
      equal(parsed.version.minor, minor);
      equal(parsed.header.gameInfo.saveMinorVersion, minor);
      equal(parsed.header.gameInfo.dlcId, save.header.gameInfo.dlcId);
      deepStrictEqual(
        parsed.header.gameInfo.dlcIds,
        save.header.gameInfo.dlcIds,
      );
      deepStrictEqual(parseSaveGame(bytes, (instruction) => instruction), save);
      deepStrictEqual(
        new Uint8Array(writeSaveGame(save, (instruction) => instruction)),
        bytes,
      );
      const stream = writeSaveGameStream(save);
      const streamed = new Uint8Array(await new Response(stream).arrayBuffer());
      deepStrictEqual(parseSaveGame(streamed), save);
      const opaque = parsed.gameObjects[0]!.gameObjects[0]!.behaviors.find(
        (behavior) =>
          behavior.name ===
            (modern ? "Fixture.FutureBehavior" : "Fixture.Behavior"),
      );
      ok(opaque);
      ok(opaque.extraRaw);
      deepStrictEqual(
        new Uint8Array(opaque.extraRaw),
        new Uint8Array(modern ? [0, 255, 17, 128, 64] : [9, 8, 0, 255]),
      );
    });
  }
}
