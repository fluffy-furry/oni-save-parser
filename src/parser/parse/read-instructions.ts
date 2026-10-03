import type { ParseIterator } from "./parser.ts";
import type { DataReader } from "../../binary-serializer/data-reader/interfaces.ts";

export interface BasicReadInstruction {
  type: "read";
  dataType: string;
}

export interface ReadByteInstruction extends BasicReadInstruction {
  dataType: "byte";
}
export function readByte(): ReadByteInstruction {
  return {
    type: "read",
    dataType: "byte",
  };
}

export interface ReadSByteInstruction extends BasicReadInstruction {
  dataType: "signed-byte";
}
export function readSByte(): ReadSByteInstruction {
  return {
    type: "read",
    dataType: "signed-byte",
  };
}

export interface ReadBytesInstruction extends BasicReadInstruction {
  dataType: "byte-array";
  length?: number | undefined;
}
export function readBytes(length?: number): ReadBytesInstruction {
  return {
    type: "read",
    dataType: "byte-array",
    length,
  };
}

export interface ReadUInt16Instruction extends BasicReadInstruction {
  dataType: "uint-16";
}
export function readUInt16(): ReadUInt16Instruction {
  return {
    type: "read",
    dataType: "uint-16",
  };
}

export interface ReadInt16Instruction extends BasicReadInstruction {
  dataType: "int-16";
}
export function readInt16(): ReadInt16Instruction {
  return {
    type: "read",
    dataType: "int-16",
  };
}

export interface ReadUInt32Instruction extends BasicReadInstruction {
  dataType: "uint-32";
}
export function readUInt32(): ReadUInt32Instruction {
  return {
    type: "read",
    dataType: "uint-32",
  };
}

export interface ReadInt32Instruction extends BasicReadInstruction {
  dataType: "int-32";
}
export function readInt32(): ReadInt32Instruction {
  return {
    type: "read",
    dataType: "int-32",
  };
}

export interface ReadUInt64Instruction extends BasicReadInstruction {
  dataType: "uint-64";
}
export function readUInt64(): ReadUInt64Instruction {
  return {
    type: "read",
    dataType: "uint-64",
  };
}

export interface ReadInt64Instruction extends BasicReadInstruction {
  dataType: "int-64";
}
export function readInt64(): ReadInt64Instruction {
  return {
    type: "read",
    dataType: "int-64",
  };
}

export interface ReadSingleInstruction extends BasicReadInstruction {
  dataType: "single";
}
export function readSingle(): ReadSingleInstruction {
  return {
    type: "read",
    dataType: "single",
  };
}

export interface ReadDoubleInstruction extends BasicReadInstruction {
  dataType: "double";
}
export function readDouble(): ReadDoubleInstruction {
  return {
    type: "read",
    dataType: "double",
  };
}

export interface ReadCharsInstruction extends BasicReadInstruction {
  dataType: "chars";
  length: number;
}
export function readChars(length: number): ReadCharsInstruction {
  return {
    type: "read",
    dataType: "chars",
    length,
  };
}

export interface ReadKleiStringInstruction extends BasicReadInstruction {
  dataType: "klei-string";
}
export function readKleiString(): ReadKleiStringInstruction {
  return {
    type: "read",
    dataType: "klei-string",
  };
}

export interface SkipBytesInstruction extends BasicReadInstruction {
  dataType: "skip-bytes";
  length: number;
}
export function skipBytes(length: number): SkipBytesInstruction {
  return {
    type: "read",
    dataType: "skip-bytes",
    length,
  };
}

export interface ReadCompressedInstruction extends BasicReadInstruction {
  dataType: "compressed";
  parser: ParseIterator<unknown>;
}
export function readCompressed(
  parser: ParseIterator<unknown>,
): ReadCompressedInstruction {
  return {
    type: "read",
    dataType: "compressed",
    parser,
  };
}

export interface GetReaderPosition extends BasicReadInstruction {
  dataType: "reader-position";
}
export function getReaderPosition(): GetReaderPosition {
  return {
    type: "read",
    dataType: "reader-position",
  };
}

export type ReadInstruction =
  | ReadWithInstruction
  | ReadByteInstruction
  | ReadSByteInstruction
  | ReadBytesInstruction
  | ReadUInt16Instruction
  | ReadInt16Instruction
  | ReadUInt32Instruction
  | ReadInt32Instruction
  | ReadUInt64Instruction
  | ReadInt64Instruction
  | ReadSingleInstruction
  | ReadDoubleInstruction
  | ReadCharsInstruction
  | ReadKleiStringInstruction
  | SkipBytesInstruction
  | ReadCompressedInstruction
  | GetReaderPosition;

export type ReadDataTypes = ReadInstruction["dataType"];

/** Execute an operation-local compiled decoder as one trampoline instruction. */
export interface ReadWithInstruction<T = unknown> extends BasicReadInstruction {
  dataType: "with";
  callback: (reader: DataReader) => T;
}

export function readWith<T>(
  callback: (reader: DataReader) => T,
): ReadWithInstruction<T> {
  return { type: "read", dataType: "with", callback };
}

export function isReadInstruction(value: unknown): value is ReadInstruction {
  return typeof value === "object" && value !== null &&
    "type" in value && value.type === "read" &&
    "dataType" in value && typeof value.dataType === "string";
}
