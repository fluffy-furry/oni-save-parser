import { deepStrictEqual, equal, match, ok, throws } from "node:assert/strict";
import {
  ArrayDataReader,
  ArrayDataWriter,
} from "../src/binary-serializer/index.ts";
import {
  parse,
  ParseError,
  type ParseIterator,
  readInt32,
  unparse,
  type UnparseIterator,
  writeInt32,
} from "../src/parser/index.ts";
import { validateCollectionCount } from "../src/save-structure/collection-count.ts";
import {
  parseGameObjects,
  unparseGameObjects,
} from "../src/save-structure/game-objects/parser.ts";
import { parseGameObjectGroup } from "../src/save-structure/game-objects/game-object-group/parser.ts";
import { parseGameObject } from "../src/save-structure/game-objects/game-object/parser.ts";
import type { GameObject } from "../src/save-structure/game-objects/game-object/game-object.ts";
import {
  parseModifiersExtraData,
  unparseModifiersExtraData,
} from "../src/save-structure/game-objects/game-object-behavior/known-behaviors/modifiers/parser.ts";
import {
  parseMinionModifiersExtraData,
  unparseMinionModifiersExtraData,
} from "../src/save-structure/game-objects/game-object-behavior/known-behaviors/minion-modifiers/parser.ts";
import {
  parseStorageExtraData,
  unparseStorageExtraData,
} from "../src/save-structure/game-objects/game-object-behavior/known-behaviors/storage/parser.ts";
import type {
  TemplateParser,
  TemplateUnparser,
} from "../src/save-structure/type-templates/template-data-parser.ts";

const templates: TemplateParser & TemplateUnparser = {
  *parseByTemplate<T>(): ParseIterator<T> {
    return { value: yield readInt32() } as T;
  },
  *unparseByTemplate<T>(_name: string, data: T): UnparseIterator {
    yield writeInt32((data as { value: number }).value);
  },
};

function writeObjectHeader(writer: ArrayDataWriter): void {
  writer.writeVector3({ x: 0, y: 0, z: 0 });
  writer.writeQuaternion({ x: 0, y: 0, z: 0, w: 1 });
  writer.writeVector3({ x: 1, y: 1, z: 1 });
  writer.writeByte(0);
}

interface CountCase {
  name: string;
  parser(): ParseIterator<unknown>;
  prefix?(writer: ArrayDataWriter): void;
  suffix?(writer: ArrayDataWriter): void;
}

const cases: CountCase[] = [
  { name: "object groups", parser: () => parseGameObjects(templates) },
  {
    name: "object instances",
    parser: () => parseGameObjectGroup(templates),
    prefix: (writer) => writer.writeKleiString("TestPrefab"),
    suffix: (writer) => writer.writeInt32(0),
  },
  {
    name: "object behaviors",
    parser: () => parseGameObject(templates),
    prefix: writeObjectHeader,
  },
  {
    name: "modifier amounts",
    parser: () => parseModifiersExtraData(templates),
  },
  {
    name: "modifier diseases",
    parser: () => parseModifiersExtraData(templates),
    prefix: (writer) => writer.writeInt32(0),
  },
  {
    name: "minion modifier amounts",
    parser: () => parseMinionModifiersExtraData(templates),
  },
  {
    name: "minion modifier sicknesses",
    parser: () => parseMinionModifiersExtraData(templates),
    prefix: (writer) => writer.writeInt32(0),
  },
  { name: "stored objects", parser: () => parseStorageExtraData(templates) },
];

for (const testCase of cases) {
  Deno.test(`${testCase.name} reject negative and enormous truncated counts`, () => {
    for (const count of [-1, -2147483648, 2147483647]) {
      const writer = new ArrayDataWriter();
      testCase.prefix?.(writer);
      writer.writeInt32(count);
      const countEnd = writer.position;
      testCase.suffix?.(writer);
      const reader = new ArrayDataReader(writer.getBytesView());
      throws(() => parse(reader, testCase.parser()), (error: unknown) => {
        ok(error instanceof ParseError);
        ok(error.cause instanceof RangeError);
        equal(error.dataOffset, count < 0 ? countEnd : writer.position);
        match(
          error.message,
          count < 0
            ? /count must be a non-negative 32-bit integer/
            : /Buffer length exceeded/,
        );
        return true;
      });
    }
  });
}

Deno.test("collection validation accepts the complete nonnegative int32 range", () => {
  for (const count of [0, 1, 1000000, 2147483647]) {
    equal(validateCollectionCount(count, "Example"), count);
  }
  for (const count of [-1, 0.5, NaN, Infinity, 2147483648]) {
    throws(() => validateCollectionCount(count, "Example"), RangeError);
  }
});

function gameObject(folder: number): GameObject {
  return {
    position: { x: folder, y: 2, z: 3 },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    scale: { x: 1, y: 1, z: 1 },
    folder,
    behaviors: [
      {
        name: "FirstBehavior",
        templateData: { value: folder },
        extraData: undefined,
        extraRaw: undefined,
      },
      {
        name: "SecondBehavior",
        templateData: { value: folder + 1 },
        extraData: undefined,
        extraRaw: undefined,
      },
    ],
  };
}

function roundTrip<T>(
  value: T,
  write: UnparseIterator,
  read: ParseIterator<T>,
): void {
  const writer = new ArrayDataWriter();
  unparse(writer, write);
  const reader = new ArrayDataReader(writer.getBytesView());
  deepStrictEqual(parse(reader, read), value);
  equal(reader.position, writer.position);
}

Deno.test("incremental collection decoding preserves object, behavior and storage order", () => {
  const groups = [
    { name: "FirstPrefab", gameObjects: [gameObject(1), gameObject(2)] },
    { name: "EmptyPrefab", gameObjects: [] },
    { name: "LastPrefab", gameObjects: [gameObject(3)] },
  ];
  roundTrip(
    groups,
    unparseGameObjects(groups, templates),
    parseGameObjects(templates),
  );
  const storage = [
    { name: "StoredFirst", ...gameObject(4) },
    { name: "StoredSecond", ...gameObject(5) },
  ];
  roundTrip(
    storage,
    unparseStorageExtraData(storage, templates),
    parseStorageExtraData(templates),
  );
});

Deno.test("incremental modifier decoding preserves amount order and empty collections", () => {
  const amounts = [
    { name: "FirstAmount", value: { value: 12 } },
    { name: "SecondAmount", value: { value: 34 } },
  ];
  const modifiers = { amounts, diseases: [] };
  roundTrip(
    modifiers,
    unparseModifiersExtraData(modifiers, templates),
    parseModifiersExtraData(templates),
  );
  const minionModifiers = { amounts, sicknesses: [] };
  roundTrip(
    minionModifiers,
    unparseMinionModifiersExtraData(minionModifiers, templates),
    parseMinionModifiersExtraData(templates),
  );
});
