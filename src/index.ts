import { deflateSync } from "node:zlib";
import {
  ArrayDataReader,
  ChunkedDataWriter,
} from "./binary-serializer/index.ts";

import {
  parse,
  type ParseInterceptor,
  unparse,
  type UnparseInterceptor,
} from "./parser/index.ts";

import type { SaveGame } from "./save-structure/index.ts";
import {
  parseSaveGame as saveGameParser,
  type SaveGameParserOptions,
  unparseSaveGame as saveGameUnparser,
} from "./save-structure/parser.ts";

export * from "./save-structure/index.ts";
export * from "./save-structure/data-types/index.ts";
export * from "./binary-serializer/types.ts";
export { ParseError } from "./parser/index.ts";

export { progressReporter } from "./progress/index.ts";
export { tagReporter } from "./tagger/index.ts";

export {
  E_VERSION_MAJOR,
  E_VERSION_MINOR,
} from "./save-structure/version-validator.ts";

export interface ParseOptions extends SaveGameParserOptions {
  interceptor?: ParseInterceptor;
  /** Optional limit on the inflated body, enforced by the native decompressor. */
  maxDecompressedBytes?: number;
}

export function parseSaveGame(
  data: ArrayBuffer | ArrayBufferView,
  interceptor?: ParseInterceptor,
): SaveGame;
export function parseSaveGame(
  data: ArrayBuffer | ArrayBufferView,
  options?: ParseOptions,
): SaveGame;
export function parseSaveGame(
  data: ArrayBuffer | ArrayBufferView,
  opts?: ParseInterceptor | ParseOptions,
): SaveGame {
  let interceptor: ParseInterceptor | undefined = undefined;
  let parserOptions: SaveGameParserOptions = {};
  let maxDecompressedBytes: number | undefined;
  if (typeof opts === "function") {
    interceptor = opts;
  } else if (opts != null) {
    parserOptions = opts;
    interceptor = opts.interceptor;
    maxDecompressedBytes = opts.maxDecompressedBytes;
    if (
      maxDecompressedBytes !== undefined &&
      (!Number.isSafeInteger(maxDecompressedBytes) || maxDecompressedBytes < 1)
    ) {
      throw new RangeError(
        "maxDecompressedBytes must be a positive safe integer.",
      );
    }
  }
  const reader = new ArrayDataReader(data);
  const saveGame = parse<SaveGame>(
    reader,
    saveGameParser(parserOptions, interceptor === undefined),
    interceptor,
    maxDecompressedBytes === undefined ? {} : { maxDecompressedBytes },
  );
  return saveGame;
}

export function writeSaveGame(
  save: SaveGame,
  interceptor?: UnparseInterceptor,
): ArrayBuffer {
  const writer = new ChunkedDataWriter({
    borrowBuffers: interceptor === undefined,
  });
  unparse(
    writer,
    saveGameUnparser(
      save,
      interceptor === undefined,
      interceptor === undefined,
    ),
    interceptor,
    {
      writeCompressed: (output, body, bodyInterceptor) => {
        const bodyWriter = new ChunkedDataWriter({
          borrowBuffers: bodyInterceptor === undefined,
        });
        unparse(bodyWriter, body, bodyInterceptor);
        output.writeBytes(deflateSync(bodyWriter.finish()));
      },
    },
  );
  return writer.finish();
}

export interface WriteStreamOptions {
  interceptor?: UnparseInterceptor;
  /** Copy opaque bytes during serialization instead of borrowing them. */
  copyBuffers?: boolean;
}

/**
 * Serialize once, then emit bounded chunks with native streaming compression.
 * Keep the save's binary payloads unchanged until consumption completes, or set
 * copyBuffers to snapshot them. Intercepted writes always snapshot input bytes.
 */
export function writeSaveGameStream(
  save: SaveGame,
  options: WriteStreamOptions = {},
): ReadableStream<Uint8Array> {
  const { interceptor } = options;
  const writerOptions = {
    borrowBuffers: !options.copyBuffers && interceptor === undefined,
  };
  const writer = new ChunkedDataWriter(writerOptions);
  let compressedBody: readonly Uint8Array[] | undefined;
  let prefixLength: number | undefined;
  unparse(
    writer,
    saveGameUnparser(
      save,
      interceptor === undefined,
      interceptor === undefined,
    ),
    interceptor,
    {
      writeCompressed: (output, body, bodyInterceptor) => {
        if (compressedBody !== undefined) {
          throw new Error("A save can contain only one compressed body.");
        }
        prefixLength = output.position;
        const bodyWriter = new ChunkedDataWriter(writerOptions);
        unparse(bodyWriter, body, bodyInterceptor);
        compressedBody = bodyWriter.finishChunks();
      },
    },
  );
  if (prefixLength !== undefined && writer.position !== prefixLength) {
    throw new Error("Unexpected data after the compressed save body.");
  }
  const prefix = streamChunks(writer.finishChunks());
  if (compressedBody === undefined) return prefix;

  const body = streamChunks(compressedBody).pipeThrough(
    new CompressionStream("deflate"),
  );
  return concatenateStreams(prefix, body);
}

/** Split borrowed blocks too: backpressure must not enqueue a giant blob. */
function streamChunks(
  chunks: readonly Uint8Array[],
): ReadableStream<Uint8Array<ArrayBuffer>> {
  let index = 0;
  let offset = 0;
  return new ReadableStream({
    pull(controller) {
      try {
        const chunk = chunks[index];
        if (chunk === undefined) {
          chunks = [];
          controller.close();
          return;
        }
        const end = Math.min(offset + 64 * 1024, chunk.byteLength);
        const part = chunk.subarray(offset, end);
        controller.enqueue(
          part.buffer instanceof ArrayBuffer
            ? new Uint8Array(part.buffer, part.byteOffset, part.byteLength)
            : part.slice(),
        );
        offset = end;
        if (offset === chunk.byteLength) {
          index++;
          offset = 0;
          if (index === chunks.length) {
            chunks = [];
            controller.close();
          }
        }
      } catch (error) {
        // An errored source is not canceled again by the stream machinery.
        // Release remaining borrowed blocks before propagating a read failure.
        chunks = [];
        throw error;
      }
    },
    cancel() {
      chunks = [];
    },
  });
}

function concatenateStreams(
  prefix: ReadableStream<Uint8Array>,
  body: ReadableStream<Uint8Array>,
): ReadableStream<Uint8Array> {
  const readers: (ReadableStreamDefaultReader<Uint8Array> | undefined)[] = [
    prefix.getReader(),
    body.getReader(),
  ];
  let index = 0;
  let cleanup: Promise<void> | undefined;
  function dispose(reason: unknown): Promise<void> {
    return cleanup ??= (async () => {
      await Promise.allSettled(readers.map((reader) => reader?.cancel(reason)));
      for (let i = 0; i < readers.length; i++) {
        readers[i]?.releaseLock();
        readers[i] = undefined;
      }
    })();
  }
  return new ReadableStream({
    async pull(controller) {
      try {
        while (index < readers.length) {
          const reader = readers[index];
          if (!reader) return;
          const result = await reader.read();
          if (cleanup) return;
          if (result.done) {
            reader.releaseLock();
            readers[index++] = undefined;
          } else {
            controller.enqueue(result.value);
            return;
          }
        }
        controller.close();
      } catch (error) {
        await dispose(error);
        controller.error(error);
      }
    },
    cancel: dispose,
  });
}
