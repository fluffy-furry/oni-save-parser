import {
  type ParseIterator,
  readInt32,
  readKleiString,
  type UnparseIterator,
  writeInt32,
  writeKleiString,
} from "../../parser/index.ts";

import type {
  TypeTemplate,
  TypeTemplateMember,
  TypeTemplates,
} from "../../save-structure/type-templates/index.ts";

import { validateDotNetIdentifierName } from "../../utils.ts";

import { parseTypeInfo, unparseTypeInfo } from "./type-info-parser.ts";

export function* parseTemplates(): ParseIterator<TypeTemplates> {
  const templateCount = checkedCount(yield readInt32(), "template count");
  const templates: TypeTemplates = [];
  for (let i = 0; i < templateCount; i++) {
    const template = yield* parseTemplate();
    templates.push(template);
  }
  return templates;
}

export function* unparseTemplates(templates: TypeTemplates): UnparseIterator {
  yield writeInt32(checkedCount(templates.length, "template count"));
  for (const template of templates) {
    yield* unparseTemplate(template);
  }
}

function* parseTemplate(): ParseIterator<TypeTemplate> {
  const name = validateDotNetIdentifierName(yield readKleiString());

  const fieldCount = checkedCount(yield readInt32(), "field count");
  const propCount = checkedCount(yield readInt32(), "property count");

  const fields: TypeTemplateMember[] = [];
  for (let i = 0; i < fieldCount; i++) {
    const name = validateDotNetIdentifierName(yield readKleiString());
    const type = yield* parseTypeInfo();
    fields.push({ name, type });
  }

  const properties: TypeTemplateMember[] = [];
  for (let i = 0; i < propCount; i++) {
    const name = validateDotNetIdentifierName(yield readKleiString());
    const type = yield* parseTypeInfo();
    properties.push({ name, type });
  }

  const template: TypeTemplate = {
    name,
    fields,
    properties,
  };
  return template;
}

function* unparseTemplate(template: TypeTemplate): UnparseIterator {
  yield writeKleiString(template.name);

  yield writeInt32(checkedCount(template.fields.length, "field count"));
  yield writeInt32(checkedCount(template.properties.length, "property count"));

  for (const field of template.fields) {
    const { name, type } = field;
    yield writeKleiString(name);
    yield* unparseTypeInfo(type);
  }

  for (const prop of template.properties) {
    const { name, type } = prop;
    yield writeKleiString(name);
    yield* unparseTypeInfo(type);
  }
}

function checkedCount(value: unknown, label: string): number {
  if (
    typeof value !== "number" || !Number.isInteger(value) || value < 0 ||
    value > 0x7fffffff
  ) {
    throw new RangeError(`Invalid ${label}: ${String(value)}`);
  }
  return value;
}
