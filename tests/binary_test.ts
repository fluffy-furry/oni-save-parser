import {
  deepStrictEqual,
  equal,
  notEqual,
  ok,
  throws,
} from "node:assert/strict";
import { deflateSync, inflateSync } from "node:zlib";
import {
  ArrayDataReader,
  ArrayDataWriter,
  ZlibDataReader,
  ZlibDataWriter,
} from "../src/binary-serializer/index.ts";

Deno.test("little-endian primitives retain their binary representation", () => {
  const writer = new ArrayDataWriter(0);
  writer.writeByte(255);
  writer.writeSByte(-128);
  writer.writeUInt16(0xabcd);
  writer.writeInt16(-32768);
  writer.writeUInt32(0xffffffff);
  writer.writeInt32(-2147483648);
  writer.writeUInt64({ unsigned: true, lower: -1, upper: -1 });
  writer.writeInt64({ unsigned: false, lower: 0, upper: -2147483648 });
  writer.writeSingle(1.5);
  writer.writeDouble(-Math.PI);
  writer.writeVector3({ x: 1, y: 2, z: 3 });
  writer.writeQuaternion({ x: -1, y: -2, z: -3, w: 1 });

  deepStrictEqual([...writer.getBytesView().subarray(0, 14)], [
    255,
    128,
    205,
    171,
    0,
    128,
    255,
    255,
    255,
    255,
    0,
    0,
    0,
    128,
  ]);
  const reader = new ArrayDataReader(writer.getBytes());
  equal(reader.readByte(), 255);
  equal(reader.readSByte(), -128);
  equal(reader.readUInt16(), 0xabcd);
  equal(reader.readInt16(), -32768);
  equal(reader.readUInt32(), 0xffffffff);
  equal(reader.readInt32(), -2147483648);
  deepStrictEqual(reader.readUInt64(), {
    unsigned: true,
    lower: -1,
    upper: -1,
  });
  deepStrictEqual(reader.readInt64(), {
    unsigned: false,
    lower: 0,
    upper: -2147483648,
  });
  equal(reader.readSingle(), 1.5);
  equal(reader.readDouble(), -Math.PI);
  deepStrictEqual(reader.readVector3(), { x: 1, y: 2, z: 3 });
  deepStrictEqual(reader.readQuaternion(), { x: -1, y: -2, z: -3, w: 1 });
  equal(reader.position, writer.position);
  throws(() => reader.readByte(), RangeError);
});

Deno.test("UTF-8 strings store encoded byte counts, null and empty distinctly", () => {
  const writer = new ArrayDataWriter();
  for (const value of [null, "", "hello", "Grüße 🌋 日本語", "\ud800"]) {
    writer.writeKleiString(value);
  }
  writer.writeChars("\x00\x7f\x80\xff");
  const reader = new ArrayDataReader(writer.getBytesView());
  for (const expected of [null, "", "hello", "Grüße 🌋 日本語", "\ufffd"]) {
    equal(reader.readKleiString(), expected);
  }
  equal(reader.readChars(4), "\x00\x7f\x80\xff");
  equal(reader.position, writer.position);

  const multibyte = new ArrayDataWriter();
  multibyte.writeKleiString("🌋");
  deepStrictEqual([...multibyte.getBytesView()], [
    4,
    0,
    0,
    0,
    240,
    159,
    140,
    139,
  ]);
});

Deno.test("readers preserve the bounds and offsets of typed arrays and DataViews", () => {
  const backing = new Uint8Array([99, 98, 1, 2, 3, 4, 97, 96]);
  const inputs = [
    backing.subarray(2, 6),
    new DataView(backing.buffer, 2, 4),
    new Uint16Array(backing.buffer, 2, 2),
  ];
  for (const input of inputs) {
    const reader = new ArrayDataReader(input);
    equal(reader.readByte(), 1);
    const view = reader.viewBytes(2);
    equal(view.buffer, backing.buffer);
    equal(view.byteOffset, 3);
    equal(view.byteLength, 2);
    deepStrictEqual([...new Uint8Array(reader.readAllBytes())], [4]);
    equal(reader.position, 4);
    equal(reader.viewAllBytes().byteLength, 0);
    throws(() => reader.readByte(), RangeError);

    const remaining = new ArrayDataReader(input);
    remaining.skipBytes(1);
    deepStrictEqual([...remaining.viewAllBytes()], [2, 3, 4]);
    equal(remaining.position, 4);
  }
});

Deno.test("readBytes copies but viewBytes shares the input allocation", () => {
  const source = new Uint8Array([10, 20, 30, 40]);
  const reader = new ArrayDataReader(source);
  const copied = new Uint8Array(reader.readBytes(2));
  const viewed = reader.viewBytes(2);
  source.fill(0);
  deepStrictEqual([...copied], [10, 20]);
  deepStrictEqual([...new Uint8Array(viewed.buffer, viewed.byteOffset, 2)], [
    0,
    0,
  ]);
});

