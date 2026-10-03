import {
  ArrayDataReader,
  ArrayDataWriter,
} from "../src/binary-serializer/index.ts";

const payloadWriter = new ArrayDataWriter();
for (let i = 0; i < 5000; i++) {
  payloadWriter.writeKleiString(
    `Duplicant ${i}: 保存 🌋 ${"oxygen ".repeat(10)}`,
  );
}
const payload = payloadWriter.getBytesView();
const decoder = new TextDecoder();

Deno.bench({
  name: "UTF-8 strings: copying baseline",
  group: "strings",
  baseline: true,
}, () => {
  const reader = new ArrayDataReader(payload);
  while (reader.position < payload.byteLength) {
    decoder.decode(reader.readBytes(reader.readInt32()));
  }
});

Deno.bench(
  { name: "UTF-8 strings: direct buffer views", group: "strings" },
  () => {
    const reader = new ArrayDataReader(payload);
    while (reader.position < payload.byteLength) reader.readKleiString();
  },
);

const block = new Uint8Array(16 * 1024).fill(42);
const totalSize = 16 * 1024 * 1024;

Deno.bench({
  name: "16 MiB writes: fixed 1 MiB growth baseline",
  group: "growth",
  baseline: true,
}, () => {
  let buffer = new Uint8Array(1024 * 1024);
  let offset = 0;
  while (offset < totalSize) {
    if (offset + block.byteLength > buffer.byteLength) {
      const expanded = new Uint8Array(buffer.byteLength + 1024 * 1024);
      expanded.set(buffer);
      buffer = expanded;
    }
    buffer.set(block, offset);
    offset += block.byteLength;
  }
});

Deno.bench({ name: "16 MiB writes: geometric growth", group: "growth" }, () => {
  const writer = new ArrayDataWriter();
  while (writer.position < totalSize) writer.writeBytes(block);
});

const encoder = new TextEncoder();

// Preserve the previous implementation as a benchmark baseline, including its
// encoded temporary allocation and subsequent copy into the writer.
class EncodingCopyWriter extends ArrayDataWriter {
  override writeKleiString(value: string | null): void {
    if (value === null || value.length === 0) {
      super.writeKleiString(value);
      return;
    }
    const encoded = encoder.encode(value);
    this.writeInt32(encoded.byteLength);
    this.writeBytes(encoded);
  }
}

for (
  const [label, value, count] of [
    ["short ASCII", "Duplicant", 2000],
    ["short Unicode", "保存🌋\ud800x\udfff", 2000],
    ["medium ASCII", "oxygen ".repeat(100), 200],
    ["medium Unicode", "保存🌋\ud800x\udfff".repeat(100), 200],
    ["large ASCII", "oxygen ".repeat(100000), 1],
    ["large Unicode", "保存🌋\ud800x\udfff".repeat(100000), 1],
  ] as const
) {
  for (
    const [name, Writer] of [
      ["encode and copy", EncodingCopyWriter],
      ["encodeInto", ArrayDataWriter],
    ] as const
  ) {
    Deno.bench({
      name: `${label}: ${name}`,
      group: `write ${label}`,
      baseline: name === "encode and copy",
    }, () => {
      const writer = new Writer();
      for (let i = 0; i < count; i++) writer.writeKleiString(value);
    });
  }
}
