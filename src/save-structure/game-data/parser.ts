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

import type { SaveGameData } from "./game-data.ts";

const AssemblyTypeName = "Game+GameSaveData";

export function* parseGameData({
  parseByTemplate,
}: TemplateParser): ParseIterator<SaveGameData> {
  const typeName = yield readKleiString();
  validateDotNetIdentifierName(typeName);
  if (typeName !== AssemblyTypeName) {
    throw new Error(
      `Expected type name "${AssemblyTypeName}" but got "${typeName}".`,
    );
  }

  const gameData = yield* parseByTemplate<SaveGameData>(AssemblyTypeName);
  return gameData;
}

export function* writeGameData(
  gameData: SaveGameData,
  { unparseByTemplate }: TemplateUnparser,
): UnparseIterator {
  yield writeKleiString(AssemblyTypeName);
  yield* unparseByTemplate(AssemblyTypeName, gameData);
}
