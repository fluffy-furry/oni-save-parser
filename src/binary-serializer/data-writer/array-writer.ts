import { Buffer } from "node:buffer";
import type {
  Quaternion,
  Vector3,
} from "../../save-structure/data-types/index.ts";
import type { LongNum } from "../types.ts";
import type { DataWriter } from "./interfaces.ts";

const INITIAL_CAPACITY = 4096;
const textEncoder = new TextEncoder();

export class ArrayDataWriter implements DataWriter {
  private _byteOffset = 0;
  private _buffer: Uint8Array<ArrayBuffer>;
  private _view: DataView;

  constructor(initialCapacity = INITIAL_CAPACITY) {
    if (!Number.isSafeInteger(initialCapacity) || initialCapacity < 0) {
      throw new RangeError(
        "Initial capacity must be a non-negative safe integer.",
      );
    }
    this._buffer = new Uint8Array(initialCapacity);
    this._view = new DataView(this._buffer.buffer);
  }

  get position(): number {
    return this._byteOffset;
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
    this._ensureCanWrite(value.byteLength);

    if (value instanceof Uint8Array) {
      this._buffer.set(value, this._byteOffset);
    } else if (ArrayBuffer.isView(value)) {
      // Some other type of view.  Treat it as a byte array.
      this._buffer.set(
        new Uint8Array(value.buffer, value.byteOffset, value.byteLength),
        this._byteOffset,
      );
    } else {
      this._buffer.set(new Uint8Array(value), this._byteOffset);
    }

    this._byteOffset += value.byteLength;
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
    if (
      !Number.isSafeInteger(position) || position < 0 ||
      position > this._byteOffset - 4
    ) {
      throw new RangeError(
        "Replacement must fit within the bytes already written.",
      );
    }
    this._view.setInt32(position, value, true);
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

  getBytes(): ArrayBuffer {
    return this._buffer.slice(0, this._byteOffset).buffer;
  }

  getBytesView(): Uint8Array {
    return this._buffer.subarray(0, this._byteOffset);
  }

  /**
   * Ensure there is enough room in the buffer to write
   * the specified amount of bytes.
   * @param length The number of bytes intending to be written.
   */
  private _ensureCanWrite(length: number): void {
    const required = this._byteOffset + length;
    if (
      !Number.isSafeInteger(length) || length < 0 ||
      !Number.isSafeInteger(required)
    ) {
      throw new RangeError(
        "Byte count must fit within a non-negative safe integer.",
      );
    }
    if (required <= this._buffer.byteLength) return;

    // Geometric growth keeps repeated writes amortized O(n), including large saves.
    const newLength = Math.max(
      required,
      this._buffer.byteLength * 2,
      INITIAL_CAPACITY,
    );
    const newBuffer = new Uint8Array(newLength);
    newBuffer.set(this._buffer.subarray(0, this._byteOffset));
    this._buffer = newBuffer;
    this._view = new DataView(this._buffer.buffer);
  }
}
