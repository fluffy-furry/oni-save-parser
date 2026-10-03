import {
  GENERIC_TYPES,
  getTypeCode,
  SerializationTypeCode,
  SerializationTypeInfo,
  type TypeInfo,
} from "../../save-structure/type-templates/index.ts";

import {
  type ParseIterator,
  readByte,
  readKleiString,
  type UnparseIterator,
  writeByte,
  writeKleiString,
} from "../../parser/index.ts";

export function* parseTypeInfo(): ParseIterator<TypeInfo> {
  const info: SerializationTypeInfo = yield readByte();
  const type = getTypeCode(info);

  let templateName: string | undefined;
  let subTypes: TypeInfo[] | undefined;

  if (
    type === SerializationTypeCode.UserDefined ||
    type === SerializationTypeCode.Enumeration
  ) {
    const userTypeName = yield readKleiString();
    if (userTypeName == null) {
      throw new Error(
        "Expected non-null type name for user-defined or enumeration type.",
      );
    }
    templateName = userTypeName;
  }

  if (info & SerializationTypeInfo.IS_GENERIC_TYPE) {
    if (!GENERIC_TYPES.includes(type)) {
      throw new Error(
        `Unsupported non-generic type ${type} marked as generic.`,
      );
    }
    const subTypeCount: number = yield readByte();
    subTypes = new Array(subTypeCount);
    for (let i = 0; i < subTypeCount; i++) {
      subTypes[i] = yield* parseTypeInfo();
    }
  } else if (type === SerializationTypeCode.Array) {
    const subType = yield* parseTypeInfo();
    subTypes = [subType];
  }

  const typeInfo: TypeInfo = {
    info,
    templateName,
    subTypes,
  };
  validateTypeInfo(typeInfo);
  return typeInfo;
}

export function* unparseTypeInfo(info: TypeInfo): UnparseIterator {
  validateTypeInfo(info);
  yield writeByte(info.info);
  const type = getTypeCode(info.info);
  if (
    type === SerializationTypeCode.UserDefined ||
    type === SerializationTypeCode.Enumeration
  ) {
    yield writeKleiString(info.templateName!);
  }

  if (info.info & SerializationTypeInfo.IS_GENERIC_TYPE) {
    yield writeByte(info.subTypes!.length);
    for (const subType of info.subTypes!) {
      yield* unparseTypeInfo(subType);
    }
  } else if (type === SerializationTypeCode.Array) {
    const elementType = info.subTypes?.[0];
    if (!elementType) throw new TypeError("Array type requires one subtype.");
    yield* unparseTypeInfo(elementType);
  }
}

function validateTypeInfo(info: TypeInfo): void {
  const type = getTypeCode(info.info);
  if (
    !Number.isInteger(info.info) || info.info < 0 || info.info > 255 ||
    type > SerializationTypeCode.Colour
  ) {
    throw new TypeError(`Unsupported type information: ${info.info}`);
  }
  if (
    (type === SerializationTypeCode.UserDefined ||
      type === SerializationTypeCode.Enumeration) &&
    typeof info.templateName !== "string"
  ) {
    throw new TypeError(
      "Expected a type name for user-defined or enumeration type.",
    );
  }
  const generic = Boolean(info.info & SerializationTypeInfo.IS_GENERIC_TYPE);
  if (generic && !GENERIC_TYPES.includes(type)) {
    throw new TypeError(
      `Unsupported non-generic type ${type} marked as generic.`,
    );
  }
  if (generic && (!info.subTypes || info.subTypes.length > 255)) {
    throw new TypeError("Generic type requires at most 255 subtypes.");
  }
  const arity = type === SerializationTypeCode.Pair ||
      type === SerializationTypeCode.Dictionary
    ? 2
    : type === SerializationTypeCode.Array ||
        type === SerializationTypeCode.List ||
        type === SerializationTypeCode.HashSet ||
        type === SerializationTypeCode.Queue
    ? 1
    : undefined;
  if (
    arity !== undefined &&
    (info.subTypes?.length !== arity ||
      (type !== SerializationTypeCode.Array && !generic))
  ) {
    throw new TypeError(
      `Type ${type} requires ${arity} subtype${arity === 1 ? "" : "s"}.`,
    );
  }
}
