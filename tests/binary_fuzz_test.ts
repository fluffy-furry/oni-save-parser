import { deepStrictEqual, equal, throws } from "node:assert/strict";
import {
  ArrayDataReader,
  ArrayDataWriter,
  ZlibDataReader,
  ZlibDataWriter,
} from "../src/binary-serializer/index.ts";

// Fixed seeds make failures reproducible without a fuzzing dependency.
function randomGenerator(seed: number): () => number {
  return () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return seed >>> 0;
  };
}

Deno.test("seeded primitive fuzz matches an independent native DataView oracle", () => {
  const random = randomGenerator(0x4f4e4921);
  const operations = [
    ["writeByte", "readByte", "setUint8", "getUint8", 1],
    ["writeSByte", "readSByte", "setInt8", "getInt8", 1],
    ["writeUInt16", "readUInt16", "setUint16", "getUint16", 2],
    ["writeInt16", "readInt16", "setInt16", "getInt16", 2],
    ["writeUInt32", "readUInt32", "setUint32", "getUint32", 4],
    ["writeInt32", "readInt32", "setInt32", "getInt32", 4],
    ["writeSingle", "readSingle", "setFloat32", "getFloat32", 4],
    ["writeDouble", "readDouble", "setFloat64", "getFloat64", 8],
  ] as const;
  for (let round = 0; round < 256; round++) {
    const writer = new ArrayDataWriter(random() % 33);
    const reference = new DataView(new ArrayBuffer(512));
    const reads: (() => void)[] = [];
    let offset = 0;
    for (let step = 0; step < 64; step++) {
      const [write, read, set, get, width] =
        operations[random() % operations.length]!;
      const special = [
        0,
        -0,
        NaN,
        Infinity,
        -Infinity,
        Number.MIN_VALUE,
        Number.MAX_VALUE,
      ];
      const value = step % 5 === 0
        ? special[random() % special.length]!
        : (random() | 0) / (random() % 2 === 0 ? 1 : 17);
      writer[write](value);
      reference[set](offset, value, true);
      const expected = reference[get](offset, true);
      reads.push(() =>
        equal(
          reader[read](),
          expected,
          `round ${round}, operation ${step}: ${read}`,
        )
      );
      offset += width;
    }
    deepStrictEqual(
      writer.getBytesView(),
      new Uint8Array(reference.buffer, 0, offset),
    );
    const prefix = random() % 17;
    const padded = new Uint8Array(prefix + offset + 17).fill(0xcc);
    padded.set(writer.getBytesView(), prefix);
    const reader = new ArrayDataReader(
      round % 2 === 0
        ? padded.subarray(prefix, prefix + offset)
        : new DataView(padded.buffer, prefix, offset),
    );
    for (const read of reads) read();
    equal(reader.position, offset);
    throws(() => reader.readByte(), RangeError);
  }
});

Deno.test("seeded UTF-16 fuzz and growth boundaries match native UTF-8 encoding", () => {
  const random = randomGenerator(0x55544638);
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const values = [
    "",
    "\0",
    "ASCII",
    "保存🌋",
    "\ud800",
    "\udfff",
    "\ud800x\udfff",
    "\ud800\udfff",
    "\uffff\ufeff",
    "oxygen ".repeat(8192),
    "保存🌋".repeat(4096),
  ];
  for (let i = 0; i < 512; i++) {
    let value = "";
    const length = random() % 129;
    for (let j = 0; j < length; j++) {
      value += String.fromCharCode(random() & 0xffff);
    }
    values.push(value);
  }
  for (const value of values) {
    const encoded = encoder.encode(value);
    // Exercise exact-fit, insufficient and spare-capacity encodeInto branches.
    for (
      const capacity of [
        0,
        4,
        encoded.length + 3,
        encoded.length + 4,
        value.length * 3 + 4,
      ]
    ) {
      const writer = new ArrayDataWriter(capacity);
      writer.writeKleiString(value);
      writer.writeKleiString(null);
      writer.writeKleiString("tail🌋");
      const bytes = writer.getBytesView();
      equal(
        new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getInt32(
          0,
          true,
        ),
        encoded.length,
      );
      deepStrictEqual(bytes.subarray(4, 4 + encoded.length), encoded);
      const reader = new ArrayDataReader(bytes);
      equal(reader.readKleiString(), decoder.decode(encoded));
      equal(reader.readKleiString(), null);
      equal(reader.readKleiString(), "tail🌋");
      equal(reader.position, writer.position);
    }
  }
});

Deno.test("seeded byte-view and length fuzz stays within the selected input", () => {
  const random = randomGenerator(0x56494557);
  for (let round = 0; round < 512; round++) {
    const prefix = random() % 32;
    const length = random() % 513;
    const suffix = random() % 32;
    const buffer = new Uint8Array(prefix + length + suffix);
    for (let i = 0; i < buffer.length; i++) buffer[i] = random() & 0xff;
    const selected = new DataView(buffer.buffer, prefix, length);
    const writer = new ArrayDataWriter(random() % 8);
    writer.writeBytes(selected);
    deepStrictEqual(
      writer.getBytesView(),
      buffer.subarray(prefix, prefix + length),
    );
    const reader = new ArrayDataReader(selected);
    let consumed = 0;
    while (consumed < length) {
      const remaining = length - consumed;
      for (
        const invalid of [
          -1 - random(),
          remaining + 1 + random(),
          random() + 0.5,
        ]
      ) {
        throws(() => reader.skipBytes(invalid), RangeError);
        equal(reader.position, consumed);
      }
      const count = 1 + random() % remaining;
      const expected = buffer.subarray(
        prefix + consumed,
        prefix + consumed + count,
      );
      if (random() % 2 === 0) {
        deepStrictEqual(new Uint8Array(reader.readBytes(count)), expected);
      } else {
        const view = reader.viewBytes(count);
        equal(view.buffer, buffer.buffer);
        deepStrictEqual(
          new Uint8Array(view.buffer, view.byteOffset, view.byteLength),
          expected,
        );
      }
      consumed += count;
    }
    equal(reader.position, length);
    equal(reader.viewAllBytes().length, 0);
  }
});

Deno.test("seeded 64-bit pairs and compressed byte payloads round-trip", () => {
  const random = randomGenerator(0x5a4c4942);
  for (let round = 0; round < 128; round++) {
    const writer = new ZlibDataWriter();
    const signed = {
      unsigned: false,
      lower: random() | 0,
      upper: random() | 0,
    };
    const unsigned = {
      unsigned: true,
      lower: random() | 0,
      upper: random() | 0,
    };
    writer.writeInt64(signed);
    writer.writeUInt64(unsigned);
    const bytes = new Uint8Array(random() % 4097);
    for (let i = 0; i < bytes.length; i++) bytes[i] = random() & 0xff;
    writer.writeBytes(bytes);
    const reader = new ZlibDataReader(writer.getBytesView());
    deepStrictEqual(reader.readInt64(), signed);
    deepStrictEqual(reader.readUInt64(), unsigned);
    deepStrictEqual(reader.viewAllBytes(), bytes);
    equal(reader.position, writer.position);
  }
});
