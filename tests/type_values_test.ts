import { deepStrictEqual, equal, ok, throws } from "node:assert/strict";
import {
  ArrayDataReader,
  ArrayDataWriter,
} from "../src/binary-serializer/index.ts";
import { parse, unparse } from "../src/parser/index.ts";
import {
  parseByType,
  unparseByType,
} from "../src/save-structure/type-templates/type-data-parser.ts";
import {
  SerializationTypeInfo as Type,
  type TypeInfo,
  type TypeTemplates,
} from "../src/save-structure/type-templates/index.ts";

function encode(
  value: unknown,
  info: TypeInfo,
  templates: TypeTemplates = [],
): Uint8Array {
  const writer = new ArrayDataWriter();
  unparse(writer, unparseByType(value, info, templates));
  return writer.getBytesView();
}

function decode(
  hex: string,
  info: TypeInfo,
  templates: TypeTemplates = [],
): unknown {
  const bytes = Uint8Array.fromHex(hex);
  const reader = new ArrayDataReader(bytes);
  const value = parse(reader, parseByType(info, templates));
  equal(reader.position, bytes.byteLength, "all bytes should be consumed");
  return value;
}

// Literal little-endian fixtures independently specify every primitive layout;
// decoding known bytes and encoding known values are tested separately.
const primitiveCases = [
  { name: "signed byte", type: Type.SByte, value: -128, hex: "80" },
  { name: "unsigned byte", type: Type.Byte, value: 255, hex: "ff" },
  { name: "true", type: Type.Boolean, value: true, hex: "01" },
  { name: "false", type: Type.Boolean, value: false, hex: "00" },
  { name: "signed 16-bit", type: Type.Int16, value: -32768, hex: "0080" },
  { name: "unsigned 16-bit", type: Type.UInt16, value: 65535, hex: "ffff" },
  {
    name: "signed 32-bit",
    type: Type.Int32,
    value: -2147483648,
    hex: "00000080",
  },
  {
    name: "unsigned 32-bit",
    type: Type.UInt32,
    value: 4294967295,
    hex: "ffffffff",
  },
  {
    name: "signed 64-bit",
    type: Type.Int64,
    value: { unsigned: false, lower: 0, upper: -2147483648 },
    hex: "0000000000000080",
  },
  {
    name: "unsigned 64-bit",
    type: Type.UInt64,
    value: { unsigned: true, lower: -1, upper: -1 },
    hex: "ffffffffffffffff",
  },
  { name: "single", type: Type.Single, value: 1.5, hex: "0000c03f" },
  { name: "double", type: Type.Double, value: -2.5, hex: "00000000000004c0" },
  { name: "UTF-8 string", type: Type.String, value: "é", hex: "02000000c3a9" },
  { name: "empty string", type: Type.String, value: "", hex: "00000000" },
  { name: "null string", type: Type.String, value: null, hex: "ffffffff" },
  { name: "enumeration", type: Type.Enumeration, value: -7, hex: "f9ffffff" },
  {
    name: "integer vector",
    type: Type.Vector2I,
    value: { x: -1, y: 2 },
    hex: "ffffffff02000000",
  },
  {
    name: "2D vector",
    type: Type.Vector2,
    value: { x: 1, y: -2 },
    hex: "0000803f000000c0",
  },
  {
    name: "3D vector",
    type: Type.Vector3,
    value: { x: 1, y: -2, z: 0.5 },
    hex: "0000803f000000c00000003f",
  },
  {
    name: "RGBA colour",
    type: Type.Colour,
    value: { r: 1, g: 0, b: 128 / 255, a: 64 / 255 },
    hex: "ff008040",
  },
] satisfies ReadonlyArray<
  { name: string; type: Type; value: unknown; hex: string }
>;

for (const { name, type, value, hex } of primitiveCases) {
  Deno.test(`template ${name} matches independent expected bytes`, () => {
    const info: TypeInfo = type === Type.Enumeration
      ? { info: type, templateName: "Fixture.Enum" }
      : { info: type };
    deepStrictEqual(encode(value, info), Uint8Array.fromHex(hex));
    deepStrictEqual(decode(hex, info), value);
  });
}

Deno.test("floating template values preserve NaN, infinities and signed zero", () => {
  for (const type of [Type.Single, Type.Double]) {
    const info = { info: type };
    const width = type === Type.Single ? 4 : 8;
    const expectedInfinity = type === Type.Single
      ? "0000807f"
      : "000000000000f07f";
    deepStrictEqual(
      encode(Infinity, info),
      Uint8Array.fromHex(expectedInfinity),
    );
    equal(decode(expectedInfinity, info), Infinity);
    for (const value of [NaN, -Infinity, -0]) {
      const bytes = encode(value, info);
      equal(bytes.byteLength, width);
      const view = new DataView(
        bytes.buffer,
        bytes.byteOffset,
        bytes.byteLength,
      );
      const nativeValue = type === Type.Single
        ? view.getFloat32(0, true)
        : view.getFloat64(0, true);
      ok(Object.is(nativeValue, value));
      ok(Object.is(decode(bytes.toHex(), info), value));
    }
  }
});

