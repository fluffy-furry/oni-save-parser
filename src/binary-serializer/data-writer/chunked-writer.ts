import { Buffer } from "node:buffer";
import type {
  Quaternion,
  Vector3,
} from "../../save-structure/data-types/index.ts";
import type { LongNum } from "../types.ts";
import type { DataWriter } from "./interfaces.ts";

const DEFAULT_PAGE_SIZE = 64 * 1024;
const EMPTY_BYTES = new Uint8Array(0);
const EMPTY_VIEW = new DataView(EMPTY_BYTES.buffer);

export interface ChunkedDataWriterOptions {
  /** Owned scalar-page capacity; oversized strings receive a dedicated page. */
  pageSize?: number;
  /** Borrow large input blocks until finalization. Callers must keep them stable. */
  borrowBuffers?: boolean;
}

interface Chunk {
  bytes: Uint8Array;
  start: number;
  owned: boolean;
}
const textEncoder = new TextEncoder();

/**
 * A segmented writer for large saves. Scalar pages never recopy previous pages.
 * Unlike ArrayDataWriter, this writer can explicitly borrow large byte blocks,
 * and its finish methods seal it against subsequent writes.
 */
export class ChunkedDataWriter implements DataWriter {
  private _byteOffset = 0;
  private _chunkStart = 0;
  private _buffer: Uint8Array<ArrayBuffer> = EMPTY_BYTES;
  private _view: DataView = EMPTY_VIEW;
  private readonly _pageSize: number;
  private readonly _borrowBuffers: boolean;
  private _chunks: Chunk[] = [];
  private _finishedChunks: readonly Uint8Array[] | undefined;

  constructor(options: ChunkedDataWriterOptions = {}) {
    this._pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
    this._borrowBuffers = options.borrowBuffers ?? false;
    if (!Number.isSafeInteger(this._pageSize) || this._pageSize < 8) {
      throw new RangeError(
        "Page size must be a safe integer of at least eight bytes.",
      );
    }
  }

  get position(): number {
    return this._chunkStart + this._byteOffset;
  }

  writeByte(value: number): void {
    this._ensureCanWrite(1);
    this._view.setUint8(this._byteOffset, value);
    this._byteOffset += 1;
  }

  writeSByte(value: number): void {
    this._ensureCanWrite(1);
    this._view.setInt8(this._byteOffset, value);
    this._byteOffset += 1;
  }

  writeBytes(value: ArrayBuffer | ArrayBufferView): void {
    this._checkWritable(value.byteLength);
    const bytes = ArrayBuffer.isView(value)
      ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
      : new Uint8Array(value);
    if (bytes.byteLength >= this._pageSize) {
      this._flushPage(true);
      this._chunks.push({
        bytes: this._borrowBuffers ? bytes : bytes.slice(),
        start: this._chunkStart,
        owned: !this._borrowBuffers,
      });
      this._chunkStart += bytes.byteLength;
      return;
    }
    this._ensureCanWrite(bytes.byteLength);
    this._buffer.set(bytes, this._byteOffset);
    this._byteOffset += bytes.byteLength;
  }

  writeUInt16(value: number): void {
    this._ensureCanWrite(2);
    this._view.setUint16(this._byteOffset, value, true);
    this._byteOffset += 2;
  }

  writeInt16(value: number): void {
    this._ensureCanWrite(2);
    this._view.setInt16(this._byteOffset, value, true);
    this._byteOffset += 2;
  }

  writeUInt32(value: number): void {
    this._ensureCanWrite(4);
    this._view.setUint32(this._byteOffset, value, true);
    this._byteOffset += 4;
  }

  writeInt32(value: number): void {
    this._ensureCanWrite(4);
    this._view.setInt32(this._byteOffset, value, true);
    this._byteOffset += 4;
  }

