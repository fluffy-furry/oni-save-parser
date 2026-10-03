import {
  type ParseIterator,
  readBytes,
  readUInt32,
  type UnparseIterator,
  writeBytes,
  writeUInt32,
} from "../../parser/index.ts";

import { headerSchema, type SaveGameHeader } from "./header.ts";

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

export function* parseHeader(): ParseIterator<SaveGameHeader> {
  const buildVersion = yield readUInt32();
  const headerSize = yield readUInt32();
  const headerVersion = yield readUInt32();
  const isCompressed = headerVersion >= 1 ? Boolean(yield readUInt32()) : false;

  const infoBytes = yield readBytes(headerSize);
  const infoStr = textDecoder.decode(infoBytes);
  const gameInfo = JSON.parse(infoStr);

  return {
    buildVersion,
    headerVersion,
    isCompressed,
    gameInfo,
  };
}

export function* unparseHeader(header: SaveGameHeader): UnparseIterator {
  validateHeader(header);

  const { buildVersion, headerVersion, isCompressed, gameInfo } = header;

  const infoStr = JSON.stringify(gameInfo);
  const headerBytes = textEncoder.encode(infoStr);

  yield writeUInt32(buildVersion);
  yield writeUInt32(headerBytes.byteLength);
  yield writeUInt32(headerVersion);
  if (headerVersion >= 1) {
    yield writeUInt32(isCompressed ? 1 : 0);
  }

  yield writeBytes(headerBytes);
}

/** Preserve the original, intentionally shallow header schema validation. */
function validateHeader(value: unknown): void {
  // The original schema has no required fields, including at the root.
  if (value === undefined) return;
  if (!isSchemaObject(value)) {
    throw new TypeError("header must be an object");
  }

  for (const [property, schema] of Object.entries(headerSchema.properties)) {
    if (!Object.hasOwn(value, property)) continue;
    const field = value[property];
    if (field === undefined) continue;
    const valid = schema.type === "object"
      ? isSchemaObject(field)
      : schema.type === "number"
      ? typeof field === "number" && Number.isFinite(field)
      : typeof field === "boolean";
    if (!valid) {
      throw new TypeError(`header.${property} must be a ${schema.type}`);
    }
  }

  for (const property in value) {
    if (!Object.hasOwn(headerSchema.properties, property)) {
      throw new TypeError(`Unexpected header property: ${property}`);
    }
  }
}

function isSchemaObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null &&
    !Array.isArray(value) && !(value instanceof Date);
}
