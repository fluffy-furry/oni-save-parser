import { deepStrictEqual, equal, ok, throws } from "node:assert/strict";
import {
  ArrayDataReader,
  ArrayDataWriter,
} from "../src/binary-serializer/index.ts";
import { parse, ParseError, unparse } from "../src/parser/index.ts";
import { parseSaveGame, writeSaveGame } from "../src/index.ts";
import {
  parseSaveGame as parseSave,
  unparseSaveGame,
} from "../src/save-structure/parser.ts";
import { createCompiledTemplates } from "../src/save-structure/type-templates/compiled-templates.ts";
import { createTemplateLookup } from "../src/save-structure/type-templates/template-lookup.ts";
import {
  parseByTemplate,
  unparseByTemplate,
} from "../src/save-structure/type-templates/template-data-parser.ts";
import {
  SerializationTypeInfo as Type,
  type TypeInfo,
  type TypeTemplates,
} from "../src/save-structure/type-templates/index.ts";
import { createSaveGame } from "./fixtures/save_game.ts";

const int: TypeInfo = { info: Type.Int32 };
const user: TypeInfo = { info: Type.UserDefined, templateName: "Element" };
const struct: TypeInfo = {
  info: Type.UserDefined | Type.IS_VALUE_TYPE,
  templateName: "Element",
};
const collection = (kind: Type, element: TypeInfo): TypeInfo => ({
  info: kind === Type.Array ? kind : kind | Type.IS_GENERIC_TYPE,
  subTypes: [element],
});
const binary = (kind: Type, key: TypeInfo, value: TypeInfo): TypeInfo => ({
  info: kind | Type.IS_GENERIC_TYPE,
  subTypes: [key, value],
});

const values: { name: string; type: TypeInfo; value: unknown }[] = [
  { name: "boolean", type: { info: Type.Boolean }, value: true },
  { name: "byte", type: { info: Type.Byte }, value: 255 },
  { name: "sbyte", type: { info: Type.SByte }, value: -128 },
  { name: "int16", type: { info: Type.Int16 }, value: -32768 },
  { name: "uint16", type: { info: Type.UInt16 }, value: 65535 },
  { name: "int32", type: int, value: -2147483648 },
  { name: "uint32", type: { info: Type.UInt32 }, value: 4294967295 },
  {
    name: "int64",
    type: { info: Type.Int64 },
    value: { unsigned: false, lower: 0, upper: -2147483648 },
  },
  {
    name: "uint64",
    type: { info: Type.UInt64 },
    value: { unsigned: true, lower: -1, upper: -1 },
  },
  { name: "single", type: { info: Type.Single }, value: 1.5 },
  { name: "double", type: { info: Type.Double }, value: NaN },
  { name: "string", type: { info: Type.String }, value: "保存 🌋" },
  { name: "nullString", type: { info: Type.String }, value: null },
  {
    name: "enum",
    type: { info: Type.Enumeration, templateName: "Fixture.Enum" },
    value: -7,
  },
  { name: "vector2", type: { info: Type.Vector2 }, value: { x: -2, y: 1 } },
  { name: "vector2i", type: { info: Type.Vector2I }, value: { x: -2, y: 1 } },
  {
    name: "vector3",
    type: { info: Type.Vector3 },
    value: { x: -2, y: 1, z: 0.5 },
  },
  {
    name: "colour",
    type: { info: Type.Colour },
    value: { r: 0, g: 1, b: 128 / 255, a: 1 },
  },
  { name: "array", type: collection(Type.Array, int), value: [1, 2, 3] },
  { name: "list", type: collection(Type.List, int), value: [1, 2] },
  { name: "set", type: collection(Type.HashSet, int), value: [1, 2] },
  { name: "queue", type: collection(Type.Queue, int), value: [1, 2] },
  {
    name: "bytes",
    type: collection(Type.Array, { info: Type.Byte }),
    value: new Uint8Array([0, 128, 255]),
  },
  {
    name: "emptyBytes",
    type: collection(Type.Array, { info: Type.Byte }),
    value: new Uint8Array(),
  },
  { name: "emptyArray", type: collection(Type.Array, int), value: [] },
  { name: "nullArray", type: collection(Type.Array, int), value: null },
  {
    name: "dictionary",
    type: binary(Type.Dictionary, int, { info: Type.String }),
    value: [[1, "one"], [2, "two"]],
  },
  {
    name: "nullDictionary",
    type: binary(Type.Dictionary, int, int),
    value: null,
  },
  {
    name: "pair",
    type: binary(Type.Pair, int, { info: Type.String }),
    value: { key: 2, value: "two" },
  },
  { name: "user", type: user, value: { x: 123 } },
  { name: "nullUser", type: user, value: null },
  {
    name: "references",
    type: collection(Type.Array, user),
    value: [{ x: 3 }, null, { x: 4 }],
  },
  {
    name: "structs",
    type: collection(Type.Array, struct),
    value: [{ x: 3 }, { x: 4 }],
  },
];