Deno.test("invalid read lengths and truncated compound values do not move the cursor", () => {
  for (
    const method of [
      "readBytes",
      "viewBytes",
      "readChars",
      "skipBytes",
    ] as const
  ) {
    const reader = new ArrayDataReader(new ArrayBuffer(4));
    for (
      const length of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, 5]
    ) {
      throws(() => reader[method](length), RangeError);
      equal(reader.position, 0);
    }
    reader[method](0);
    equal(reader.position, 0);
  }
  for (
    const method of [
      "readUInt64",
      "readInt64",
      "readVector3",
      "readQuaternion",
    ] as const
  ) {
    const reader = new ArrayDataReader(new ArrayBuffer(4));
    throws(() => reader[method](), RangeError);
    equal(reader.position, 0);
  }
});

Deno.test("malformed Klei string counts are rejected", () => {
  for (const length of [-2, 1, 2147483647]) {
    const writer = new ArrayDataWriter();
    writer.writeInt32(length);
    const reader = new ArrayDataReader(writer.getBytesView());
    throws(() => reader.readKleiString(), RangeError);
    equal(reader.position, 4);
  }
});

Deno.test("writer grows geometrically, preserves data, and copies only selected view bytes", () => {
  const writer = new ArrayDataWriter(0);
  const allocations = new Set<ArrayBufferLike>();
  const block = new Uint8Array(1024).fill(0xa5);
  for (let i = 0; i < 8192; i++) {
    writer.writeBytes(block);
    allocations.add(writer.getBytesView().buffer);
  }
  equal(writer.position, 8 * 1024 * 1024);
  const totalAllocated = [...allocations].reduce(
    (sum, buffer) => sum + buffer.byteLength,
    0,
  );
  ok(
    totalAllocated < writer.position * 2,
    "growth should copy a linear amount of data",
  );
  equal(writer.getBytesView().every((value) => value === 0xa5), true);
  const snapshot = writer.getBytes();
  writer.replaceInt32(0, 0);
  equal(new Uint8Array(snapshot)[0], 0xa5);
  equal(writer.getBytesView()[0], 0);
  notEqual(snapshot, writer.getBytesView().buffer);

  const views = new ArrayDataWriter();
  const source = new Uint8Array([99, 1, 2, 98]);
  views.writeBytes(new DataView(source.buffer, 1, 2));
  views.writeBytes(source.subarray(1, 3));
  views.writeBytes(new Uint8Array([3, 4]).buffer);
  deepStrictEqual([...views.getBytesView()], [1, 2, 1, 2, 3, 4]);
});

Deno.test("integer replacement stays within written bytes", () => {
  const writer = new ArrayDataWriter();
  throws(() => writer.replaceInt32(1, 0), RangeError);
  writer.writeInt32(0);
  for (const offset of [-1, 0.5, NaN, Infinity, 1, 4092]) {
    throws(() => writer.replaceInt32(1, offset), RangeError);
  }
  writer.replaceInt32(-123, 0);
  equal(new ArrayDataReader(writer.getBytes()).readInt32(), -123);
  equal(writer.position, 4);
  for (const capacity of [-1, 0.5, NaN, Infinity]) {
    throws(() => new ArrayDataWriter(capacity), RangeError);
  }
});

Deno.test("writer growth and snapshots leave previously borrowed views usable", () => {
  const writer = new ArrayDataWriter(4);
  writer.writeUInt32(0x12345678);
  const borrowed = writer.getBytesView();
  const reader = new ArrayDataReader(borrowed);
  const snapshot = writer.getBytes();
  writer.writeBytes(new Uint8Array(8192));
  writer.replaceInt32(0, 0);

  equal(borrowed.byteLength, 4);
  equal(borrowed.buffer.byteLength, 4);
  equal(reader.readUInt32(), 0x12345678);
  equal(new DataView(snapshot).getUint32(0, true), 0x12345678);
  equal(new ArrayDataReader(writer.getBytesView()).readUInt32(), 0);
});

Deno.test("zlib streams interoperate with native compression without leaking buffer capacity", () => {
  // A fixed external zlib stream encoding 'hello'.
  const fixture = new Uint8Array([
    120,
    156,
    203,
    72,
    205,
    201,
    201,
    7,
    0,
    6,
    44,
    2,
    21,
  ]);
  equal(new ZlibDataReader(fixture).readChars(5), "hello");
  const padded = new Uint8Array(fixture.length + 10);
  padded.set(fixture, 5);
  equal(
    new ZlibDataReader(padded.subarray(5, 5 + fixture.length)).readChars(5),
    "hello",
  );

  for (const text of ["", "hello", "保存 🌋".repeat(10_000)]) {
    const writer = new ZlibDataWriter();
    writer.writeKleiString(text);
    const compressed = writer.getBytes();
    const view = writer.getBytesView();
    equal(compressed.byteLength, view.byteLength);
    deepStrictEqual(new Uint8Array(compressed), Uint8Array.from(view));
    equal(
      new ZlibDataReader(new Uint8Array(compressed)).readKleiString(),
      text,
    );
    const native = inflateSync(view);
    equal(new ArrayDataReader(native).readKleiString(), text);
    const recompressed = deflateSync(native);
    equal(new ZlibDataReader(recompressed).readKleiString(), text);
  }
  throws(() => new ZlibDataReader(new Uint8Array([1, 2, 3])));
});
