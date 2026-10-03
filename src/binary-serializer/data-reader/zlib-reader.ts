import { inflateSync } from "node:zlib";
import { ArrayDataReader } from "./array-reader.ts";

export interface ZlibDataReaderOptions {
  /** Maximum decompressed bytes; forwarded to the native zlib decoder. */
  maxOutputLength?: number;
}

export class ZlibDataReader extends ArrayDataReader {
  constructor(data: Uint8Array, options: ZlibDataReaderOptions = {}) {
    // ONI uses Ionic.Zlib.  More specifically, this:
    //  https://github.com/jstedfast/Ionic.Zlib/blob/master/Ionic.Zlib/ZlibStream.cs

    const inflated = inflateSync(data, {
      windowBits: 15,
      ...options,
      info: true,
    }) as unknown as {
      buffer: Uint8Array;
      engine: { bytesWritten: number };
    };
    const remaining = data.byteLength - inflated.engine.bytesWritten;
    if (remaining !== 0) {
      throw new Error(
        `Unexpected trailing compressed data: ${remaining} bytes.`,
      );
    }
    super(inflated.buffer);
  }
}