const templates: TypeTemplates = [
  {
    name: "Root",
    fields: values.map(({ name, type }) => ({ name, type })),
    properties: [],
  },
  { name: "Element", fields: [{ name: "x", type: int }], properties: [] },
];
const model = Object.fromEntries(
  values.map(({ name, value }) => [name, value]),
);

function encode(
  table: TypeTemplates,
  name: string,
  value: unknown,
  compiled: boolean,
): Uint8Array {
  const writer = new ArrayDataWriter();
  const codecs = compiled ? createCompiledTemplates(table) : undefined;
  if (compiled) ok(codecs);
  unparse(
    writer,
    unparseByTemplate(table, name, value, createTemplateLookup(table), codecs),
  );
  return writer.getBytesView();
}
function decode(
  table: TypeTemplates,
  name: string,
  bytes: Uint8Array,
  compiled: boolean,
): unknown {
  const reader = new ArrayDataReader(bytes);
  const codecs = compiled ? createCompiledTemplates(table) : undefined;
  if (compiled) ok(codecs);
  const result = parse(
    reader,
    parseByTemplate(table, name, createTemplateLookup(table), codecs),
  );
  equal(reader.position, bytes.byteLength);
  return result;
}
function failure(fn: () => unknown): ParseError {
  try {
    fn();
  } catch (error) {
    ok(error instanceof ParseError);
    return error;
  }
  throw new Error("Expected a parse error");
}

Deno.test("compiled codecs match generator bytes and values across every type category", () => {
  const reference = encode(templates, "Root", model, false);
  const compiled = encode(templates, "Root", model, true);
  deepStrictEqual(compiled, reference);
  deepStrictEqual(decode(templates, "Root", reference, true), model);
  deepStrictEqual(decode(templates, "Root", compiled, false), model);
});

Deno.test("compiled nested codecs retain recursive references and first duplicate templates", () => {
  const table: TypeTemplates = [{
    name: "Node",
    fields: [{ name: "x", type: int }, {
      name: "next",
      type: { info: Type.UserDefined, templateName: "Node" },
    }],
    properties: [],
  }, { name: "Node", fields: [{ name: "wrong", type: int }], properties: [] }];
  const value = { x: 1, next: { x: 2, next: null } };
  const bytes = encode(table, "Node", value, true);
  deepStrictEqual(
    bytes,
    Uint8Array.fromHex("010000000800000002000000ffffffff"),
  );
  deepStrictEqual(decode(table, "Node", bytes, true), value);
  deepStrictEqual(bytes, encode(table, "Node", value, false));
});

Deno.test("compiled __proto__ fields remain own data and properties overwrite fields", () => {
  const table: TypeTemplates = [{
    name: "Root",
    fields: [{ name: "__proto__", type: user }, { name: "same", type: int }],
    properties: [{ name: "same", type: int }],
  }, templates[1]!];
  const value = { ["__proto__"]: { x: 12 }, same: 7 };
  const bytes = encode(table, "Root", value, true);
  deepStrictEqual(bytes, encode(table, "Root", value, false));
  const result = decode(table, "Root", bytes, true);
  ok(typeof result === "object" && result !== null);
  equal(Object.getPrototypeOf(result), Object.prototype);
  equal(Object.hasOwn(result, "__proto__"), true);
  deepStrictEqual(result, value);
});

Deno.test("empty struct arrays and null references do not resolve absent templates", () => {
  const missing: TypeInfo = {
    info: Type.UserDefined | Type.IS_VALUE_TYPE,
    templateName: "Absent",
  };
  const table: TypeTemplates = [{
    name: "Root",
    fields: [{ name: "empty", type: collection(Type.Array, missing) }, {
      name: "null",
      type: { info: Type.UserDefined, templateName: "Absent" },
    }],
    properties: [],
  }];
  const value = { empty: [], null: null };
  const bytes = encode(table, "Root", value, true);
  deepStrictEqual(bytes, encode(table, "Root", value, false));
  deepStrictEqual(decode(table, "Root", bytes, true), value);
});

Deno.test("compiled and generator failures retain the same byte offsets", () => {
  const reference = encode(templates, "Root", model, false);
  for (const length of [0, 1, 5, 15, 45, 75, reference.byteLength - 1]) {
    const bytes = reference.subarray(0, length);
    const baseline = failure(() => decode(templates, "Root", bytes, false));
    const compiled = failure(() => decode(templates, "Root", bytes, true));
    equal(compiled.dataOffset, baseline.dataOffset);
    equal(compiled.message, baseline.message);
  }
  for (
    const field of [
      "int32",
      "vector2",
      "int64",
      "bytes",
      "dictionary",
      "user",
      "string",
    ]
  ) {
    const invalid = { ...model, [field]: 1n };
    const baseline = failure(() => encode(templates, "Root", invalid, false));
    const compiled = failure(() => encode(templates, "Root", invalid, true));
    equal(compiled.dataOffset, baseline.dataOffset);
    equal(compiled.message, baseline.message);
  }
});

