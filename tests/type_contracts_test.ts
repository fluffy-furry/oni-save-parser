import { deepStrictEqual, equal, ok } from "node:assert/strict";
import {
  ArrayDataReader,
  ArrayDataWriter,
} from "../src/binary-serializer/index.ts";
import {
  parse,
  type ParseInterceptor,
  type ParseIterator,
  readCompressed,
  readInt32,
  unparse,
  type UnparseIterator,
  writeCompressed,
  writeInt32,
} from "../src/parser/index.ts";
import {
  AIAttributeLevelsBehavior,
  type GameObjectBehavior,
  getBehavior,
  StorageBehavior,
} from "../src/index.ts";
import taggedParser from "../src/tagger/parse-tagger.ts";
import { tagReporter } from "../src/tagger/index.ts";
import { createSaveGame } from "./fixtures/save_game.ts";

// Compile-time assertions deliberately have no runtime effect, including cases
// marked @ts-expect-error. They verify that public values do not degrade to any.
function expectType<T>(_value: T): void {}

Deno.test("tagged parsers retain full argument tuples and return types", () => {
  const tagged = taggedParser(
    (name, multiplier) => `${name}:${multiplier}`,
    (_name, _multiplier, suffix) => suffix ?? "default",
    function* (
      name: string,
      multiplier: number,
      suffix?: string,
    ): ParseIterator<{ name: string; value: number }> {
      const value: number = yield readInt32();
      return { name: `${name}${suffix ?? ""}`, value: value * multiplier };
    },
  );
  expectType<
    (
      name: string,
      multiplier: number,
      suffix?: string,
    ) => ParseIterator<{ name: string; value: number }>
  >(tagged);
  // @ts-expect-error The original parser requires a string name.
  tagged(12, 3);
  // @ts-expect-error The original parser requires the multiplier argument.
  tagged("fixture");
  // @ts-expect-error Optional arguments retain their declared types.
  tagged("fixture", 3, 4);

  const writer = new ArrayDataWriter();
  writer.writeInt32(7);
  const events: string[] = [];
  const interceptor = tagReporter(
    (tag, name) => events.push(`start:${tag}:${name}`),
    (tag, name) => events.push(`end:${tag}:${name}`),
  );
  const result = parse(
    new ArrayDataReader(writer.getBytes()),
    tagged("fixture", 3, "!"),
    interceptor,
  );
  expectType<number>(result.value);
  // @ts-expect-error Parser result fields must retain their declared type.
  expectType<string>(result.value);
  deepStrictEqual(result, { name: "fixture!", value: 21 });
  deepStrictEqual(events, ["start:fixture:3:!", "end:fixture:3:!"]);
});

Deno.test("tagged writers preserve rest parameters and non-void return values", () => {
  const tagged = taggedParser(
    "Numbers",
    function* (prefix: number, ...values: number[]): UnparseIterator<number> {
      yield writeInt32(prefix);
      for (const value of values) yield writeInt32(value);
      return values.length + 1;
    },
  );
  const writer = new ArrayDataWriter();
  const count = unparse(writer, tagged(1, 2, 3));
  expectType<number>(count);
  equal(count, 3);
  equal(writer.position, 12);
  // @ts-expect-error Rest parameters remain numeric.
  tagged(1, "2");
  // @ts-expect-error The first argument remains required.
  tagged();
});

Deno.test("compressed instructions accept generators with typed return values", () => {
  function* contents(): UnparseIterator<number> {
    yield writeInt32(42);
    return 7;
  }
  function* compressed(): UnparseIterator {
    yield writeCompressed(contents());
  }
  function* readContents(): ParseIterator<number> {
    return yield readInt32();
  }
  function* readContainer(): ParseIterator<number> {
    return yield readCompressed(readContents());
  }
  const writer = new ArrayDataWriter();
  unparse(writer, compressed());
  equal(parse(new ArrayDataReader(writer.getBytes()), readContainer()), 42);
});

Deno.test("known behavior names infer their payload while unknown data stays unknown", () => {
  const object = createSaveGame().gameObjects[0]?.gameObjects[0];
  ok(object);
  const storage: StorageBehavior = {
    name: "Storage",
    templateData: {
      onlyFetchMarkedItems: false,
      workTimeRemaining: 1,
      numberOfUses: 2,
    },
    extraData: [],
  };
  const attributes: AIAttributeLevelsBehavior = {
    name: "Klei.AI.AttributeLevels",
    templateData: {
      saveLoadLevels: [{ attributeId: "Digging", experience: 10, level: 2 }],
    },
  };
  object.behaviors.push(storage, attributes);

  const foundStorage = getBehavior(object, StorageBehavior);
  ok(foundStorage);
  expectType<StorageBehavior>(foundStorage);
  expectType<number>(foundStorage.templateData.numberOfUses);
  // @ts-expect-error A known behavior must reject unrelated template fields.
  expectType<unknown>(foundStorage.templateData.saveLoadLevels);
  equal(foundStorage, storage);

  const foundAttributes = getBehavior(object, AIAttributeLevelsBehavior);
  ok(foundAttributes);
  expectType<AIAttributeLevelsBehavior>(foundAttributes);
  // @ts-expect-error A known attribute payload is not a storage payload.
  expectType<StorageBehavior>(foundAttributes);
  equal(foundAttributes, attributes);

  const unknown = getBehavior(object, "Fixture.Behavior");
  ok(unknown);
  expectType<GameObjectBehavior>(unknown);
  // @ts-expect-error An unrecognized payload requires narrowing before property use.
  expectType<unknown>(unknown.templateData.id);
  equal(getBehavior(object, "Missing.Behavior"), undefined);
});

Deno.test("interceptors require narrowing unknown input without changing identity", () => {
  const interceptor: ParseInterceptor = (value) => {
    if (typeof value === "object" && value !== null && "dataType" in value) {
      expectType<unknown>(value.dataType);
      // @ts-expect-error An unknown field requires its own runtime narrowing.
      expectType<string>(value.dataType);
    }
    return value;
  };
  const instruction = readInt32();
  equal(interceptor(instruction), instruction);
});
