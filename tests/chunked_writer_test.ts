import {
  deepStrictEqual,
  equal,
  notEqual,
  ok,
  throws,
} from "node:assert/strict";
import { deflateSync } from "node:zlib";
import {
  ArrayDataReader,
  ArrayDataWriter,
  ChunkedDataWriter,
  type DataWriter,
  ZlibDataReader,
} from "../src/binary-serializer/index.ts";

function writeMixed(writer: DataWriter): void {
  writer.writeByte(255);
  writer.writeSByte(-100);
  writer.writeUInt16(65535);
  writer.writeInt16(-30000);
  writer.writeUInt32(0xfedcba98);
  writer.writeInt32(-1234567);
  writer.writeUInt64({ unsigned: true, upper: -1, lower: -1 });
  writer.writeInt64({ unsigned: false, upper: -2147483648, lower: 0 });
  writer.writeSingle(1.25);
  writer.writeDouble(-Math.PI);
  writer.writeVector3({ x: 1, y: -2, z: 3 });
  writer.writeQuaternion({ x: 0, y: 0, z: 0, w: 1 });
  writer.writeChars("\x00\xffABC");
  for (
    const value of [
      null,
      "",
      "ascii",
      "保存🌋\ud800x\udfff",
      "oxygen".repeat(100),
    ]
  ) {
    writer.writeKleiString(value);
  }
  const bytes = new Uint8Array(83).fill(42);
  writer.writeBytes(new DataView(bytes.buffer, 3, 77));
}

Deno.test("chunked writers preserve scalar and UTF-8 wire bytes across small page boundaries", () => {
  const expected = new ArrayDataWriter();
  writeMixed(expected);
  for (const pageSize of [8, 9, 16, 31, 64, 4096]) {
    for (const borrowBuffers of [false, true]) {
      const writer = new ChunkedDataWriter({ pageSize, borrowBuffers });
      writeMixed(writer);
      equal(writer.position, expected.position);
      deepStrictEqual(writer.getBytesView(), expected.getBytesView());
      deepStrictEqual(
        new Uint8Array(writer.getBytes()),
        expected.getBytesView(),
      );
      deepStrictEqual(new Uint8Array(writer.finish()), expected.getBytesView());
      equal(writer.position, expected.position);
      equal(writer.finish(), writer.finish());
    }
  }
});

Deno.test("absolute integer replacements span owned pages and borrowed blocks without mutating inputs", () => {
  const writer = new ChunkedDataWriter({ pageSize: 8, borrowBuffers: true });
  const reference = new ArrayDataWriter();
  const source = new Uint8Array(16).fill(0xee);
  for (const target of [writer, reference]) {
    target.writeChars("abcde");
    target.writeBytes(source);
    target.writeChars("fghijklmnop");
    target.writeByte(0x80);
  }
  // Cover the end of the header, both sides of the opaque block, and the tail.
  for (const position of [0, 3, 5, 18, 20, 25, 29]) {
    writer.replaceInt32(0x12345678, position);
    reference.replaceInt32(0x12345678, position);
  }
  equal(source.every((byte) => byte === 0xee), true);
  deepStrictEqual(writer.getBytesView(), reference.getBytesView());
  for (const position of [-1, 0.5, NaN, Infinity, writer.position - 3]) {
    throws(() => writer.replaceInt32(0, position), RangeError);
  }
});

Deno.test("seeded chunking and arbitrary backpatches match the contiguous writer", () => {
  let seed = 0x50414745;
  const random = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return seed >>> 0;
  };
  for (let round = 0; round < 64; round++) {
    const writer = new ChunkedDataWriter({
      pageSize: 8 + random() % 57,
      borrowBuffers: true,
    });
    const reference = new ArrayDataWriter();
    for (let i = 0; i < 128; i++) {
      const value = random();
      switch (value % 4) {
        case 0: {
          const bytes = new Uint8Array(1 + random() % 257).fill(value & 255);
          writer.writeBytes(bytes);
          reference.writeBytes(bytes);
          break;
        }
        case 1: {
          const text = String.fromCharCode(value & 0xffff) +
            "🌋".repeat(random() % 15);
          writer.writeKleiString(text);
          reference.writeKleiString(text);
          break;
        }
        case 2:
          writer.writeDouble(value / 17);
          reference.writeDouble(value / 17);
          break;
        case 3:
          writer.writeByte(value);
          reference.writeByte(value);
          break;
      }
      if (writer.position >= 4 && i % 3 === 0) {
        const position = random() % (writer.position - 3);
        writer.replaceInt32(value, position);
        reference.replaceInt32(value, position);
      }
    }
    deepStrictEqual(new Uint8Array(writer.finish()), reference.getBytesView());
  }
});

