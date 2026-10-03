import { checkedDataLength } from "../../parser/unparse/write-instructions.ts";
import type { DataReader } from "../../binary-serializer/data-reader/interfaces.ts";
import type { DataWriter } from "../../binary-serializer/data-writer/interfaces.ts";
import {
  getTypeCode,
  isValueType,
  SerializationTypeCode as Code,
  type TypeInfo,
  type TypeTemplates,
} from "./type-templates.ts";
import { createTemplateLookup } from "./template-lookup.ts";
import {
  checkedCount,
  fracToByte,
  requireLong,
  requireNumber,
  requireObject,
  requireString,
} from "./value-validation.ts";

export interface TemplateCodec {
  read(reader: DataReader): unknown;
  write(writer: DataWriter, value: unknown): void;
}
export type CompiledTemplates = ReadonlyMap<string, TemplateCodec>;

/**
 * Compile closures once per operation. Never retain this snapshot across public
 * template edits, and never enable it when instruction interceptors are active.
 * Unsupported schemas retain the generator implementation for the whole table.
 */
export function createCompiledTemplates(
  templates: TypeTemplates,
): CompiledTemplates | undefined {
  const compiled = new Map<string, TemplateCodec>();
  const lookup = createTemplateLookup(templates);
  const activeTypes = new Set<TypeInfo>();
  const resolve = (name: string): TemplateCodec => {
    const codec = compiled.get(name);
    if (!codec) throw new Error(`Template "${name}" not found.`);
    return codec;
  };
  for (const [name, template] of lookup) {
    const readers:
      ((reader: DataReader, result: Record<string, unknown>) => void)[] = [];
    const writers:
      ((writer: DataWriter, value: Record<string, unknown>) => void)[] = [];
    for (const members of [template.fields, template.properties]) {
      for (const member of members) {
        const codec = compileType(member.type, resolve, activeTypes);
        if (!codec) return undefined;
        const field = member.name;
        readers.push(
          field === "__proto__"
            ? (reader, result) => {
              Object.defineProperty(result, field, {
                value: codec.read(reader),
                enumerable: true,
                writable: true,
                configurable: true,
              });
            }
            : (reader, result) => {
              result[field] = codec.read(reader);
            },
        );
        writers.push((writer, value) => codec.write(writer, value[field]));
      }
    }
    compiled.set(name, {
      read(reader) {
        const result: Record<string, unknown> = {};
        for (const read of readers) read(reader, result);
        return result;
      },
      write(writer, value) {
        if (typeof value !== "object" || value === null) {
          throw new TypeError(`Template "${name}" requires an object.`);
        }
        const object = value as Record<string, unknown>;
        for (const write of writers) write(writer, object);
      },
    });
  }
  return compiled;
}

type ResolveTemplate = (name: string) => TemplateCodec;

