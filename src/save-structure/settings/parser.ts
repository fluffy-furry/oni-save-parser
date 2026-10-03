import {
  type ParseIterator,
  readKleiString,
  type UnparseIterator,
  writeKleiString,
} from "../../parser/index.ts";

import type {
  TemplateParser,
  TemplateUnparser,
} from "../type-templates/template-data-parser.ts";

import { validateDotNetIdentifierName } from "../../utils.ts";

import type { SaveGameSettings } from "./settings.ts";

const AssemblyTypeName = "Game+Settings";

export function* parseSettings({
  parseByTemplate,
}: TemplateParser): ParseIterator<SaveGameSettings> {
  const typeName = yield readKleiString();
  validateDotNetIdentifierName(typeName);
  if (typeName !== AssemblyTypeName) {
    throw new Error(
      `Expected type name "${AssemblyTypeName}" but got "${typeName}".`,
    );
  }

  return yield* parseByTemplate(AssemblyTypeName);
}

export function* unparseSettings(
  settings: SaveGameSettings,
  { unparseByTemplate }: TemplateUnparser,
): UnparseIterator {
  yield writeKleiString(AssemblyTypeName);
  yield* unparseByTemplate(AssemblyTypeName, settings);
}
