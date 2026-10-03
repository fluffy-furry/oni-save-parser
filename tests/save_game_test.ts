import { deepStrictEqual, equal, ok, throws } from "node:assert/strict";
import {
  E_VERSION_MAJOR,
  E_VERSION_MINOR,
  ParseError,
  parseSaveGame,
  progressReporter,
  tagReporter,
  writeSaveGame,
} from "../src/index.ts";
import type { ParseInterceptor } from "../src/parser/index.ts";
import { createSaveGame } from "./fixtures/save_game.ts";

for (const compressed of [false, true]) {
  const mode = compressed ? "compressed" : "uncompressed";

  Deno.test(`${mode} save preserves all templates, world bytes and behaviors`, () => {
    const original = createSaveGame(compressed);
    const encoded = writeSaveGame(original);
    const parsed = parseSaveGame(encoded);
    deepStrictEqual(parsed, original);
    deepStrictEqual(parseSaveGame(writeSaveGame(parsed)), original);
    if (!compressed) deepStrictEqual(writeSaveGame(parsed), encoded);
  });

  Deno.test(`${mode} save accepts offset byte arrays and DataViews`, () => {
    const original = createSaveGame(compressed);
    const encoded = new Uint8Array(writeSaveGame(original));
    const padded = new Uint8Array(encoded.byteLength + 23).fill(0xaa);
    padded.set(encoded, 7);
    const bytes = padded.subarray(7, 7 + encoded.byteLength);
    const view = new DataView(padded.buffer, 7, encoded.byteLength);
    deepStrictEqual(parseSaveGame(bytes), original);
    deepStrictEqual(parseSaveGame(view), original);
  });

  Deno.test(`${mode} save forwards progress and nested tags through interceptors`, () => {
    const parsedEvents = captureEvents();
    const writtenEvents = captureEvents();
    const original = createSaveGame(compressed);
    const encoded = writeSaveGame(original, writtenEvents.interceptor);
    deepStrictEqual(
      parseSaveGame(encoded, { interceptor: parsedEvents.interceptor }),
      original,
    );
    deepStrictEqual(parsedEvents.events, writtenEvents.events);
    deepStrictEqual(parsedEvents.events, [
      "start:GameObjectGroup::FixturePrefab",
      "progress:GameObjectGroup::FixturePrefab::0",
      "start:GameObjectBehavior::Fixture.Behavior",
      "end:GameObjectBehavior::Fixture.Behavior",
      "end:GameObjectGroup::FixturePrefab",
    ]);
    equal(parsedEvents.stack.length, 0);
    equal(writtenEvents.stack.length, 0);
  });

  Deno.test(`${mode} truncated save reports a parse error with an offset`, () => {
    const encoded = new Uint8Array(writeSaveGame(createSaveGame(compressed)));
    for (const length of [0, 12, encoded.length - 1]) {
      throws(() => parseSaveGame(encoded.subarray(0, length)), (error) => {
        ok(error instanceof ParseError);
        ok(Number.isInteger(error.dataOffset));
        ok(error.dataOffset >= 0);
        return true;
      });
    }
  });
}

Deno.test("unknown major save versions are rejected unless checks are disabled", () => {
  const save = createSaveGame();
  save.header.gameInfo.saveMajorVersion = save.version.major = 8;
  const encoded = writeSaveGame(save);
  for (const strictness of ["major", "minor"] as const) {
    throws(() => parseSaveGame(encoded, { versionStrictness: strictness }), {
      code: E_VERSION_MAJOR,
    });
  }
  deepStrictEqual(parseSaveGame(encoded, { versionStrictness: "none" }), save);
});

Deno.test("unknown minor save versions are rejected by default", () => {
  const save = createSaveGame();
  save.header.gameInfo.saveMinorVersion = save.version.minor = 32;
  const encoded = writeSaveGame(save);
  throws(() => parseSaveGame(encoded), { code: E_VERSION_MINOR });
  deepStrictEqual(parseSaveGame(encoded, { versionStrictness: "major" }), save);
});

Deno.test("header version zero remains uncompressed", () => {
  const save = createSaveGame();
  save.header.headerVersion = 0;
  deepStrictEqual(parseSaveGame(writeSaveGame(save)), save);
});

Deno.test("invalid save body marker is rejected", () => {
  const encoded = new Uint8Array(writeSaveGame(createSaveGame()));
  const marker = new TextEncoder().encode("KSAV");
  const offset = encoded.findIndex((_, index) =>
    marker.every((byte, relative) => encoded[index + relative] === byte)
  );
  ok(offset > 0);
  encoded[offset] = 0;
  throws(() => parseSaveGame(encoded), /Failed to parse ksav header/);
});

function captureEvents(): {
  events: string[];
  stack: string[];
  interceptor: ParseInterceptor;
} {
  const events: string[] = [];
  const stack: string[] = [];
  const progress = progressReporter((message) =>
    events.push(`progress:${message}`)
  );
  const tags = tagReporter(
    (tag, instance) => {
      const name = `${tag}::${instance}`;
      stack.push(name);
      events.push(`start:${name}`);
    },
    (tag, instance) => {
      const name = `${tag}::${instance}`;
      equal(stack.pop(), name);
      events.push(`end:${name}`);
    },
  );
  return {
    events,
    stack,
    interceptor: (instruction) => tags(progress(instruction)),
  };
}

Deno.test("unknown behavior names cannot resolve to inherited object parsers", () => {
  for (const name of ["constructor", "toString", "__proto__"]) {
    const save = createSaveGame();
    const behavior = save.gameObjects[0]?.gameObjects[0]?.behaviors[0];
    ok(behavior);
    const template = save.templates.find((entry) =>
      entry.name === behavior.name
    );
    ok(template);
    behavior.name = template.name = name;
    deepStrictEqual(parseSaveGame(writeSaveGame(save)), save);
  }
});