const primitiveCodecs: Partial<Record<Code, TemplateCodec>> = {
  [Code.Boolean]: {
    read: (r) => Boolean(r.readByte()),
    write: (w, v) => w.writeByte(v ? 1 : 0),
  },
  [Code.Byte]: {
    read: (r) => r.readByte(),
    write: (w, v) => w.writeByte(requireNumber(v)),
  },
  [Code.SByte]: {
    read: (r) => r.readSByte(),
    write: (w, v) => w.writeSByte(requireNumber(v)),
  },
  [Code.Int16]: {
    read: (r) => r.readInt16(),
    write: (w, v) => w.writeInt16(requireNumber(v)),
  },
  [Code.UInt16]: {
    read: (r) => r.readUInt16(),
    write: (w, v) => w.writeUInt16(requireNumber(v)),
  },
  [Code.Int32]: {
    read: (r) => r.readInt32(),
    write: (w, v) => w.writeInt32(requireNumber(v)),
  },
  [Code.UInt32]: {
    read: (r) => r.readUInt32(),
    write: (w, v) => w.writeUInt32(requireNumber(v)),
  },
  [Code.Int64]: {
    read: (r) => r.readInt64(),
    write: (w, v) => w.writeInt64(requireLong(v)),
  },
  [Code.UInt64]: {
    read: (r) => r.readUInt64(),
    write: (w, v) => w.writeUInt64(requireLong(v)),
  },
  [Code.Single]: {
    read: (r) => r.readSingle(),
    write: (w, v) => w.writeSingle(requireNumber(v)),
  },
  [Code.Double]: {
    read: (r) => r.readDouble(),
    write: (w, v) => w.writeDouble(requireNumber(v)),
  },
  [Code.String]: {
    read: (r) => r.readKleiString(),
    write: (w, v) => w.writeKleiString(requireString(v)),
  },
  [Code.Enumeration]: {
    read: (r) => r.readInt32(),
    write: (w, v) => w.writeInt32(requireNumber(v)),
  },
  [Code.Colour]: {
    read: (r) => ({
      r: r.readByte() / 255,
      g: r.readByte() / 255,
      b: r.readByte() / 255,
      a: r.readByte() / 255,
    }),
    write(w, v) {
      const color = requireObject(v);
      w.writeByte(fracToByte(requireNumber(color.r)));
      w.writeByte(fracToByte(requireNumber(color.g)));
      w.writeByte(fracToByte(requireNumber(color.b)));
      w.writeByte(fracToByte(requireNumber(color.a)));
    },
  },
  [Code.Vector2I]: {
    read: (r) => ({ x: r.readInt32(), y: r.readInt32() }),
    write(w, v) {
      const o = requireObject(v);
      w.writeInt32(requireNumber(o.x));
      w.writeInt32(requireNumber(o.y));
    },
  },
  [Code.Vector2]: {
    read: (r) => ({ x: r.readSingle(), y: r.readSingle() }),
    write(w, v) {
      const o = requireObject(v);
      w.writeSingle(requireNumber(o.x));
      w.writeSingle(requireNumber(o.y));
    },
  },
  [Code.Vector3]: {
    read: (r) => ({ x: r.readSingle(), y: r.readSingle(), z: r.readSingle() }),
    write(w, v) {
      const o = requireObject(v);
      w.writeSingle(requireNumber(o.x));
      w.writeSingle(requireNumber(o.y));
      w.writeSingle(requireNumber(o.z));
    },
  },
};

function compileType(
  info: TypeInfo,
  resolve: ResolveTemplate,
  activeTypes: Set<TypeInfo>,
): TemplateCodec | undefined {
  // Binary schemas use named template references for recursion. A cyclic
  // in-memory subtype graph cannot be compiled eagerly; retain generators.
  if (activeTypes.has(info)) return undefined;
  activeTypes.add(info);
  try {
    return compileTypeBody(info, resolve, activeTypes);
  } finally {
    activeTypes.delete(info);
  }
}