Deno.test("integer coercion and boolean truthiness retain legacy wire behavior", () => {
  deepStrictEqual(
    encode(NaN, { info: Type.Int32 }),
    Uint8Array.fromHex("00000000"),
  );
  deepStrictEqual(
    encode(65535, { info: Type.Int16 }),
    Uint8Array.fromHex("ffff"),
  );
  deepStrictEqual(encode(1.75, { info: Type.Byte }), Uint8Array.fromHex("01"));
  equal(decode("02", { info: Type.Boolean }), true);
  deepStrictEqual(
    encode("truthy", { info: Type.Boolean }),
    Uint8Array.fromHex("01"),
  );
});

Deno.test("colour components clamp and round to normalized bytes", () => {
  const info = { info: Type.Colour };
  deepStrictEqual(
    encode({ r: -1, g: 2, b: 0.5, a: NaN }, info),
    Uint8Array.fromHex("00ff8000"),
  );
  deepStrictEqual(
    encode({ r: -Infinity, g: Infinity, b: 0, a: 1 }, info),
    Uint8Array.fromHex("00ff00ff"),
  );
  deepStrictEqual(decode("00ff8000", info), { r: 0, g: 1, b: 128 / 255, a: 0 });
});

const int: TypeInfo = { info: Type.Int32 };
const user: TypeInfo = { info: Type.UserDefined, templateName: "Element" };
const templates: TypeTemplates = [{
  name: "Element",
  fields: [{ name: "x", type: int }],
  properties: [],
}];

for (const kind of [Type.Array, Type.List, Type.HashSet, Type.Queue]) {
  const name = Type[kind];
  Deno.test(`template ${name} preserves collection ordering, empty and null values`, () => {
    const info: TypeInfo = {
      info: kind === Type.Array ? kind : kind | Type.IS_GENERIC_TYPE,
      subTypes: [int],
    };
    for (
      const { value, hex } of [
        { value: [7, 8], hex: "08000000020000000700000008000000" },
        { value: [], hex: "0000000000000000" },
        { value: null, hex: "00000000ffffffff" },
      ]
    ) {
      deepStrictEqual(encode(value, info), Uint8Array.fromHex(hex));
      deepStrictEqual(decode(hex, info), value);
    }
  });
  Deno.test(`template ${name} still reads legacy advisory collection lengths`, () => {
    const info: TypeInfo = {
      info: kind === Type.Array ? kind : kind | Type.IS_GENERIC_TYPE,
      subTypes: [int],
    };
    deepStrictEqual(decode("04000000020000000700000008000000", info), [7, 8]);
    deepStrictEqual(decode("fcffffff00000000", info), []);
    equal(decode("04000000ffffffff", info), null);
  });
}

Deno.test("template byte arrays retain Uint8Array representation", () => {
  const info: TypeInfo = { info: Type.Array, subTypes: [{ info: Type.Byte }] };
  const hex = "0300000003000000010203";
  deepStrictEqual(
    encode(new Uint8Array([1, 2, 3]), info),
    Uint8Array.fromHex(hex),
  );
  deepStrictEqual(decode(hex, info), new Uint8Array([1, 2, 3]));
  deepStrictEqual(
    decode("ffffffff03000000010203", info),
    new Uint8Array([1, 2, 3]),
  );
  throws(
    () => encode([1, 2, 3], info),
    /Expected byte array value to be Uint8Array/,
  );
});

Deno.test("reference and value-type arrays use distinct object-length layouts", () => {
  const references: TypeInfo = { info: Type.Array, subTypes: [user] };
  const structs: TypeInfo = {
    info: Type.Array,
    subTypes: [{
      info: Type.UserDefined | Type.IS_VALUE_TYPE,
      templateName: "Element",
    }],
  };
  const value = [{ x: 7 }, { x: 8 }];
  for (
    const { info, hex } of [
      {
        info: references,
        hex: "100000000200000004000000070000000400000008000000",
      },
      { info: structs, hex: "08000000020000000700000008000000" },
    ]
  ) {
    deepStrictEqual(encode(value, info, templates), Uint8Array.fromHex(hex));
    deepStrictEqual(decode(hex, info, templates), value);
  }
});

