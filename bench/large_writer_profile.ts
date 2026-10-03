/**
 * Isolated allocation profile, run once per process (not a Deno.bench loop):
 *   /usr/bin/time -v deno run bench/large_writer_profile.ts array 64 mixed
 *   /usr/bin/time -v deno run bench/large_writer_profile.ts chunked 64 mixed
 *   /usr/bin/time -v deno run bench/large_writer_profile.ts borrowed 64 mixed
 * `chunks` measures staging alone for a streaming consumer; other modes include
 * synchronous native zlib and final save assembly. Input construction is untimed.
 */
import { deflateSync } from "node:zlib";
import {
  ArrayDataWriter,
  ChunkedDataWriter,
  type DataWriter,
} from "../src/binary-serializer/index.ts";

function profile(): void {
  const mode = Deno.args[0] ?? "borrowed";
  const sizeMiB = Number(Deno.args[1] ?? 8);
  const entropy = Deno.args[2] ?? "mixed";
  if (!["array", "chunked", "borrowed", "chunks"].includes(mode)) {
    throw new Error("Mode must be array, chunked, borrowed, or chunks.");
  }
  if (!Number.isInteger(sizeMiB) || sizeMiB < 1 || sizeMiB > 256) {
    throw new Error(
      "Size must be 1–256 MiB; run each size in a fresh process.",
    );
  }
  if (!["mixed", "random", "zeros"].includes(entropy)) {
    throw new Error("Entropy must be mixed, random, or zeros.");
  }
  const source = new Uint8Array(sizeMiB * 1024 * 1024);
  const words = new Uint32Array(source.buffer);
  let seed = 0x4f4e4932;
  for (let i = 0; i < words.length; i++) {
    if (entropy === "zeros" || (entropy === "mixed" && i % 256 < 128)) continue;
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    words[i] = seed >>> 0;
  }
  // Commit otherwise-zero pages before the writer timing and RSS baseline.
  for (let i = 0; i < source.length; i += 4096) source[i] = source[i]!;
  const rss: Record<string, number> = { input: Deno.memoryUsage().rss };
  const durations: Record<string, number> = {};
  const createWriter = (): ArrayDataWriter | ChunkedDataWriter =>
    mode === "array"
      ? new ArrayDataWriter()
      : new ChunkedDataWriter({ borrowBuffers: mode !== "chunked" });
  const writer = createWriter();
  const started = performance.now();
  writeBody(writer, source);
  const staged = performance.now();
  durations.stagingMs = staged - started;
  rss.staged = Deno.memoryUsage().rss;
  if (mode === "chunks") {
    const chunks = (writer as ChunkedDataWriter).finishChunks();
    durations.totalMs = performance.now() - started;
    rss.finished = Deno.memoryUsage().rss;
    console.log(
      JSON.stringify({
        mode,
        sizeMiB,
        entropy,
        chunks: chunks.length,
        rawBytes: writer.position,
        durations,
        rss,
      }),
    );
    return;
  }
  const raw = writer instanceof ChunkedDataWriter
    ? new Uint8Array(writer.finish())
    : writer.getBytesView();
  const assembled = performance.now();
  durations.rawAssemblyMs = assembled - staged;
  rss.raw = Deno.memoryUsage().rss;
  const compressed = deflateSync(raw, { windowBits: 15 });
  const deflated = performance.now();
  durations.compressionMs = deflated - assembled;
  rss.compressed = Deno.memoryUsage().rss;
  const output = createWriter();
  output.writeChars("ONI benchmark");
  output.writeBytes(compressed);
  const bytes = output instanceof ChunkedDataWriter
    ? output.finish()
    : output.getBytes();
  durations.finalAssemblyMs = performance.now() - deflated;
  durations.totalMs = performance.now() - started;
  rss.finished = Deno.memoryUsage().rss;
  console.log(
    JSON.stringify({
      mode,
      sizeMiB,
      entropy,
      rawBytes: raw.byteLength,
      outputBytes: bytes.byteLength,
      checksum: new Uint8Array(bytes).at(-1),
      durations,
      rss,
    }),
  );
}

function writeBody(writer: DataWriter, source: Uint8Array): void {
  const blockSize = 1024 * 1024;
  for (let offset = 0; offset < source.length; offset += blockSize) {
    const token = writer.position;
    writer.writeInt32(0);
    writer.writeBytes(
      source.subarray(offset, Math.min(offset + blockSize, source.length)),
    );
    writer.writeKleiString(`opaque-block-${offset / blockSize}`);
    writer.replaceInt32(writer.position - token - 4, token);
  }
}

if (import.meta.main) profile();