function compileTypeBody(
  info: TypeInfo,
  resolve: ResolveTemplate,
  activeTypes: Set<TypeInfo>,
): TemplateCodec | undefined {
  const type = getTypeCode(info.info);
  const primitive = primitiveCodecs[type];
  if (primitive) return primitive;
  if (type === Code.UserDefined) {
    const name = info.templateName;
    if (typeof name !== "string") return undefined;
    return {
      read(reader) {
        const length = checkedCount(
          reader.readInt32(),
          "object data length",
          true,
        );
        if (length === -1) return null;
        const start = reader.position;
        const value = resolve(name).read(reader);
        const actual = reader.position - start;
        if (actual !== length) {
          throw new Error(
            `Failed to parse object: Template name "${name}" parsed ${
              Math.abs(actual - length)
            } ${actual > length ? "more" : "less"} than expected.`,
          );
        }
        return value;
      },
      write(writer, value) {
        if (value == null) {
          writer.writeInt32(-1);
          return;
        }
        const start = writer.position;
        writer.writeInt32(0);
        resolve(name).write(writer, value);
        writer.replaceInt32(
          checkedDataLength(writer.position - start - 4),
          start,
        );
      },
    };
  }
  if (
    type === Code.Array || type === Code.List || type === Code.HashSet ||
    type === Code.Queue
  ) {
    const element = info.subTypes?.[0];
    if (!element) return undefined;
    const byteArray = getTypeCode(element.info) === Code.Byte;
    const struct = isValueType(element.info) && !byteArray;
    if (
      struct &&
      (getTypeCode(element.info) !== Code.UserDefined ||
        typeof element.templateName !== "string")
    ) return undefined;
    const codec = compileType(element, resolve, activeTypes);
    if (!codec) return undefined;
    const structName = element.templateName;
    return {
      read(reader) {
        reader.readInt32(); // Advisory length; legacy empty collections store -4.
        const count = checkedCount(
          reader.readInt32(),
          "array element count",
          true,
        );
        if (count === -1) return null;
        if (byteArray) return new Uint8Array(reader.readBytes(count));
        if (count === 0) return [];
        const read = struct ? resolve(structName!).read : codec.read;
        const values: unknown[] = [];
        for (let i = 0; i < count; i++) values.push(read(reader));
        return values;
      },
      write(writer, value) {
        if (value == null) {
          writer.writeInt32(4);
          writer.writeInt32(-1);
          return;
        }
        if (
          byteArray ? !(value instanceof Uint8Array) : !Array.isArray(value)
        ) {
          throw new TypeError(
            byteArray
              ? "Expected byte array value to be Uint8Array."
              : "Expected an array value.",
          );
        }
        const values = value as Uint8Array | unknown[];
        checkedCount(values.length, "array element count");
        const start = writer.position;
        writer.writeInt32(0);
        writer.writeInt32(values.length);
        if (byteArray) writer.writeBytes(values as Uint8Array);
        else if (values.length > 0) {
          const write = struct ? resolve(structName!).write : codec.write;
          for (const item of values) write(writer, item);
        }
        // Preserve the legacy collection bookkeeping, including its extra -4.
        writer.replaceInt32(
          checkedDataLength(writer.position - start - 12),
          start,
        );
      },
    };
  }
  if (type === Code.Dictionary || type === Code.Pair) {
    const keyInfo = info.subTypes?.[0];
    const valueInfo = info.subTypes?.[1];
    if (!keyInfo || !valueInfo) return undefined;
    const keyCodec = compileType(keyInfo, resolve, activeTypes);
    const valueCodec = compileType(valueInfo, resolve, activeTypes);
    if (!keyCodec || !valueCodec) return undefined;
    return type === Code.Pair
      ? {
        read(reader) {
          const length = checkedCount(
            reader.readInt32(),
            "object data length",
            true,
          );
          if (length === -1) return null;
          return { key: keyCodec.read(reader), value: valueCodec.read(reader) };
        },
        write(writer, value) {
          // Match the historical ONI null-pair bug; do not silently repair its wire format.
          if (value == null) {
            writer.writeInt32(4);
            writer.writeInt32(-1);
            return;
          }
          const start = writer.position;
          writer.writeInt32(0);
          const pair = requireObject(value);
          keyCodec.write(writer, pair.key);
          valueCodec.write(writer, pair.value);
          writer.replaceInt32(
            checkedDataLength(writer.position - start - 4),
            start,
          );
        },
      }
      : {
        read(reader) {
          reader.readInt32();
          const count = checkedCount(
            reader.readInt32(),
            "dictionary element count",
            true,
          );
          if (count === -1) return null;
          const pairs: [unknown, unknown][] = [];
          for (let i = 0; i < count; i++) {
            pairs.push([undefined, valueCodec.read(reader)]);
          }
          for (const pair of pairs) pair[0] = keyCodec.read(reader);
          return pairs;
        },
        write(writer, value) {
          if (value == null) {
            writer.writeInt32(4);
            writer.writeInt32(-1);
            return;
          }
          if (
            !Array.isArray(value) ||
            !value.every((pair: unknown) =>
              Array.isArray(pair) && pair.length === 2
            )
          ) {
            throw new TypeError(
              "Expected dictionary entries to be key/value pairs.",
            );
          }
          const pairs = value as [unknown, unknown][];
          checkedCount(pairs.length, "dictionary element count");
          const start = writer.position;
          writer.writeInt32(0);
          writer.writeInt32(pairs.length);
          for (const pair of pairs) valueCodec.write(writer, pair[1]);
          for (const pair of pairs) keyCodec.write(writer, pair[0]);
          writer.replaceInt32(
            checkedDataLength(writer.position - start - 12),
            start,
          );
        },
      };
  }
  return undefined;
}
