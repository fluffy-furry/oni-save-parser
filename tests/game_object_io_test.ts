import { deepStrictEqual, equal, ok, throws } from "node:assert/strict";
import {
  ArrayDataReader,
  ArrayDataWriter,
} from "../src/binary-serializer/index.ts";
import { parse, ParseError, unparse } from "../src/parser/index.ts";
import {
  parseGameObject,
  unparseGameObject,
} from "../src/save-structure/game-objects/game-object/parser.ts";
import type { GameObject } from "../src/save-structure/game-objects/game-object/game-object.ts";
import {
  parseStorageExtraData,
  unparseStorageExtraData,
} from "../src/save-structure/game-objects/game-object-behavior/known-behaviors/storage/parser.ts";
import { createCompiledTemplates } from "../src/save-structure/type-templates/compiled-templates.ts";
import {
  parseByTemplate,
  type TemplateParser,
  type TemplateUnparser,
  unparseByTemplate,
} from "../src/save-structure/type-templates/template-data-parser.ts";
import {
  SerializationTypeInfo as Type,
  type TypeInfo,
  type TypeTemplates,
} from "../src/save-structure/type-templates/index.ts";
import { unparseSaveGame } from "../src/save-structure/parser.ts";
import { createSaveGame } from "./fixtures/save_game.ts";

const object: GameObject = {
  position: { x: -1.5, y: 2.5, z: 0 },
  rotation: { x: 0, y: 0, z: 0, w: 1 },
  scale: { x: 1, y: 1, z: 1 },
  folder: 255,
  behaviors: [],
};
const expected = Uint8Array.fromHex([
  "0000c0bf",
  "00002040",
  "00000000", // position
  "00000000",
  "00000000",
  "00000000",
  "0000803f", // rotation
  "0000803f",
  "0000803f",
  "0000803f", // scale
  "ff",
  "00000000", // folder and behavior count
].join(""));

function context(useDirectIO: boolean): TemplateParser & TemplateUnparser {
  return {
    useDirectIO,
    parseByTemplate: <T>(name: string) => parseByTemplate<T>([], name),
    unparseByTemplate: <T>(name: string, value: T) =>
      unparseByTemplate([], name, value),
  };
}
function errorFrom(action: () => unknown): ParseError {
  try {
    action();
  } catch (error) {
    ok(error instanceof ParseError);
    return error;
  }
  throw new Error("Expected a parse error");
}

Deno.test("fixed object IO matches independent transform bytes and original instructions", () => {
  for (const direct of [false, true]) {
    const writer = new ArrayDataWriter();
    const instructions: string[] = [];
    unparse(
      writer,
      unparseGameObject(object, context(direct)),
      (instruction) => {
        if (
          typeof instruction === "object" && instruction !== null &&
          "dataType" in instruction
        ) instructions.push(String(instruction.dataType));
        return instruction;
      },
    );
    deepStrictEqual(writer.getBytesView(), expected);
    deepStrictEqual(
      parse(new ArrayDataReader(expected), parseGameObject(context(direct))),
      object,
    );
    deepStrictEqual(
      instructions,
      direct
        ? ["with"]
        : [...new Array<string>(10).fill("single"), "byte", "int-32"],
    );
  }
});

Deno.test("direct object reads retain exact truncation offsets and count errors", () => {
  for (let length = 0; length < expected.byteLength; length++) {
    const bytes = expected.subarray(0, length);
    const slow = errorFrom(() =>
      parse(new ArrayDataReader(bytes), parseGameObject(context(false)))
    );
    const fast = errorFrom(() =>
      parse(new ArrayDataReader(bytes), parseGameObject(context(true)))
    );
    equal(fast.dataOffset, slow.dataOffset);
    equal(fast.message, slow.message);
  }
  const invalid = expected.slice();
  new DataView(invalid.buffer).setInt32(41, -1, true);
  for (const direct of [false, true]) {
    const error = errorFrom(() =>
      parse(new ArrayDataReader(invalid), parseGameObject(context(direct)))
    );
    equal(error.dataOffset, 45);
    ok(error.cause instanceof RangeError);
  }
});

Deno.test("nested storage objects inherit the direct IO context", () => {
  const stored = [{ ...object, name: "Stored.Item" }];
  const writer = new ArrayDataWriter();
  unparse(writer, unparseStorageExtraData(stored, context(false)));
  const expectedBytes = writer.getBytesView();
  const directWriter = new ArrayDataWriter();
  let callbackCount = 0;
  unparse(
    directWriter,
    unparseStorageExtraData(stored, context(true)),
    (instruction) => {
      if (
        typeof instruction === "object" && instruction !== null &&
        "dataType" in instruction && instruction.dataType === "with"
      ) callbackCount++;
      return instruction;
    },
  );
  equal(callbackCount, 1);
  deepStrictEqual(directWriter.getBytesView(), expectedBytes);
  deepStrictEqual(
    parse(
      new ArrayDataReader(expectedBytes),
      parseStorageExtraData(context(true)),
    ),
    stored,
  );
});

Deno.test("object and simulation byte counts reject signed32 overflow without allocation", () => {
  const invalid: GameObject = {
    ...object,
    behaviors: { length: 0x80000000 } as unknown as GameObject["behaviors"],
  };
  for (const direct of [false, true]) {
    const writer = new ArrayDataWriter();
    const error = errorFrom(() =>
      unparse(writer, unparseGameObject(invalid, context(direct)))
    );
    equal(error.dataOffset, 41);
    ok(error.cause instanceof RangeError);
  }
  const save = createSaveGame();
  save.simData = { byteLength: 0x80000000 } as ArrayBuffer;
  const error = errorFrom(() =>
    unparse(new ArrayDataWriter(), unparseSaveGame(save, true, true))
  );
  ok(error.cause instanceof RangeError);
  ok(error.message.includes("Simulation data byte"));
});

Deno.test("every compiled frame rejects signed32 length overflow before backpatching", () => {
  class VirtualLargeWriter extends ArrayDataWriter {
    private extra = 0;
    override get position(): number {
      return super.position + this.extra;
    }
    override writeByte(value: number): void {
      super.writeByte(value);
      this.extra += 0x80000010;
    }
    override writeBytes(value: ArrayBuffer | ArrayBufferView): void {
      super.writeBytes(value);
      this.extra += 0x80000010;
    }
    override replaceInt32(): void {
      throw new Error("Overflow must be rejected before backpatching");
    }
  }
  const byte: TypeInfo = { info: Type.Byte };
  const cases: { type: TypeInfo; value: unknown }[] = [
    {
      type: { info: Type.UserDefined, templateName: "Child" },
      value: { x: 1 },
    },
    {
      type: { info: Type.Array, subTypes: [byte] },
      value: new Uint8Array([1]),
    },
    {
      type: { info: Type.Pair | Type.IS_GENERIC_TYPE, subTypes: [byte, byte] },
      value: { key: 1, value: 2 },
    },
    {
      type: {
        info: Type.Dictionary | Type.IS_GENERIC_TYPE,
        subTypes: [byte, byte],
      },
      value: [[1, 2]],
    },
  ];
  for (const { type, value } of cases) {
    const table: TypeTemplates = [
      { name: "Root", fields: [{ name: "value", type }], properties: [] },
      { name: "Child", fields: [{ name: "x", type: byte }], properties: [] },
    ];
    const codec = createCompiledTemplates(table)?.get("Root");
    ok(codec);
    throws(() => codec.write(new VirtualLargeWriter(), { value }), RangeError);
  }
});
