import type {
  Quaternion,
  Vector3,
} from "../../save-structure/data-types/index.ts";
import type { LongNum } from "../types.ts";
import type { DataReader } from "./interfaces.ts";

const stringDecoder = new TextDecoder();

export class ArrayDataReader implements DataReader {
  private readonly _buffer: Uint8Array;
  private readonly _view: DataView;
  private _byteOffset = 0;

  constructor(buffer: ArrayBuffer | ArrayBufferView) {
    this._buffer = ArrayBuffer.isView(buffer)
      ? new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
      : new Uint8Array(buffer);
    this._view = new DataView(
      this._buffer.buffer,
      this._buffer.byteOffset,
      this._buffer.byteLength,
    );
  }

  get position(): number {
    return this._byteOffset;
  }

  readByte(): number {
    this._checkCanRead(1);
    const val = this._view.getUint8(this._byteOffset);
    this._byteOffset += 1;
    return val;
  }

  readSByte(): number {
    this._checkCanRead(1);
    const val = this._view.getInt8(this._byteOffset);
    this._byteOffset += 1;
    return val;
  }

  readBytes(length: number): ArrayBuffer {
    this._checkCanRead(length);
    const newBuffer = this._buffer.slice(
      this._byteOffset,
      length + this._byteOffset,
    );
    this._byteOffset += length;
    return newBuffer.buffer;
  }

  viewBytes(length: number): ArrayBufferView {
    this._checkCanRead(length);
    const view = new DataView(
      this._buffer.buffer,
      this._buffer.byteOffset + this._byteOffset,
      length,
    );
    this._byteOffset += length;
    return view;
  }

  readAllBytes(): ArrayBuffer {
    const newBuffer = this._buffer.slice(this._byteOffset);
    this._byteOffset = this._buffer.byteLength;
    return newBuffer.buffer;
  }

  viewAllBytes(): Uint8Array {
    const view = this._buffer.subarray(this._byteOffset);
    this._byteOffset = this._buffer.byteLength;
    return view;
  }

  readUInt16(): number {
    this._checkCanRead(2);
    const val = this._view.getUint16(this._byteOffset, true);
    this._byteOffset += 2;
    return val;
  }

  readInt16(): number {
    this._checkCanRead(2);
    const val = this._view.getInt16(this._byteOffset, true);
    this._byteOffset += 2;
    return val;
  }

  readUInt32(): number {
    this._checkCanRead(4);
    const val = this._view.getUint32(this._byteOffset, true);
    this._byteOffset += 4;
    return val;
  }
  readInt32(): number {
    this._checkCanRead(4);
    const val = this._view.getInt32(this._byteOffset, true);
    this._byteOffset += 4;
    return val;
  }

  readUInt64(): LongNum {
    this._checkCanRead(8);
    // little-endian, lower comes first.
    const lower = this.readInt32();
    const upper = this.readInt32();
    return {
      unsigned: true,
      lower,
      upper,
    };
  }

  readInt64(): LongNum {
    this._checkCanRead(8);
    // little-endian, lower comes first.
    const lower = this.readInt32();
    const upper = this.readInt32();
    return {
      unsigned: false,
      lower,
      upper,
    };
  }

  readSingle(): number {
    this._checkCanRead(4);
    const val = this._view.getFloat32(this._byteOffset, true);
    this._byteOffset += 4;
    return val;
  }

  readDouble(): number {
    this._checkCanRead(8);
    const val = this._view.getFloat64(this._byteOffset, true);
    this._byteOffset += 8;
    return val;
  }

  readChars(length: number): string {
    // These are raw byte-valued characters, not UTF-8 encoded text.
    this._checkCanRead(length);
    const bytes = this._buffer.subarray(
      this._byteOffset,
      this._byteOffset + length,
    );
    this._byteOffset += length;
    let str = "";
    for (let i = 0; i < bytes.length; i++) {
      str += String.fromCharCode(bytes[i]!);
    }
    return str;
  }

  readKleiString(): string | null {
    // Shifting _byteOffset is done by our other calls.  We do not need to manage it.
    const count = this.readInt32();
    if (count === -1) {
      return null;
    }
    if (count === 0) {
      return "";
    }
    if (count > 0) {
      // Note: the length is the encoded length, not the character count.
      return stringDecoder.decode(this.viewBytes(count));
    }

    throw new RangeError("Invalid byte count in readKleiString: " + count);
  }

  readVector3(): Vector3 {
    this._checkCanRead(12);
    const vec: Vector3 = {
      x: this.readSingle(),
      y: this.readSingle(),
      z: this.readSingle(),
    };
    return vec;
  }

  readQuaternion(): Quaternion {
    this._checkCanRead(16);
    const q: Quaternion = {
      x: this.readSingle(),
      y: this.readSingle(),
      z: this.readSingle(),
      w: this.readSingle(),
    };
    return q;
  }

  skipBytes(length: number): void {
    this._checkCanRead(length);
    this._byteOffset += length;
  }

  private _checkCanRead(length: number): void {
    if (!Number.isSafeInteger(length) || length < 0) {
      throw new RangeError("Byte count must be a non-negative safe integer.");
    }
    if (length > this._view.byteLength - this._byteOffset) {
      throw new RangeError(
        `Cannot read ${length} byte${
          length !== 1 ? "s" : ""
        }: Buffer length exceeded.`,
      );
    }
  }
}
