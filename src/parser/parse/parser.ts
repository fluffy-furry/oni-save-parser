import {
  type DataReader,
  ZlibDataReader,
} from "../../binary-serializer/index.ts";

import {
  isReadInstruction,
  type ReadDataTypes,
  type ReadInstruction,
} from "./read-instructions.ts";
import { ParseError } from "../errors.ts";
import { isMetaInstruction } from "../types.ts";

// Instructions have heterogeneous response types; each generator annotates
// its returned data, while the trampoline dispatches the yielded instructions.
// deno-lint-ignore no-explicit-any -- Generator next values depend on each yielded instruction.
export type ParseIterator<T> = Generator<unknown, T, any>;
export type ParseInterceptor = (value: unknown) => unknown;

export interface ParseExecutionOptions {
  maxDecompressedBytes?: number;
}

export function parse<T>(
  reader: DataReader,
  readParser: ParseIterator<T>,
  interceptor?: ParseInterceptor,
  options: ParseExecutionOptions = {},
): T {
  let nextValue: unknown;
  while (true) {
    try {
      const { value: yielded, done } = readParser.next(nextValue);
      const value = interceptor ? interceptor(yielded) : yielded;
      // A returned object is data, even when it happens to resemble an instruction.
      if (done) return value as T;
      if (isMetaInstruction(value)) continue;
      if (!isReadInstruction(value)) {
        throw new TypeError("Cannot yield a non-parse-instruction.");
      }
      nextValue = executeReadInstruction(reader, value, interceptor, options);
    } catch (error) {
      throw ParseError.create(error, reader.position);
    }
  }
}

type TypedReadInstruction<T extends ReadDataTypes> = Extract<
  ReadInstruction,
  { dataType: T }
>;

type ReadParser<T extends ReadDataTypes> = (
  reader: DataReader,
  inst: TypedReadInstruction<T>,
  interceptor: ParseInterceptor | undefined,
  options: ParseExecutionOptions,
) => unknown;
type ReadParsers = { [P in ReadDataTypes]: ReadParser<P> };

const readParsers: ReadParsers = {
  with: (reader, instruction) => instruction.callback(reader),
  byte: (r) => r.readByte(),
  "signed-byte": (r) => r.readSByte(),
  "byte-array": (r, i) =>
    i.length == null ? r.readAllBytes() : r.readBytes(i.length),
  "uint-16": (r) => r.readUInt16(),
  "int-16": (r) => r.readInt16(),
  "uint-32": (r) => r.readUInt32(),
  "int-32": (r) => r.readInt32(),
  "uint-64": (r) => r.readUInt64(),
  "int-64": (r) => r.readInt64(),
  single: (r) => r.readSingle(),
  double: (r) => r.readDouble(),
  chars: (r, i) => r.readChars(i.length),
  "klei-string": (r) => r.readKleiString(),
  "skip-bytes": (r, i) => r.skipBytes(i.length),
  compressed: (r, i, interceptor, options) => {
    const reader = new ZlibDataReader(r.viewAllBytes(), {
      ...(options.maxDecompressedBytes === undefined ? {} : {
        maxOutputLength: options.maxDecompressedBytes,
      }),
    });
    const result = parse(reader, i.parser, interceptor, options);
    return result;
  },
  "reader-position": (r) => r.position,
};

function executeReadInstruction<T extends ReadDataTypes>(
  reader: DataReader,
  inst: TypedReadInstruction<T>,
  interceptor: ParseInterceptor | undefined,
  options: ParseExecutionOptions,
): unknown {
  if (inst.type !== "read") {
    throw new Error("Expected a read parse instruction.");
  }

  const readFunc = readParsers[inst.dataType] as ReadParser<T>;
  if (!Object.hasOwn(readParsers, inst.dataType)) {
    throw new TypeError(`Unknown read instruction: ${inst.dataType}`);
  }
  return readFunc(reader, inst, interceptor, options);
}