Deno.test("dictionaries serialize all values before their corresponding keys", () => {
  const info: TypeInfo = {
    info: Type.Dictionary | Type.IS_GENERIC_TYPE,
    subTypes: [int, int],
  };
  for (
    const { value, hex } of [
      {
        value: [[1, 11], [2, 22]],
        hex: "10000000020000000b000000160000000100000002000000",
      },
      { value: [], hex: "0000000000000000" },
      { value: null, hex: "00000000ffffffff" },
    ]
  ) {
    deepStrictEqual(encode(value, info), Uint8Array.fromHex(hex));
    deepStrictEqual(decode(hex, info), value);
  }
  deepStrictEqual(
    decode("0c000000020000000b000000160000000100000002000000", info),
    [[1, 11], [2, 22]],
  );
  deepStrictEqual(decode("fcffffff00000000", info), []);
  equal(decode("04000000ffffffff", info), null);
});

Deno.test("pairs preserve their field order and the documented ONI null quirk", () => {
  const info: TypeInfo = {
    info: Type.Pair | Type.IS_GENERIC_TYPE,
    subTypes: [int, int],
  };
  const value = { key: 5, value: 6 };
  const hex = "080000000500000006000000";
  deepStrictEqual(encode(value, info), Uint8Array.fromHex(hex));
  deepStrictEqual(decode(hex, info), value);
  // The parser accepts a negative length as null, while the historical game
  // writer emits a collection-shaped null that its own pair reader cannot read.
  equal(decode("ffffffff", info), null);
  deepStrictEqual(encode(null, info), Uint8Array.fromHex("04000000ffffffff"));
  throws(() => decode("04000000ffffffff", info), /Buffer length exceeded/);
  deepStrictEqual(decode("000000000500000006000000", info), value);
});

Deno.test("user-defined objects encode explicit lengths and null sentinels", () => {
  const value = { x: 12 };
  const hex = "040000000c000000";
  deepStrictEqual(encode(value, user, templates), Uint8Array.fromHex(hex));
  deepStrictEqual(decode(hex, user, templates), value);
  deepStrictEqual(
    encode(null, user, templates),
    Uint8Array.fromHex("ffffffff"),
  );
  equal(decode("ffffffff", user, templates), null);
  throws(
    () => decode("080000000c000000", user, templates),
    /less than expected/,
  );
  throws(() => encode(12, user, templates), /requires an object/);
});

Deno.test("numeric template guards reject nonnumeric values for every number category", () => {
  for (
    const type of [
      Type.SByte,
      Type.Byte,
      Type.Int16,
      Type.UInt16,
      Type.Int32,
      Type.UInt32,
      Type.Single,
      Type.Double,
      Type.Enumeration,
    ]
  ) {
    for (const value of [undefined, null, "12", 12n, true, {}]) {
      throws(
        () => encode(value, { info: type }),
        /Expected a numeric template value/,
      );
    }
  }
});

Deno.test("64-bit template guards reject incomplete and mistyped word objects", () => {
  for (const type of [Type.Int64, Type.UInt64]) {
    for (const value of [null, 12n, "12"]) {
      throws(
        () => encode(value, { info: type }),
        /Expected an object template value/,
      );
    }
    for (
      const value of [
        {},
        { unsigned: 1, lower: 0, upper: 0 },
        { unsigned: true, lower: "0", upper: 0 },
        { unsigned: false, lower: 0 },
      ]
    ) {
      throws(() => encode(value, { info: type }), /Expected a 64-bit/);
    }
  }
});

Deno.test("vector, colour, pair and string guards reject malformed native values", () => {
  for (const type of [Type.Vector2I, Type.Vector2, Type.Vector3, Type.Colour]) {
    throws(
      () => encode(null, { info: type }),
      /Expected an object template value/,
    );
    throws(
      () => encode({}, { info: type }),
      /Expected a numeric template value/,
    );
  }
  for (const value of [undefined, 1, false, {}]) {
    throws(
      () => encode(value, { info: Type.String }),
      /Expected a string or null template value/,
    );
  }
  const pair: TypeInfo = {
    info: Type.Pair | Type.IS_GENERIC_TYPE,
    subTypes: [int, int],
  };
  throws(() => encode(1, pair), /Expected an object template value/);
  throws(() => encode({ key: 1 }, pair), /Expected a numeric template value/);
});

Deno.test("unsupported template codes and malformed value-type arrays fail explicitly", () => {
  const unknown: TypeInfo = { info: 63 as Type };
  throws(() => decode("", unknown), /Unknown type code/);
  throws(() => encode(0, unknown), /Unknown type code/);
  const invalidArray: TypeInfo = {
    info: Type.Array,
    subTypes: [{ info: Type.Int32 | Type.IS_VALUE_TYPE }],
  };
  throws(
    () => decode("0000000000000000", invalidArray),
    /cannot be parsed as a value-type/,
  );
  throws(() => encode([1], invalidArray), /cannot be written as a value-type/);
  throws(
    () => decode("ffffffff", { info: Type.UserDefined }),
    /requires a template name/,
  );
  throws(
    () => encode(null, { info: Type.UserDefined }),
    /requires a template name/,
  );
});
