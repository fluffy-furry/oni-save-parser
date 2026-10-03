import {
  type DataWriter,
  ZlibDataWriter,
} from "../../binary-serializer/index.ts";

import {
  checkedDataLength,
  type DataLengthToken,
  isWriteInstruction,
  type WriteDataTypes,
  type WriteInstruction,
} from "./write-instructions.ts";
import { ParseError } from "../errors.ts";
import { isMetaInstruction } from "../types.ts";

// deno-lint-ignore no-explicit-any -- Generator next values depend on each yielded instruction.
export type UnparseIterator<T = void> = Generator<unknown, T, any>;
export type UnparseInterceptor = (value: unknown) => unknown;

/** Internal output adapter used for chunked and streaming save serialization. */
export interface UnparseExecutionOptions {
  writeCompressed?: (
    writer: DataWriter,
    unparser: UnparseIterator<unknown>,
    interceptor: UnparseInterceptor | undefined,
  ) => void;
}

export function unparse<T>(
  writer: DataWriter,
  unparser: UnparseIterator<T>,
  interceptor?: UnparseInterceptor,
  options: UnparseExecutionOptions = {},
): T {
  let nextValue: unknown;
  while (true) {
    try {
      const { value: yielded, done } = unparser.next(nextValue);
      const value = interceptor ? interceptor(yielded) : yielded;
      if (done) return value as T;
      if (isMetaInstruction(value)) continue;
      if (!isWriteInstruction(value)) {
        throw new TypeError("Cannot yield a non-parse-instruction.");
      }
      if (value.dataType === "compressed" && options.writeCompressed) {
        nextValue = options.writeCompressed(
          writer,
          value.unparser,
          interceptor,
        );
      } else {
        nextValue = executeWriteInstruction(writer, value, interceptor);
      }
    } catch (error) {
      throw ParseError.create(error, writer.position);
    }
  }
}

type TypedWriteInstruction<T extends WriteDataTypes> = Extract<
  WriteInstruction,
  { dataType: T }
>;
type WriteParser<T extends WriteDataTypes> = (
  writer: DataWriter,
  inst: TypedWriteInstruction<T>,
  interceptor?: UnparseInterceptor,
) => unknown;
type WriteParsers = { [P in WriteDataTypes]: WriteParser<P> };

const writeParsers: WriteParsers = {
  with: (writer, instruction) => instruction.callback(writer),
  byte: (r, i) => r.writeByte(i.value),
  "signed-byte": (r, i) => r.writeSByte(i.value),
  "byte-array": (r, i) => r.writeBytes(i.value),
  "uint-16": (r, i) => r.writeUInt16(i.value),
  "int-16": (r, i) => r.writeInt16(i.value),
  "uint-32": (r, i) => r.writeUInt32(i.value),
  "int-32": (r, i) => r.writeInt32(i.value),
  "uint-64": (r, i) => r.writeUInt64(i.value),
  "int-64": (r, i) => r.writeInt64(i.value),
  single: (r, i) => r.writeSingle(i.value),
  double: (r, i) => r.writeDouble(i.value),
  chars: (r, i) => r.writeChars(i.value),
  "klei-string": (r, i) => r.writeKleiString(i.value),
  "writer-position": (r) => r.position,
  "data-length:begin": (r, i) => {
    const token: DataLengthToken = {
      writePosition: r.position,
      startPosition: i.startPosition ?? r.position,
    };
    r.writeInt32(0);
    return token;
  },
  "data-length:end": (r, i) =>
    r.replaceInt32(
      checkedDataLength(r.position - (i.token.startPosition + 4)),
      i.token.writePosition,
    ),
  compressed: (r, i, interceptor) => {
    const writer = new ZlibDataWriter();
    unparse(writer, i.unparser, interceptor);
    r.writeBytes(writer.getBytesView());
  },
};

function executeWriteInstruction<T extends WriteDataTypes>(
  writer: DataWriter,
  inst: TypedWriteInstruction<T>,
  interceptor?: UnparseInterceptor,
): unknown {
  if (inst.type !== "write") {
    throw new Error("Expected a write parse instruction.");
  }

  const writeFunc = writeParsers[inst.dataType] as WriteParser<T>;
  if (!Object.hasOwn(writeParsers, inst.dataType)) {
    throw new TypeError(`Unknown write instruction: ${inst.dataType}`);
  }
  return writeFunc(writer, inst, interceptor);
}
