import { deepStrictEqual } from "node:assert/strict";
import { inflateSync } from "node:zlib";
import { parseSaveGame, writeSaveGame } from "../src/index.ts";
import {
  LEGACY_COMPRESSED_SAVE_BASE64,
  LEGACY_UNCOMPRESSED_SAVE_BASE64,
} from "./fixtures/legacy_save.ts";
import { createSaveGame } from "./fixtures/save_game.ts";

const legacyCompressed = Uint8Array.fromBase64(LEGACY_COMPRESSED_SAVE_BASE64);
const legacyUncompressed = Uint8Array.fromBase64(
  LEGACY_UNCOMPRESSED_SAVE_BASE64,
);
// Header plus serialized type templates in the original writer's fixture.
const bodyOffset = 1095;

for (
  const [compressed, bytes] of [
    [false, legacyUncompressed],
    [true, legacyCompressed],
  ] as const
) {
  const mode = compressed ? "compressed" : "uncompressed";
  Deno.test(`reads ${mode} golden file from the original JavaScript writer`, () => {
    deepStrictEqual(parseSaveGame(bytes), createSaveGame(compressed));
  });
}

Deno.test("uncompressed writer matches original JavaScript bytes exactly", () => {
  const output = new Uint8Array(writeSaveGame(createSaveGame(false)));
  deepStrictEqual(output, legacyUncompressed);
});

Deno.test("native compression preserves the original prefix and decompressed bytes", () => {
  const output = new Uint8Array(writeSaveGame(createSaveGame(true)));
  deepStrictEqual(
    output.subarray(0, bodyOffset),
    legacyCompressed.subarray(0, bodyOffset),
  );
  deepStrictEqual(
    inflateSync(output.subarray(bodyOffset)),
    inflateSync(legacyCompressed.subarray(bodyOffset)),
  );
  deepStrictEqual(
    Uint8Array.from(inflateSync(output.subarray(bodyOffset))),
    legacyUncompressed.subarray(bodyOffset),
  );
});
