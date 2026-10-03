import { deepStrictEqual, equal } from "node:assert/strict";
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

function canonicalUncompressed(): Uint8Array {
  const bytes = legacyUncompressed.slice();
  const view = new DataView(bytes.buffer);
  for (
    const [offset, oldLength, payloadLength] of [
      [1133, 38, 42],
      [1141, 2, 6],
      [1155, -4, 0],
      [1423, 50, 54],
    ] as const
  ) {
    equal(view.getInt32(offset, true), oldLength);
    view.setInt32(offset, payloadLength, true);
  }
  return bytes;
}

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

Deno.test("uncompressed writer corrects legacy collection lengths without other byte changes", () => {
  const output = new Uint8Array(writeSaveGame(createSaveGame(false)));
  deepStrictEqual(output, canonicalUncompressed());
  deepStrictEqual(parseSaveGame(output), parseSaveGame(legacyUncompressed));
});

Deno.test("native compression preserves the prefix and canonical collection payload", () => {
  const output = new Uint8Array(writeSaveGame(createSaveGame(true)));
  deepStrictEqual(
    output.subarray(0, bodyOffset),
    legacyCompressed.subarray(0, bodyOffset),
  );
  deepStrictEqual(
    Uint8Array.from(inflateSync(output.subarray(bodyOffset))),
    canonicalUncompressed().subarray(bodyOffset),
  );
  deepStrictEqual(
    Uint8Array.from(inflateSync(legacyCompressed.subarray(bodyOffset))),
    legacyUncompressed.subarray(bodyOffset),
  );
  deepStrictEqual(parseSaveGame(output), parseSaveGame(legacyCompressed));
});