Deno.test("chunk snapshots copy, views remain usable, and finish methods seal every write", () => {
  const writer = new ChunkedDataWriter({ pageSize: 8 });
  writer.writeUInt32(123);
  const snapshot = writer.getBytes();
  const view = writer.getBytesView();
  writer.replaceInt32(456, 0);
  equal(new ArrayDataReader(view).readUInt32(), 456);
  equal(new ArrayDataReader(snapshot).readUInt32(), 123);
  writer.writeBytes(new Uint8Array(32).fill(42));
  equal(view.byteLength, 4);
  equal(new ArrayDataReader(view).readUInt32(), 456);
  const finishedChunks = writer.finishChunks();
  equal(writer.finishChunks(), finishedChunks);
  equal(Object.isFrozen(finishedChunks), true);
  const bytes = writer.finish();
  equal(bytes.byteLength, 36);
  equal(writer.getBytesView().buffer, bytes);
  notEqual(writer.getBytes(), bytes);
  for (
    const operation of [
      () => writer.writeByte(1),
      () => writer.writeInt32(1),
      () => writer.writeBytes(new Uint8Array(0)),
      () => writer.writeChars(""),
      () => writer.writeKleiString(null),
      () => writer.writeKleiString(""),
      () => writer.writeKleiString("text"),
      () => writer.replaceInt32(0, 0),
    ]
  ) throws(operation, /finished/);
});

Deno.test("large borrowed blocks remain unmaterialized until contiguous output is requested", () => {
  const source = new Uint8Array(8 * 1024 * 1024 + 16).fill(0x55);
  const selected = source.subarray(8, source.length - 8);
  const writer = new ChunkedDataWriter({ borrowBuffers: true });
  writer.writeInt32(selected.length);
  writer.writeBytes(selected);
  writer.writeByte(0xab);
  const chunks = writer.finishChunks();
  equal(chunks.length, 3);
  equal(chunks[1]!.buffer, source.buffer);
  equal(chunks[1]!.byteOffset, 8);
  equal(chunks[1]!.byteLength, selected.length);
  equal(chunks[0]!.byteLength, 4);
  equal(chunks[2]!.byteLength, 1);
  const owned = new Uint8Array(writer.finish());
  notEqual(owned.buffer, source.buffer);
  equal(owned.length, selected.length + 5);
  equal(owned[4], 0x55);
  equal(owned.at(-1), 0xab);
  source.fill(0);
  equal(owned[4], 0x55);
});

Deno.test("chunked byte writes copy by default and respect input view bounds", () => {
  const source = new Uint8Array(32).fill(10);
  const writer = new ChunkedDataWriter({ pageSize: 8 });
  writer.writeBytes(new DataView(source.buffer, 4, 16));
  source.fill(0);
  const chunks = writer.finishChunks();
  equal(chunks.length, 1);
  notEqual(chunks[0]!.buffer, source.buffer);
  equal(chunks[0]!.byteLength, 16);
  equal(chunks[0]!.every((byte) => byte === 10), true);
  equal(writer.finish(), chunks[0]!.buffer);
  for (const pageSize of [0, 7, 8.5, NaN, Infinity]) {
    throws(() => new ChunkedDataWriter({ pageSize }), RangeError);
  }
  const empty = new ChunkedDataWriter();
  equal(empty.finishChunks().length, 0);
  equal(empty.getBytesView().length, 0);
  equal(empty.finish().byteLength, 0);
});

Deno.test("transferring an empty view does not detach storage shared with other writers", () => {
  const first = new ChunkedDataWriter();
  const exposed = first.getBytesView().buffer;
  ok(exposed instanceof ArrayBuffer);
  structuredClone(exposed, { transfer: [exposed] });
  equal(first.finish().byteLength, 0);
  equal(new ChunkedDataWriter().getBytes().byteLength, 0);
  equal(new ChunkedDataWriter().finish().byteLength, 0);
  const borrowed = new ChunkedDataWriter({ pageSize: 8, borrowBuffers: true });
  borrowed.writeBytes(new Uint8Array(8).fill(42));
  deepStrictEqual(
    new Uint8Array(borrowed.finish()),
    new Uint8Array(8).fill(42),
  );
});

Deno.test("native zlib decoding enforces an optional decompressed byte limit", () => {
  const source = new Uint8Array(1024 * 1024).fill(42);
  const compressed = deflateSync(source);
  throws(() =>
    new ZlibDataReader(compressed, { maxOutputLength: source.length - 1 })
  );
  const reader = new ZlibDataReader(compressed, {
    maxOutputLength: source.length,
  });
  deepStrictEqual(reader.viewAllBytes(), source);
  ok(new ZlibDataReader(compressed).viewAllBytes().length === source.length);
});

Deno.test("scalar fields surrounding borrowed blocks reuse the remaining owned page", () => {
  const block = new Uint8Array(64 * 1024).fill(42);
  const writer = new ChunkedDataWriter({ borrowBuffers: true });
  const reference = new ArrayDataWriter();
  const scalarBuffers = new Set<ArrayBufferLike>();
  for (let i = 0; i < 256; i++) {
    for (const target of [writer, reference]) {
      const position = target.position;
      target.writeInt32(0);
      target.writeBytes(block);
      target.writeInt32(i);
      target.replaceInt32(i + 1, position);
    }
  }
  for (const chunk of writer.finishChunks()) {
    if (chunk.buffer !== block.buffer) scalarBuffers.add(chunk.buffer);
  }
  equal(scalarBuffers.size, 1);
  deepStrictEqual(new Uint8Array(writer.finish()), reference.getBytesView());
});
