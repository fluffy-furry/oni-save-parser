import {
  type DataLengthToken,
  getReaderPosition,
  getWriterPosition,
  type ParseIterator,
  readByte,
  readBytes,
  readDouble,
  readInt16,
  readInt32,
  readInt64,
  readKleiString,
  readSByte,
  readSingle,
  readUInt16,
  readUInt32,
  readUInt64,
  type UnparseIterator,
  writeByte,
  writeBytes,
  writeDataLengthBegin,
  writeDataLengthEnd,
  writeDouble,
  writeInt16,
  writeInt32,
  writeInt64,
  writeKleiString,
  writeSByte,
  writeSingle,
  writeUInt16,
  writeUInt32,
  writeUInt64,
} from "../../parser/index.ts";
import {
  getTypeCode,
  isValueType,
  SerializationTypeCode,
  type TypeInfo,
  type TypeTemplates,
} from "../../save-structure/type-templates/index.ts";
import { parseByTemplate, unparseByTemplate } from "./template-data-parser.ts";
import type { TemplateLookup } from "./template-lookup.ts";
import {
  checkedCount,
  fracToByte,
  requireLong,
  requireNumber,
  requireObject,
  requireString,
  requireSubType,
  requireTemplateName,
} from "./value-validation.ts";

interface TypeParser {
  parse(
    info: TypeInfo,
    templates: TypeTemplates,
    lookup?: TemplateLookup,
  ): ParseIterator<unknown>;
  unparse(
    value: unknown,
    info: TypeInfo,
    templates: TypeTemplates,
    lookup?: TemplateLookup,
  ): UnparseIterator;
}

function* parseArrayLike(
  info: TypeInfo,
  templates: TypeTemplates,
  lookup?: TemplateLookup,
): ParseIterator<unknown[] | Uint8Array | null> {
  const elementType = requireSubType(info, 0);
  // Legacy writers can store -4 for an empty collection. ONI ignores this word.
  yield readInt32();
  const length = checkedCount(yield readInt32(), "array element count", true);
  if (length === -1) return null;
  const typeCode = getTypeCode(elementType.info);
  if (typeCode === SerializationTypeCode.Byte) {
    const data: ArrayBuffer = yield readBytes(length);
    return new Uint8Array(data);
  }
  if (
    isValueType(elementType.info) &&
    typeCode !== SerializationTypeCode.UserDefined
  ) {
    throw new Error(`Type ${typeCode} cannot be parsed as a value-type.`);
  }

  // Do not allocate from an untrusted element count before consuming its data.
  const elements: unknown[] = [];
  for (let i = 0; i < length; i++) {
    elements.push(
      isValueType(elementType.info)
        ? yield* parseByTemplate(
          templates,
          requireTemplateName(elementType),
          lookup,
        )
        : yield* parseByType(elementType, templates, lookup),
    );
  }
  return elements;
}

function* unparseArrayLike(
  values: unknown,
  info: TypeInfo,
  templates: TypeTemplates,
  lookup?: TemplateLookup,
): UnparseIterator {
  const elementType = requireSubType(info, 0);
  if (values == null) {
    yield writeInt32(0);
    yield writeInt32(-1);
    return;
  }
  const byteArray =
    getTypeCode(elementType.info) === SerializationTypeCode.Byte;
  if (byteArray ? !(values instanceof Uint8Array) : !Array.isArray(values)) {
    throw new TypeError(
      byteArray
        ? "Expected byte array value to be Uint8Array."
        : "Expected an array value.",
    );
  }
  const elements = values as unknown[] | Uint8Array;
  checkedCount(elements.length, "array element count");
  const lengthToken: DataLengthToken = yield writeDataLengthBegin();
  yield writeInt32(elements.length);
  // The element count is written after the length but not included in it.
  lengthToken.startPosition = (yield getWriterPosition()) - 4;
  if (byteArray) {
    yield writeBytes(elements as Uint8Array);
  } else if (isValueType(elementType.info)) {
    if (getTypeCode(elementType.info) !== SerializationTypeCode.UserDefined) {
      throw new Error(
        `Type ${
          getTypeCode(elementType.info)
        } cannot be written as a value-type.`,
      );
    }
    // Value types omit the per-object length/null word inside collections.
    const templateName = requireTemplateName(elementType);
    for (const element of elements) {
      yield* unparseByTemplate(templates, templateName, element, lookup);
    }
  } else {
    for (const element of elements) {
      yield* unparseByType(element, elementType, templates, lookup);
    }
  }
  yield writeDataLengthEnd(lengthToken);
}