  replaceInt32(value: number, position: number): void {
    this._checkWritable(0);
    if (
      !Number.isSafeInteger(position) || position < 0 ||
      position > this.position - 4
    ) {
      throw new RangeError(
        "Replacement must fit within the bytes already written.",
      );
    }
    if (position >= this._chunkStart) {
      this._view.setInt32(position - this._chunkStart, value, true);
      return;
    }
    const index = this._findChunk(position);
    const chunk = this._chunks[index]!;
    const offset = position - chunk.start;
    if (offset + 4 <= chunk.bytes.byteLength) {
      const bytes = this._ownChunk(index);
      new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setInt32(
        offset,
        value,
        true,
      );
      return;
    }
    // Arbitrary replacements may straddle page or borrowed-block boundaries.
    const bytes = new Uint8Array(4);
    new DataView(bytes.buffer).setInt32(0, value, true);
    for (let i = 0; i < 4; i++) {
      const target = position + i;
      if (target >= this._chunkStart) {
        this._buffer[target - this._chunkStart] = bytes[i]!;
      } else {
        const targetIndex = this._findChunk(target);
        const targetChunk = this._chunks[targetIndex]!;
        this._ownChunk(targetIndex)[target - targetChunk.start] = bytes[i]!;
      }
    }
  }

  writeUInt64(value: LongNum): void {
    // little-endian, lower comes first.
    this.writeInt32(value.lower);
    this.writeInt32(value.upper);
  }

  writeInt64(value: LongNum): void {
    // little-endian, lower comes first.
    this.writeInt32(value.lower);
    this.writeInt32(value.upper);
  }

  writeSingle(value: number): void {
    this._ensureCanWrite(4);
    this._view.setFloat32(this._byteOffset, value, true);
    this._byteOffset += 4;
  }

  writeDouble(value: number): void {
    this._ensureCanWrite(8);
    this._view.setFloat64(this._byteOffset, value, true);
    this._byteOffset += 8;
  }

  writeChars(value: string): void {
    // Store the low byte of each code unit without UTF-8 encoding.
    this._ensureCanWrite(value.length);
    for (let i = 0; i < value.length; i++) {
      this._view.setUint8(this._byteOffset + i, value.charCodeAt(i));
    }
    this._byteOffset += value.length;
  }

  writeKleiString(value: string | null): void {
    this._checkWritable(0);
    if (value === null) {
      this.writeInt32(-1);
    } else if (value.length === 0) {
      this.writeInt32(0);
    } else {
      // UTF-8 needs at most three bytes per UTF-16 code unit, including lone
      // surrogates. Use existing capacity directly for the common small case.
      // On growth, measure exactly to avoid tripling allocations for ASCII.
      const maximumBytes = value.length * 3;
      if (
        maximumBytes > this._buffer.byteLength - this._byteOffset - 4 ||
        maximumBytes > 0x7fffffff
      ) {
        const byteLength = Buffer.byteLength(value, "utf8");
        if (byteLength > 0x7fffffff) {
          throw new RangeError(
            "Klei strings cannot exceed 2,147,483,647 encoded bytes.",
          );
        }
        this._ensureCanWrite(4 + byteLength);
      }
      const { written } = textEncoder.encodeInto(
        value,
        this._buffer.subarray(this._byteOffset + 4),
      );
      this._view.setInt32(this._byteOffset, written, true);
      this._byteOffset += 4 + written;
    }
  }

  writeVector3(value: Vector3): void {
    this.writeSingle(value.x);
    this.writeSingle(value.y);
    this.writeSingle(value.z);
  }

  writeQuaternion(value: Quaternion): void {
    this.writeSingle(value.x);
    this.writeSingle(value.y);
    this.writeSingle(value.z);
    this.writeSingle(value.w);
  }

  /** Return an independent contiguous snapshot. */
  getBytes(): ArrayBuffer {
    return this._copyBytes().buffer;
  }

  /** Materialize a contiguous owned view; later appends may allocate new pages. */
  getBytesView(): Uint8Array {
    if (this._chunks.length === 0) {
      // Do not expose the shared empty sentinel: callers can transfer/detach it.
      if (this._byteOffset === 0) return new Uint8Array(0);
      return this._buffer.subarray(0, this._byteOffset);
    }
    const bytes = this._contiguousBytes();
    if (this._finishedChunks === undefined) {
      this._chunks = [];
      this._chunkStart = 0;
      this._buffer = bytes;
      this._view = new DataView(
        bytes.buffer,
        bytes.byteOffset,
        bytes.byteLength,
      );
      this._byteOffset = bytes.byteLength;
    } else {
      this._chunks = [{ bytes, start: 0, owned: true }];
      this._finishedChunks = Object.freeze([bytes]);
    }
    return bytes;
  }