Deno.test("unsupported schemas fall back to generators without stale compiler state", () => {
  const table: TypeTemplates = [{
    name: "Root",
    fields: [{ name: "x", type: { info: 63 as Type } }],
    properties: [],
  }];
  equal(createCompiledTemplates(table), undefined);
  throws(() => encode(table, "Root", { x: 1 }, false), /Unknown type code/);
  table[0]!.fields[0]!.type = int;
  deepStrictEqual(
    encode(table, "Root", { x: 1 }, true),
    Uint8Array.fromHex("01000000"),
  );
});

Deno.test("compiled save operations rebuild codecs after template edits", () => {
  const save = createSaveGame();
  const before = writeSaveGame(save);
  deepStrictEqual(parseSaveGame(before), save);
  const template = save.templates.find((item) =>
    item.name === "Fixture.Behavior"
  );
  const behavior = save.gameObjects[0]?.gameObjects[0]?.behaviors[0];
  ok(template && behavior);
  template.fields.push({
    name: "added",
    type: { info: Type.Int32, templateName: undefined, subTypes: undefined },
  });
  ok(
    typeof behavior.templateData === "object" && behavior.templateData !== null,
  );
  behavior.templateData = { ...behavior.templateData, added: 123 };
  deepStrictEqual(parseSaveGame(writeSaveGame(save)), save);
});

Deno.test("interceptors retain the original instruction sequence and never see compiled callbacks", () => {
  const save = createSaveGame(true);
  const plainWriter = new ArrayDataWriter();
  const expected: string[] = [];
  const actual: string[] = [];
  const record = (target: string[]) => (instruction: unknown): unknown => {
    if (
      typeof instruction === "object" && instruction !== null &&
      "dataType" in instruction
    ) target.push(String(instruction.dataType));
    return instruction;
  };
  unparse(plainWriter, unparseSaveGame(save, false, false), record(expected));
  const bytes = writeSaveGame(save, record(actual));
  deepStrictEqual(actual, expected);
  equal(actual.includes("with"), false);
  deepStrictEqual(bytes, plainWriter.getBytes());
  expected.length = actual.length = 0;
  parse(new ArrayDataReader(bytes), parseSave({}, false), record(expected));
  deepStrictEqual(parseSaveGame(bytes, record(actual)), save);
  deepStrictEqual(actual, expected);
  equal(actual.includes("with"), false);
});

Deno.test("compiled length checks and historical nullable pair behavior match generators", () => {
  const pair = binary(Type.Pair, int, int);
  const dictionary = binary(Type.Dictionary, int, int);
  const cases: { type: TypeInfo; hex: string; fails: boolean }[] = [
    { type: pair, hex: "ffffffff", fails: false },
    { type: pair, hex: "04000000ffffffff", fails: true },
    { type: pair, hex: "000000000500000006000000", fails: false },
    { type: pair, hex: "feffffff", fails: true },
    { type: dictionary, hex: "04000000feffffff", fails: true },
    { type: collection(Type.Array, int), hex: "00000000ffffff7f", fails: true },
    { type: user, hex: "feffffff", fails: true },
    { type: user, hex: "0000000001000000", fails: true },
    { type: user, hex: "0800000001000000", fails: true },
  ];
  for (const { type, hex, fails } of cases) {
    const table: TypeTemplates = [{
      name: "Root",
      fields: [{ name: "value", type }],
      properties: [],
    }, templates[1]!];
    const bytes = Uint8Array.fromHex(hex);
    if (fails) {
      const baseline = failure(() => decode(table, "Root", bytes, false));
      const compiled = failure(() => decode(table, "Root", bytes, true));
      equal(compiled.dataOffset, baseline.dataOffset);
      equal(compiled.message, baseline.message);
    } else {
      deepStrictEqual(
        decode(table, "Root", bytes, true),
        decode(table, "Root", bytes, false),
      );
    }
  }
  const table: TypeTemplates = [{
    name: "Root",
    fields: [{ name: "value", type: pair }],
    properties: [],
  }];
  deepStrictEqual(
    encode(table, "Root", { value: null }, true),
    Uint8Array.fromHex("04000000ffffffff"),
  );
});

Deno.test("cyclic in-memory subtype graphs fall back without compiler recursion", () => {
  const cyclic: TypeInfo = { info: Type.Array };
  cyclic.subTypes = [cyclic];
  const table: TypeTemplates = [{
    name: "Root",
    fields: [{ name: "value", type: cyclic }],
    properties: [],
  }];
  equal(createCompiledTemplates(table), undefined);
  // An empty outer array is still processable by the lazy generator path.
  deepStrictEqual(
    decode(table, "Root", Uint8Array.fromHex("fcffffff00000000"), false),
    { value: [] },
  );
});
