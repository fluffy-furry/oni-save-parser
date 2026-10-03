import { deepStrictEqual, ok, throws } from "node:assert/strict";
import { deflateSync, inflateSync } from "node:zlib";
import { ArrayDataReader } from "../src/binary-serializer/index.ts";
import { parse } from "../src/parser/index.ts";
import {
  parseSaveGame,
  writeSaveGame,
  writeSaveGameStream,
} from "../src/index.ts";
import { parseHeader } from "../src/save-structure/header/parser.ts";
import { parseTemplates } from "../src/save-structure/type-templates/template-parser.ts";
import { createSaveGame } from "./fixtures/save_game.ts";

for (const compressed of [false, true]) {
  Deno.test(`save reader rejects mismatched header and body versions (${compressed})`, () => {
    const bytes = new Uint8Array(writeSaveGame(createSaveGame(compressed)));
    const reader = new ArrayDataReader(bytes);
    parse(reader, parseHeader());
    parse(reader, parseTemplates());
    const prefix = bytes.subarray(0, reader.position);
    const body = compressed
      ? inflateSync(reader.viewAllBytes())
      : reader.viewAllBytes().slice();
    const marker = new TextEncoder().encode("KSAV");
    const offset = body.findIndex((_, index) =>
      marker.every((value, relative) => body[index + relative] === value)
    );
    ok(offset >= 0);
    new DataView(body.buffer, body.byteOffset, body.byteLength).setInt32(
      offset + 8,
      38,
      true,
    );
    const invalid = new Uint8Array([
      ...prefix,
      ...(compressed ? deflateSync(body) : body),
    ]);
    for (const versionStrictness of ["minor", "major", "none"] as const) {
      throws(
        () => parseSaveGame(invalid, { versionStrictness }),
        /does not match body version/,
      );
    }
  });

  Deno.test(`save reader rejects trailing body bytes instead of dropping them (${compressed})`, () => {
    const bytes = new Uint8Array(writeSaveGame(createSaveGame(compressed)));
    const reader = new ArrayDataReader(bytes);
    parse(reader, parseHeader());
    parse(reader, parseTemplates());
    const prefix = bytes.subarray(0, reader.position);
    const body = compressed
      ? inflateSync(reader.viewAllBytes())
      : reader.viewAllBytes();
    const trailing = new Uint8Array([...body, 0xff]);
    const invalid = new Uint8Array([
      ...prefix,
      ...(compressed ? deflateSync(trailing) : trailing),
    ]);
    throws(
      () => parseSaveGame(invalid),
      /Unexpected trailing save data: 1 bytes/,
    );
    deepStrictEqual(parseSaveGame(bytes), createSaveGame(compressed));
  });
}

Deno.test("both save writers reject mismatched version metadata", () => {
  const save = createSaveGame();
  save.version.minor = 38;
  throws(() => writeSaveGame(save), /does not match body version/);
  throws(() => writeSaveGameStream(save), /does not match body version/);
});

Deno.test("save reader rejects bytes and extra members after the compressed body", () => {
  const bytes = new Uint8Array(writeSaveGame(createSaveGame(true)));
  for (const tail of [Uint8Array.of(0xff), deflateSync("extra member")]) {
    const invalid = new Uint8Array([...bytes, ...tail]);
    for (const versionStrictness of ["minor", "major", "none"] as const) {
      throws(
        () => parseSaveGame(invalid, { versionStrictness }),
        /Unexpected trailing compressed data/,
      );
    }
  }
});