  /**
   * Seal without concatenation. Large blocks may alias caller input when
   * borrowBuffers was enabled; keep that input stable while consuming chunks.
   */
  finishChunks(): readonly Uint8Array[] {
    if (this._finishedChunks === undefined) {
      this._flushPage();
      this._finishedChunks = Object.freeze(
        this._chunks.map((chunk) => chunk.bytes),
      );
    }
    return this._finishedChunks;
  }

  /** Seal and return exact owned storage, assembling at most once. */
  finish(): ArrayBuffer {
    this.finishChunks();
    const bytes = this._contiguousBytes();
    this._chunks = [{ bytes, start: 0, owned: true }];
    this._finishedChunks = Object.freeze([bytes]);
    return bytes.buffer;
  }

  private _checkWritable(length: number): void {
    if (this._finishedChunks !== undefined) {
      throw new Error(
        "Cannot write after the chunked writer has been finished.",
      );
    }
    if (
      !Number.isSafeInteger(length) || length < 0 ||
      !Number.isSafeInteger(this.position + length)
    ) {
      throw new RangeError(
        "Byte count must fit within a non-negative safe integer.",
      );
    }
  }

  private _ensureCanWrite(length: number): void {
    this._checkWritable(length);
    if (length <= this._buffer.byteLength - this._byteOffset) return;
    this._flushPage();
    this._buffer = new Uint8Array(Math.max(this._pageSize, length));
    this._view = new DataView(this._buffer.buffer);
  }

  private _flushPage(reuseRemainder = false): void {
    if (this._byteOffset > 0) {
      this._chunks.push({
        bytes: this._buffer.subarray(0, this._byteOffset),
        start: this._chunkStart,
        owned: true,
      });
      this._chunkStart += this._byteOffset;
    }
    // Scalar fields around opaque blocks can share a backing page without
    // sharing logical offsets. Do not abandon 64 KiB for each tiny header.
    this._buffer = reuseRemainder
      ? this._buffer.subarray(this._byteOffset)
      : EMPTY_BYTES;
    this._view = this._buffer.byteLength === 0 ? EMPTY_VIEW : new DataView(
      this._buffer.buffer,
      this._buffer.byteOffset,
      this._buffer.byteLength,
    );
    this._byteOffset = 0;
  }

  private _copyBytes(): Uint8Array<ArrayBuffer> {
    const bytes = new Uint8Array(this.position);
    for (const chunk of this._chunks) bytes.set(chunk.bytes, chunk.start);
    bytes.set(this._buffer.subarray(0, this._byteOffset), this._chunkStart);
    return bytes;
  }

  private _contiguousBytes(): Uint8Array<ArrayBuffer> {
    const chunk = this._chunks[0];
    if (
      this._chunks.length === 1 && this._byteOffset === 0 && chunk?.owned &&
      chunk.bytes.byteOffset === 0 &&
      chunk.bytes.byteLength === chunk.bytes.buffer.byteLength &&
      chunk.bytes.buffer instanceof ArrayBuffer
    ) {
      return new Uint8Array(chunk.bytes.buffer);
    }
    return this._copyBytes();
  }

  private _findChunk(position: number): number {
    let lower = 0;
    let upper = this._chunks.length - 1;
    while (lower < upper) {
      const middle = Math.ceil((lower + upper) / 2);
      if (this._chunks[middle]!.start <= position) lower = middle;
      else upper = middle - 1;
    }
    return lower;
  }

  private _ownChunk(index: number): Uint8Array {
    const chunk = this._chunks[index]!;
    if (!chunk.owned) {
      chunk.bytes = chunk.bytes.slice();
      chunk.owned = true;
    }
    return chunk.bytes;
  }
}
