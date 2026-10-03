import type { LongNum } from "../../binary-serializer/types.ts";
import { getTypeCode, type TypeInfo } from "./type-templates.ts";

export function fracToByte(num: number): number {
  const byte = Math.round(num * 255);
  if (byte < 0) return 0;
  if (byte > 255) return 255;

  return byte;
}

export function checkedCount(
  value: unknown,
  label: string,
  nullable = false,
): number {
  if (
    typeof value !== "number" || !Number.isInteger(value) ||
    value < (nullable ? -1 : 0) || value > 0x7fffffff
  ) {
    throw new RangeError(`Invalid ${label}: ${String(value)}`);
  }
  return value;
}

export function requireSubType(info: TypeInfo, index: number): TypeInfo {
  const subType = info.subTypes?.[index];
  if (!subType) {
    throw new TypeError(
      `Type ${getTypeCode(info.info)} requires subtype ${index + 1}.`,
    );
  }
  return subType;
}

export function requireTemplateName(info: TypeInfo): string {
  if (typeof info.templateName !== "string") {
    throw new TypeError("User-defined type requires a template name.");
  }
  return info.templateName;
}

export function requireNumber(value: unknown): number {
  if (typeof value !== "number") {
    throw new TypeError("Expected a numeric template value.");
  }
  return value;
}

export function requireString(value: unknown): string | null {
  if (value !== null && typeof value !== "string") {
    throw new TypeError("Expected a string or null template value.");
  }
  return value;
}

export function requireObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    throw new TypeError("Expected an object template value.");
  }
  return value as Record<string, unknown>;
}

export function requireLong(value: unknown): LongNum {
  const object = requireObject(value);
  if (
    typeof object.unsigned !== "boolean" || typeof object.lower !== "number" ||
    typeof object.upper !== "number"
  ) {
    throw new TypeError("Expected a 64-bit { unsigned, lower, upper } value.");
  }
  return {
    unsigned: object.unsigned,
    lower: object.lower,
    upper: object.upper,
  };
}
