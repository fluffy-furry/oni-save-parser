import {
  type ParseIterator,
  readWith,
  type UnparseIterator,
  writeWith,
} from "../../parser/index.ts";
import type { CompiledTemplates } from "./compiled-templates.ts";
import type { TypeTemplates } from "./type-templates.ts";
import type { TemplateLookup } from "./template-lookup.ts";
import { parseByType, unparseByType } from "./type-data-parser.ts";

export interface TemplateParser {
  /** Internal fast path for operations without instruction interceptors. */
  readonly useDirectIO?: boolean;
  parseByTemplate<T>(templateName: string): ParseIterator<T>;
}
export interface TemplateUnparser {
  /** Internal fast path for operations without instruction interceptors. */
  readonly useDirectIO?: boolean;
  unparseByTemplate<T>(templateName: string, value: T): UnparseIterator;
}

export function* parseByTemplate<T>(
  templates: TypeTemplates,
  templateName: string,
  lookup?: TemplateLookup,
  compiled?: CompiledTemplates,
): ParseIterator<T> {
  const codec = compiled?.get(templateName);
  if (codec) return (yield readWith(codec.read)) as T;
  const template = lookup
    ? lookup.get(templateName)
    : templates.find((item) => item.name === templateName);
  if (!template) {
    throw new Error(`Template "${templateName}" not found.`);
  }

  const result: Record<string, unknown> = {};
  for (const members of [template.fields, template.properties]) {
    for (const { name, type } of members) {
      const value = yield* parseByType(type, templates, lookup);
      if (name === "__proto__") {
        // Save field names are data. Preserve this own field without invoking
        // Object.prototype.__proto__ or changing the decoded object's prototype.
        Object.defineProperty(result, name, {
          value,
          writable: true,
          enumerable: true,
          configurable: true,
        });
      } else {
        result[name] = value;
      }
    }
  }

  // Runtime templates define their shape; callers supply the corresponding model.
  return result as T;
}

export function* unparseByTemplate<T>(
  templates: TypeTemplates,
  templateName: string,
  obj: T,
  lookup?: TemplateLookup,
  compiled?: CompiledTemplates,
): UnparseIterator {
  const codec = compiled?.get(templateName);
  if (codec) {
    yield writeWith((writer) => codec.write(writer, obj));
    return;
  }
  const template = lookup
    ? lookup.get(templateName)
    : templates.find((item) => item.name === templateName);
  if (!template) {
    throw new Error(`Template "${templateName}" not found.`);
  }
  if (typeof obj !== "object" || obj === null) {
    throw new TypeError(`Template "${templateName}" requires an object.`);
  }
  const values = obj as Record<string, unknown>;
  for (const members of [template.fields, template.properties]) {
    for (const { name, type } of members) {
      yield* unparseByType(values[name], type, templates, lookup);
    }
  }
}
