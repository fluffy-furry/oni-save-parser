import type { DataReader } from "./data-reader/index.ts";

import type { DataWriter } from "./data-writer/index.ts";

export interface BinaryParsable {
  parse(reader: DataReader): void;
}

export interface BinaryWritable {
  write(writer: DataWriter): void;
}

export type BinarySerializable = BinaryParsable & BinaryWritable;
