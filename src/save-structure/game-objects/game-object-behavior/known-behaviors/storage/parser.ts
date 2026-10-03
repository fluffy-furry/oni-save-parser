import { validateDotNetIdentifierName } from "../../../../../utils.ts";

import {
  type ParseIterator,
  readInt32,
  readKleiString,
  type UnparseIterator,
  writeInt32,
  writeKleiString,
} from "../../../../../parser/index.ts";

import type {
  TemplateParser,
  TemplateUnparser,
} from "../../../../type-templates/template-data-parser.ts";
import { validateCollectionCount } from "../../../../collection-count.ts";

import {
  parseGameObject,
  unparseGameObject,
} from "../../../game-object/parser.ts";

import type { StoredGameObject } from "./storage.ts";

export function* parseStorageExtraData(
  templateParser: TemplateParser,
): ParseIterator<StoredGameObject[]> {
  const itemCount = validateCollectionCount(
    yield readInt32(),
    "Stored game object",
  );
  const items: StoredGameObject[] = [];
  for (let i = 0; i < itemCount; i++) {
    const name = yield readKleiString();
    validateDotNetIdentifierName(name);
    const gameObject = yield* parseGameObject(templateParser);
    items.push({
      name,
      ...gameObject,
    });
  }
  return items;
}

export function* unparseStorageExtraData(
  extraData: StoredGameObject[],
  templateUnparser: TemplateUnparser,
): UnparseIterator {
  yield writeInt32(extraData.length);
  for (const gameObject of extraData) {
    yield writeKleiString(gameObject.name);
    yield* unparseGameObject(gameObject, templateUnparser);
  }
}