const typeParsers: Record<SerializationTypeCode, TypeParser> = {
  [SerializationTypeCode.Array]: {
    parse: parseArrayLike,
    unparse: unparseArrayLike,
  },
  [SerializationTypeCode.Boolean]: {
    parse: function* () {
      const b = yield readByte();
      return Boolean(b);
    },
    unparse: function* (value) {
      yield writeByte(value ? 1 : 0);
    },
  },
  [SerializationTypeCode.Byte]: {
    parse: function* () {
      return yield readByte();
    },
    unparse: function* (value) {
      yield writeByte(requireNumber(value));
    },
  },
  [SerializationTypeCode.Colour]: {
    parse: function* () {
      const rb = yield readByte();
      const gb = yield readByte();
      const bb = yield readByte();
      const ab = yield readByte();
      return {
        r: rb / 255,
        g: gb / 255,
        b: bb / 255,
        a: ab / 255,
      };
    },
    unparse: function* (value) {
      const color = requireObject(value);
      yield writeByte(fracToByte(requireNumber(color.r)));
      yield writeByte(fracToByte(requireNumber(color.g)));
      yield writeByte(fracToByte(requireNumber(color.b)));
      yield writeByte(fracToByte(requireNumber(color.a)));
    },
  },
  [SerializationTypeCode.Dictionary]: {
    parse: function* (info, templates, lookup) {
      const keyType = requireSubType(info, 0);
      const valueType = requireSubType(info, 1);
      // Preserve ONI/legacy behavior: the advisory byte length can be negative.
      yield readInt32();
      const count = checkedCount(
        yield readInt32(),
        "dictionary element count",
        true,
      );
      if (count === -1) return null;
      const pairs: [unknown, unknown][] = [];
      // Values precede keys in the wire format.
      for (let i = 0; i < count; i++) {
        pairs.push([
          undefined,
          yield* parseByType(valueType, templates, lookup),
        ]);
      }
      for (const pair of pairs) {
        pair[0] = yield* parseByType(keyType, templates, lookup);
      }
      return pairs;
    },
    unparse: function* (value, info, templates, lookup) {
      if (value == null) {
        yield writeInt32(0);
        yield writeInt32(-1);
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
      const keyType = requireSubType(info, 0);
      const valueType = requireSubType(info, 1);
      checkedCount(pairs.length, "dictionary element count");
      const lengthToken: DataLengthToken = yield writeDataLengthBegin();
      yield writeInt32(pairs.length);
      lengthToken.startPosition = (yield getWriterPosition()) - 4;
      for (const pair of pairs) {
        yield* unparseByType(pair[1], valueType, templates, lookup);
      }
      for (const pair of pairs) {
        yield* unparseByType(pair[0], keyType, templates, lookup);
      }
      yield writeDataLengthEnd(lengthToken);
    },
  },
  [SerializationTypeCode.Double]: {
    parse: function* () {
      return yield readDouble();
    },
    unparse: function* (value) {
      yield writeDouble(requireNumber(value));
    },
  },
  [SerializationTypeCode.Enumeration]: {
    parse: function* () {
      return yield readInt32();
    },
    unparse: function* (value) {
      yield writeInt32(requireNumber(value));
    },
  },
  [SerializationTypeCode.HashSet]: {
    parse: parseArrayLike,
    unparse: unparseArrayLike,
  },
  [SerializationTypeCode.Int16]: {
    parse: function* () {
      return yield readInt16();
    },
    unparse: function* (value) {
      yield writeInt16(requireNumber(value));
    },
  },
  [SerializationTypeCode.Int32]: {
    parse: function* () {
      return yield readInt32();
    },
    unparse: function* (value) {
      yield writeInt32(requireNumber(value));
    },
  },
  [SerializationTypeCode.Int64]: {
    parse: function* () {
      return yield readInt64();
    },
    unparse: function* (value) {
      yield writeInt64(requireLong(value));
    },
  },
  [SerializationTypeCode.List]: {
    parse: parseArrayLike,
    unparse: unparseArrayLike,
  },
  [SerializationTypeCode.Pair]: {
    // ONI BUG:
    //  On null pair, ONI writes out [4, -1], as if it was
    //  writing out null to a variable-length collection.
    // However, it checks for a first value >= 0 to indicate not-null,
    //  meaning it will parse a null as not-null and get the parser
    //  into an incorrect state.
    // We reproduce the faulty behavior here to remain accurate to ONI.
    parse: function* (info, templates, lookup) {
      // Writer mirrors ONI code and writes unparsable data.  See ONI bug description above.
      const dataLength = checkedCount(
        yield readInt32(),
        "object data length",
        true,
      );
      if (dataLength >= 0) {
        // Trying to parse a data length of 0 makes no sense,
        //  but we are following ONI code.  Do not change this logic.
        const keyType = requireSubType(info, 0);
        const valueType = requireSubType(info, 1);
        const key = yield* parseByType(keyType, templates, lookup);
        const value = yield* parseByType(valueType, templates, lookup);
        return {
          key,
          value,
        };
      } else {
        return null;
      }
    },
    unparse: function* (value, info, templates, lookup) {
      // Writer mirrors ONI code and writes unparsable data.  See ONI bug description above.
      if (value == null) {
        yield writeInt32(4);
        yield writeInt32(-1);
      } else {
        const keyType = requireSubType(info, 0);
        const valueType = requireSubType(info, 1);

        // Despite ONI not making use of the data length, we still calculate it
        //  and store it against the day that it might be used.

        const lengthToken = yield writeDataLengthBegin();

        const pair = requireObject(value);
        yield* unparseByType(pair.key, keyType, templates, lookup);
        yield* unparseByType(pair.value, valueType, templates, lookup);

        yield writeDataLengthEnd(lengthToken);
      }
    },
  },
  [SerializationTypeCode.Queue]: {
    parse: parseArrayLike,
    unparse: unparseArrayLike,
  },
  [SerializationTypeCode.SByte]: {
    parse: function* () {
      return yield readSByte();
    },
    unparse: function* (value) {
      yield writeSByte(requireNumber(value));
    },
  },
  [SerializationTypeCode.Single]: {
    parse: function* () {
      return yield readSingle();
    },
    unparse: function* (value) {
      yield writeSingle(requireNumber(value));
    },
  },
  [SerializationTypeCode.String]: {
    parse: function* () {
      return yield readKleiString();
    },
    unparse: function* (value) {
      yield writeKleiString(requireString(value));
    },
  },
  [SerializationTypeCode.UInt16]: {
    parse: function* () {
      return yield readUInt16();
    },
    unparse: function* (value) {
      yield writeUInt16(requireNumber(value));
    },
  },
  [SerializationTypeCode.UInt32]: {
    parse: function* () {
      return yield readUInt32();
    },
    unparse: function* (value) {
      yield writeUInt32(requireNumber(value));
    },
  },
  [SerializationTypeCode.UInt64]: {
    parse: function* () {
      return yield readUInt64();
    },
    unparse: function* (value) {
      yield writeUInt64(requireLong(value));
    },
  },
  [SerializationTypeCode.UserDefined]: {
    parse: function* (info, templates, lookup) {
      const templateName = requireTemplateName(info);

      const dataLength = checkedCount(
        yield readInt32(),
        "object data length",
        true,
      );
      if (dataLength < 0) {
        return null;
      }

      const parseStart = yield getReaderPosition();
      const obj = yield* parseByTemplate(templates, templateName, lookup);
      const parseEnd = yield getReaderPosition();

      const parseLength = parseEnd - parseStart;
      if (parseLength !== dataLength) {
        throw new Error(
          `Failed to parse object: Template name "${templateName}" parsed ${
            Math.abs(
              parseLength - dataLength,
            )
          } ${parseLength > dataLength ? "more" : "less"} than expected.`,
        );
      }

      return obj;
    },
    unparse: function* (value, info, templates, lookup) {
      const templateName = requireTemplateName(info);
      if (value == null) {
        yield writeInt32(-1);
      } else {
        const lengthToken = yield writeDataLengthBegin();
        yield* unparseByTemplate(templates, templateName, value, lookup);
        yield writeDataLengthEnd(lengthToken);
      }
    },
  },
  [SerializationTypeCode.Vector2]: {
    parse: function* () {
      const x = yield readSingle();
      const y = yield readSingle();
      return {
        x,
        y,
      };
    },
    unparse: function* (value) {
      const vector = requireObject(value);
      yield writeSingle(requireNumber(vector.x));
      yield writeSingle(requireNumber(vector.y));
    },
  },
  [SerializationTypeCode.Vector2I]: {
    parse: function* () {
      const x = yield readInt32();
      const y = yield readInt32();
      return {
        x,
        y,
      };
    },
    unparse: function* (value) {
      const vector = requireObject(value);
      yield writeInt32(requireNumber(vector.x));
      yield writeInt32(requireNumber(vector.y));
    },
  },
  [SerializationTypeCode.Vector3]: {
    parse: function* () {
      const x = yield readSingle();
      const y = yield readSingle();
      const z = yield readSingle();
      return {
        x,
        y,
        z,
      };
    },
    unparse: function* (value) {
      const vector = requireObject(value);
      yield writeSingle(requireNumber(vector.x));
      yield writeSingle(requireNumber(vector.y));
      yield writeSingle(requireNumber(vector.z));
    },
  },
};

export function* parseByType(
  info: TypeInfo,
  templates: TypeTemplates,
  lookup?: TemplateLookup,
): ParseIterator<unknown> {
  const type = getTypeCode(info.info);
  const parser = typeParsers[type];
  if (!parser) {
    throw new Error(`Unknown type code "${type}" (typeinfo: "${info.info}").`);
  }
  return yield* parser.parse(info, templates, lookup);
}

export function* unparseByType(
  value: unknown,
  info: TypeInfo,
  templates: TypeTemplates,
  lookup?: TemplateLookup,
): UnparseIterator {
  const type = getTypeCode(info.info);
  const parser = typeParsers[type];
  if (!parser) {
    throw new Error(`Unknown type code "${type}" (typeinfo: "${info.info}").`);
  }
  return yield* parser.unparse(value, info, templates, lookup);
}
