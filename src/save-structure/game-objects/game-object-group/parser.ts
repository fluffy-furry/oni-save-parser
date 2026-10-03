import { validateDotNetIdentifierName } from "../../../utils.ts";

import {
  getReaderPosition,
  type ParseIterator,
  readInt32,
  readKleiString,
  type UnparseIterator,
  writeDataLengthBegin,
  writeDataLengthEnd,
  writeInt32,
  writeKleiString,
} from "../../../parser/index.ts";

import taggedParser from "../../../tagger/parse-tagger.ts";
import { reportProgress } from "../../../progress/index.ts";

import type {
  TemplateParser,
  TemplateUnparser,
} from "../../type-templates/template-data-parser.ts";
import { validateCollectionCount } from "../../collection-count.ts";

import type { GameObject } from "../game-object/index.ts";
import { parseGameObject, unparseGameObject } from "../game-object/parser.ts";

import type { GameObjectGroup } from "./game-object-group.ts";

export function* parseGameObjectGroup(
  templateParser: TemplateParser,
): ParseIterator<GameObjectGroup> {
  const prefabName = yield readKleiString();
  validateDotNetIdentifierName(prefabName);

  return yield* parseNamedGameObjectGroup(prefabName, templateParser);
}

const parseNamedGameObjectGroup = taggedParser(
  "GameObjectGroup",
  (prefabName) => prefabName,
  function* (
    prefabName: string,
    templateParser: TemplateParser,
  ): ParseIterator<GameObjectGroup> {
    const instanceCount = validateCollectionCount(
      yield readInt32(),
      "Game object instance",
    );
    const dataLength = yield readInt32();
    const preParsePosition = yield getReaderPosition();

    const gameObjects: GameObject[] = [];
    for (let i = 0; i < instanceCount; i++) {
      yield reportProgress(`GameObjectGroup::${prefabName}::${i}`);
      gameObjects.push(yield* parseGameObject(templateParser));
    }

    const postParsePosition = yield getReaderPosition();
    const bytesRemaining = dataLength - (postParsePosition - preParsePosition);
    if (bytesRemaining < 0) {
      throw new Error(
        `GameObject "${prefabName}" parse consumed ${-bytesRemaining} more bytes than its declared length of ${dataLength}.`,
      );
    } else if (bytesRemaining > 0) {
      // We could skip the bytes, but if we want to write data back, we better know what those bytes were.
      //  Each GameObject itself tracks data length, so we should be covered.  Anything that is missing
      //  is a sign of a parse issue.
      throw new Error(
        `GameObject "${prefabName}" parse consumed ${bytesRemaining} less bytes than its declared length of ${dataLength}.`,
      );
    }

    const group: GameObjectGroup = {
      name: prefabName,
      gameObjects,
    };
    return group;
  },
);

export function* unparseGameObjectGroup(
  group: GameObjectGroup,
  templateUnparser: TemplateUnparser,
): UnparseIterator {
  yield* unparseTaggedGameObjectGroup(group, templateUnparser);
}

const unparseTaggedGameObjectGroup = taggedParser(
  "GameObjectGroup",
  (group) => group.name,
  function* (
    group: GameObjectGroup,
    templateUnparser: TemplateUnparser,
  ): UnparseIterator {
    const { name, gameObjects } = group;
    yield writeKleiString(name);
    yield writeInt32(gameObjects.length);

    const lengthToken = yield writeDataLengthBegin();
    for (const [i, gameObject] of gameObjects.entries()) {
      yield reportProgress(`GameObjectGroup::${name}::${i}`);
      yield* unparseGameObject(gameObject, templateUnparser);
    }

    yield writeDataLengthEnd(lengthToken);
  },
);
