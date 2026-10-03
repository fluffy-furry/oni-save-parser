import type { LongNum } from "../../binary-serializer/index.ts";

import type { UnparseIterator } from "./unparser.ts";
import type { DataWriter } from "../../binary-serializer/data-writer/interfaces.ts";

export interface BasicWriteInstruction {
  type: "write";
  dataType: string;
}

export interface WriteByteInstruction extends BasicWriteInstruction {
  dataType: "byte";
  value: number;
}
export function writeByte(value: number): WriteByteInstruction {
  return {
    type: "write",
    dataType: "byte",
    value,
  };
}

export interface WriteSByteInstruction extends BasicWriteInstruction {
  dataType: "signed-byte";
  value: number;
}
export function writeSByte(value: number): WriteSByteInstruction {
  return {
    type: "write",
    dataType: "signed-byte",
    value,
  };
}

export interface WriteBytesInstruction extends BasicWriteInstruction {
  dataType: "byte-array";
  value: ArrayBuffer | ArrayBufferView;
}
export function writeBytes(
  bytes: ArrayBuffer | ArrayBufferView,
): WriteBytesInstruction {
  return {
    type: "write",
    dataType: "byte-array",
    value: bytes,
  };
}

export interface WriteUInt16Instruction extends BasicWriteInstruction {
  dataType: "uint-16";
  value: number;
}
export function writeUInt16(value: number): WriteUInt16Instruction {
  return {
    type: "write",
    dataType: "uint-16",
    value,
  };
}

export interface WriteInt16Instruction extends BasicWriteInstruction {
  dataType: "int-16";
  value: number;
}
export function writeInt16(value: number): WriteInt16Instruction {
  return {
    type: "write",
    dataType: "int-16",
    value,
  };
}

export interface WriteUInt32Instruction extends BasicWriteInstruction {
  dataType: "uint-32";
  value: number;
}
export function writeUInt32(value: number): WriteUInt32Instruction {
  return {
    type: "write",
    dataType: "uint-32",
    value,
  };
}

export interface WriteInt32Instruction extends BasicWriteInstruction {
  dataType: "int-32";
  value: number;
}
export function writeInt32(value: number): WriteInt32Instruction {
  return {
    type: "write",
    dataType: "int-32",
    value,
  };
}

export interface WriteUInt64Instruction extends BasicWriteInstruction {
  dataType: "uint-64";
  value: LongNum;
}
export function writeUInt64(value: LongNum): WriteUInt64Instruction {
  return {
    type: "write",
    dataType: "uint-64",
    value,
  };
}

export interface WriteInt64Instruction extends BasicWriteInstruction {
  dataType: "int-64";
  value: LongNum;
}
export function writeInt64(value: LongNum): WriteInt64Instruction {
  return {
    type: "write",
    dataType: "int-64",
    value,
  };
}

export interface WriteSingleInstruction extends BasicWriteInstruction {
  dataType: "single";
  value: number;
}
export function writeSingle(value: number): WriteSingleInstruction {
  return {
    type: "write",
    dataType: "single",
    value,
  };
}

export interface WriteDoubleInstruction extends BasicWriteInstruction {
  dataType: "double";
  value: number;
}
export function writeDouble(value: number): WriteDoubleInstruction {
  return {
    type: "write",
    dataType: "double",
    value,
  };
}

export interface WriteCharsInstruction extends BasicWriteInstruction {
  dataType: "chars";
  value: string;
}
export function writeChars(value: string): WriteCharsInstruction {
  return {
    type: "write",
    dataType: "chars",
    value,
  };
}

export interface WriteKleiStringInstruction extends BasicWriteInstruction {
  dataType: "klei-string";
  value: string | null;
}
export function writeKleiString(
  value: string | null,
): WriteKleiStringInstruction {
  return {
    type: "write",
    dataType: "klei-string",
    value,
  };
}

export interface GetWriterPositionInstruction extends BasicWriteInstruction {
  dataType: "writer-position";
}
export function getWriterPosition(): GetWriterPositionInstruction {
  return {
    type: "write",
    dataType: "writer-position",
  };
}

export interface DataLengthToken {
  writePosition: number;
  startPosition: number;
}

/** Prevent length prefixes from wrapping; legacy advisory lengths may be negative. */
export function checkedDataLength(length: number): number {
  if (
    !Number.isInteger(length) || length < -0x80000000 || length > 0x7fffffff
  ) {
    throw new RangeError("Data length must fit in a signed 32-bit integer.");
  }
  return length;
}

export interface WriteDataLengthBeginInstruction extends BasicWriteInstruction {
  dataType: "data-length:begin";
  startPosition?: number | undefined;
}
export function writeDataLengthBegin(
  startPosition?: number,
): WriteDataLengthBeginInstruction {
  return {
    type: "write",
    dataType: "data-length:begin",
    startPosition,
  };
}

export interface WriteDataLengthEndInstruction extends BasicWriteInstruction {
  dataType: "data-length:end";
  token: DataLengthToken;
}
export function writeDataLengthEnd(
  token: DataLengthToken,
): WriteDataLengthEndInstruction {
  return {
    type: "write",
    dataType: "data-length:end",
    token,
  };
}

export interface WriteCompressedInstruction extends BasicWriteInstruction {
  dataType: "compressed";
  unparser: UnparseIterator<unknown>;
}
export function writeCompressed(
  unparser: UnparseIterator<unknown>,
): WriteCompressedInstruction {
  return {
    type: "write",
    dataType: "compressed",
    unparser,
  };
}

export type WriteInstruction =
  | WriteWithInstruction
  | WriteByteInstruction
  | WriteSByteInstruction
  | WriteBytesInstruction
  | WriteUInt16Instruction
  | WriteInt16Instruction
  | WriteUInt32Instruction
  | WriteInt32Instruction
  | WriteUInt64Instruction
  | WriteInt64Instruction
  | WriteSingleInstruction
  | WriteDoubleInstruction
  | WriteCharsInstruction
  | WriteKleiStringInstruction
  | GetWriterPositionInstruction
  | WriteDataLengthBeginInstruction
  | WriteDataLengthEndInstruction
  | WriteCompressedInstruction;

export type WriteDataTypes = WriteInstruction["dataType"];

/** Execute an operation-local compiled encoder as one trampoline instruction. */
export interface WriteWithInstruction extends BasicWriteInstruction {
  dataType: "with";
  callback: (writer: DataWriter) => void;
}

export function writeWith(
  callback: (writer: DataWriter) => void,
): WriteWithInstruction {
  return { type: "write", dataType: "with", callback };
}

export function isWriteInstruction(value: unknown): value is WriteInstruction {
  return typeof value === "object" && value !== null &&
    "type" in value && value.type === "write" &&
    "dataType" in value && typeof value.dataType === "string";
}
