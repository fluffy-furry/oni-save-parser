import { deepStrictEqual, equal, rejects, throws } from "node:assert/strict";
import {
  parseSaveGame,
  writeSaveGame,
  writeSaveGameStream,
} from "../src/index.ts";
import { createSaveGame } from "./fixtures/save_game.ts";

for (const compressed of [false, true]) {
  Deno.test(`streamed load-edit-save preserves all bytes (${compressed})`, async () => {
    const original = createSaveGame(compressed);
    const payload = new Uint8Array(2 * 1024 * 1024 + 17);
    for (let index = 0; index < payload.length; index++) {
      payload[index] = (index * 17 + (index >>> 8)) & 255;
    }
    original.simData = payload.buffer;
    const save = parseSaveGame(writeSaveGame(original));
    save.settings.nextUniqueID += 1;
    save.gameObjects[0]!.gameObjects[0]!.scale.x = 42;
    const output = await new Response(writeSaveGameStream(save)).arrayBuffer();
    deepStrictEqual(parseSaveGame(output), save);
    deepStrictEqual(new Uint8Array(save.simData), payload);
    if (!compressed) deepStrictEqual(output, writeSaveGame(save));
  });

  Deno.test(`stream snapshots requested and intercepted buffers (${compressed})`, async () => {
    for (
      const options of [{ copyBuffers: true }, {
        interceptor: (x: unknown) => x,
      }]
    ) {
      const save = createSaveGame(compressed);
      save.simData = new Uint8Array(128 * 1024).fill(42).buffer;
      const expected = structuredClone(save);
      const output = writeSaveGameStream(save, options);
      new Uint8Array(save.simData).fill(17);
      deepStrictEqual(
        parseSaveGame(await new Response(output).arrayBuffer()),
        expected,
      );
    }
  });

  Deno.test(`stream cancellation and sink errors terminate (${compressed})`, async () => {
    const save = createSaveGame(compressed);
    save.simData = new Uint8Array(1024 * 1024).buffer;
    const reader = writeSaveGameStream(save).getReader();
    equal((await reader.read()).done, false);
    await reader.cancel("consumer finished");
    equal((await reader.read()).done, true);
    reader.releaseLock();
    const error = new Error("disk failure");
    await rejects(
      writeSaveGameStream(save).pipeTo(
        new WritableStream({
          write() {
            throw error;
          },
        }),
      ),
      (thrown) => thrown === error,
    );
  });
}

Deno.test("uncompressed stream bounds every emitted chunk", async () => {
  const save = createSaveGame();
  save.simData = new Uint8Array(2 * 1024 * 1024 + 17).buffer;
  let length = 0;
  for await (const chunk of writeSaveGameStream(save)) {
    if (chunk.byteLength > 64 * 1024) throw new Error("Unbounded chunk");
    length += chunk.byteLength;
  }
  equal(length, writeSaveGame(save).byteLength);
});

Deno.test("native decompression limit rejects expansion before parsing the body", () => {
  const save = createSaveGame(true);
  save.simData = new Uint8Array(1024 * 1024).buffer;
  const bytes = writeSaveGame(save);
  throws(() => parseSaveGame(bytes, { maxDecompressedBytes: 4096 }));
  deepStrictEqual(
    parseSaveGame(bytes, { maxDecompressedBytes: 2 * 1024 * 1024 }),
    save,
  );
  for (
    const limit of [0, -1, 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1]
  ) {
    throws(
      () => parseSaveGame(bytes, { maxDecompressedBytes: limit }),
      RangeError,
    );
  }
  // The limit belongs to decompression; it is not a cap on an uncompressed input.
  save.header.isCompressed = false;
  deepStrictEqual(
    parseSaveGame(writeSaveGame(save), { maxDecompressedBytes: 1 }),
    save,
  );
});

/** Record only readers acquired synchronously while constructing the pipeline. */
function observePipelineReaders<T>(create: () => T): {
  result: T;
  upstreams: ReadableStream<unknown>[];
} {
  const original = ReadableStream.prototype.getReader;
  const upstreams: ReadableStream<unknown>[] = [];
  Object.defineProperty(ReadableStream.prototype, "getReader", {
    configurable: true,
    writable: true,
    value: function (
      this: ReadableStream<unknown>,
      ...args: Parameters<typeof original>
    ) {
      upstreams.push(this);
      return Reflect.apply(original, this, args);
    },
  });
  try {
    return { result: create(), upstreams };
  } finally {
    Object.defineProperty(ReadableStream.prototype, "getReader", {
      configurable: true,
      writable: true,
      value: original,
    });
  }
}

function failurePayload(): ArrayBuffer {
  const bytes = new Uint8Array(1024 * 1024);
  let seed = 0x5354524d;
  for (let i = 0; i < bytes.length; i++) {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    bytes[i] = seed & 255;
  }
  return bytes.buffer;
}

for (const compressed of [false, true]) {
  Deno.test(`immediate cancellation closes the stream and releases upstream readers (${compressed})`, async () => {
    const save = createSaveGame(compressed);
    save.simData = failurePayload();
    const { result: stream, upstreams } = observePipelineReaders(() =>
      writeSaveGameStream(save)
    );
    await stream.cancel("canceled before reading");
    equal(stream.locked, false);
    for (const upstream of upstreams) equal(upstream.locked, false);
    const reader = stream.getReader();
    try {
      equal((await reader.read()).done, true);
    } finally {
      reader.releaseLock();
    }
    if (compressed) equal(upstreams.length >= 2, true);
  });

  Deno.test(`late sink failures stop a partially consumed stream and release readers (${compressed})`, async () => {
    const save = createSaveGame(compressed);
    save.simData = failurePayload();
    const { result: stream, upstreams } = observePipelineReaders(() =>
      writeSaveGameStream(save)
    );
    const failure = new Error("disk failed after writing several chunks");
    let writes = 0;
    let deliveredBytes = 0;
    await rejects(
      stream.pipeTo(
        new WritableStream<Uint8Array>({
          write(chunk) {
            deliveredBytes += chunk.length;
            if (++writes === 5) throw failure;
          },
        }),
      ),
      (error) => error === failure,
    );
    equal(writes, 5);
    equal(deliveredBytes > 64 * 1024, true);
    equal(stream.locked, false);
    for (const upstream of upstreams) equal(upstream.locked, false);
    const reader = stream.getReader();
    try {
      equal((await reader.read()).done, true);
    } finally {
      reader.releaseLock();
    }
  });

  Deno.test(`detached borrowed input errors propagate to the sink and release upstream readers (${compressed})`, async () => {
    const save = createSaveGame(compressed);
    save.simData = failurePayload();
    const { result: stream, upstreams } = observePipelineReaders(() =>
      writeSaveGameStream(save)
    );
    // Deliberately violate the documented borrowed-input lifetime to exercise a
    // genuine source error after serialization but before asynchronous reading.
    structuredClone(save.simData, { transfer: [save.simData] });
    equal(save.simData.byteLength, 0);
    let abortedWith: unknown;
    let rejectedWith: unknown;
    await rejects(
      stream.pipeTo(
        new WritableStream<Uint8Array>({
          abort(error) {
            abortedWith = error;
          },
        }),
      ),
      (error: unknown) => {
        rejectedWith = error;
        return error instanceof TypeError;
      },
    );
    equal(abortedWith, rejectedWith);
    equal(stream.locked, false);
    for (const upstream of upstreams) equal(upstream.locked, false);
    const reader = stream.getReader();
    try {
      await rejects(reader.read(), (error) => error === rejectedWith);
    } finally {
      reader.releaseLock();
    }
  });
}
