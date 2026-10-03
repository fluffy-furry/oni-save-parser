import { deepStrictEqual, equal, throws } from "node:assert/strict";
import {
  ArrayDataReader,
  ArrayDataWriter,
} from "../src/binary-serializer/index.ts";
import { parse, unparse } from "../src/parser/index.ts";
import {
  headerSchema,
  type SaveGameHeader,
  type SaveGameInfo,
} from "../src/save-structure/header/header.ts";
import {
  parseHeader,
  unparseHeader,
} from "../src/save-structure/header/parser.ts";

const gameInfo: SaveGameInfo = {
  numberOfCycles: 123,
  numberOfDuplicants: 8,
  baseName: "Colony 🪐 世界",
  isAutoSave: false,
  originalSaveName: "Test",
  saveMajorVersion: 7,
  saveMinorVersion: 0,
  clusterId: "test-cluster",
  sandboxEnabled: false,
  colonyGuid: "test-colony",
  dlcId: "",
};

function makeHeader(overrides: Partial<SaveGameHeader> = {}): SaveGameHeader {
  return {
    buildVersion: 123456,
    headerVersion: 1,
    isCompressed: true,
    gameInfo: { ...gameInfo },
    ...overrides,
  };
}

Deno.test("headers round trip Unicode metadata and compression flags", () => {
  for (const isCompressed of [true, false]) {
    const header = makeHeader({ isCompressed });
    const writer = new ArrayDataWriter();
    unparse(writer, unparseHeader(header));
    const bytes = writer.getBytes();
    const infoBytes = new TextEncoder().encode(JSON.stringify(header.gameInfo));
    equal(new DataView(bytes).getUint32(4, true), infoBytes.byteLength);
    equal(bytes.byteLength, 16 + infoBytes.byteLength);
    const reader = new ArrayDataReader(bytes);
    deepStrictEqual(parse(reader, parseHeader()), header);
    equal(reader.position, bytes.byteLength);
  }
});

Deno.test("legacy version zero headers omit the compression word", () => {
  const header = makeHeader({ headerVersion: 0, isCompressed: false });
  const writer = new ArrayDataWriter();
  unparse(writer, unparseHeader(header));
  const bytes = writer.getBytes();
  equal(bytes.byteLength, 12 + new DataView(bytes).getUint32(4, true));
  deepStrictEqual(parse(new ArrayDataReader(bytes), parseHeader()), header);
});

Deno.test("header validation preserves open metadata across save versions", () => {
  for (const metadata of [{}, { newField: [1, { futureField: true }] }]) {
    const header = makeHeader({ gameInfo: metadata as SaveGameInfo });
    const writer = new ArrayDataWriter();
    unparse(writer, unparseHeader(header));
    deepStrictEqual(
      parse(new ArrayDataReader(writer.getBytes()), parseHeader()),
      header,
    );
  }
});

Deno.test("header schema retains optional fields and numeric version semantics", () => {
  equal(headerSchema.additionalProperties, false);
  equal(Object.hasOwn(headerSchema, "required"), false);
  const legacyPartial = { gameInfo: {}, buildVersion: 1.5 };
  // The historical schema allowed omitted fields and all finite numbers.
  const instructions = [...unparseHeader(legacyPartial as SaveGameHeader)];
  deepStrictEqual(instructions[0], {
    type: "write",
    dataType: "uint-32",
    value: 1.5,
  });
});

Deno.test("header validation rejects wrong types with field-specific errors", () => {
  for (
    const [property, value] of [
      ["buildVersion", "123"],
      ["buildVersion", NaN],
      ["headerVersion", Infinity],
      ["isCompressed", 1],
      ["gameInfo", null],
      ["gameInfo", []],
      ["gameInfo", new Date(0)],
    ] as const
  ) {
    const header = { ...makeHeader(), [property]: value };
    throws(
      () => unparseHeader(header as SaveGameHeader).next(),
      { name: "TypeError", message: new RegExp(`header\\.${property}`) },
    );
  }
});

Deno.test("header validation rejects extra top-level keys and non-object headers", () => {
  for (const header of [null, [], false, 3, new Date(0)]) {
    throws(
      () => unparseHeader(header as unknown as SaveGameHeader).next(),
      { name: "TypeError", message: "header must be an object" },
    );
  }
  const header = { ...makeHeader(), typo: true };
  throws(
    () => unparseHeader(header).next(),
    /Unexpected header property: typo/,
  );
});

Deno.test("invalid header JSON reports its byte offset", () => {
  const writer = new ArrayDataWriter();
  writer.writeUInt32(123456);
  writer.writeUInt32(1);
  writer.writeUInt32(0);
  writer.writeByte("{".charCodeAt(0));
  throws(
    () => parse(new ArrayDataReader(writer.getBytes()), parseHeader()),
    (error: unknown) => {
      equal((error as { dataOffset: number }).dataOffset, 13);
      return true;
    },
  );
});
