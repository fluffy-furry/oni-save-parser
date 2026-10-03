import {
  type ParseIterator,
  readInt32,
  type UnparseIterator,
  writeInt32,
} from "../../parser/index.ts";

import type {
  TemplateParser,
  TemplateUnparser,
} from "../type-templates/template-data-parser.ts";
import { validateCollectionCount } from "../collection-count.ts";

import type { GameObjectGroup } from "./game-object-group/index.ts";
import {
  parseGameObjectGroup,
  unparseGameObjectGroup,
} from "./game-object-group/parser.ts";

export function* parseGameObjects(
  templateParser: TemplateParser,
): ParseIterator<GameObjectGroup[]> {
  const count = validateCollectionCount(yield readInt32(), "Game object group");
  const groups: GameObjectGroup[] = [];
  for (let i = 0; i < count; i++) {
    groups.push(yield* parseGameObjectGroup(templateParser));
  }
  return groups;
}

export function* unparseGameObjects(
  lists: GameObjectGroup[],
  templateWriter: TemplateUnparser,
): UnparseIterator {
  yield writeInt32(lists.length);
  for (const group of lists) {
    yield* unparseGameObjectGroup(group, templateWriter);
  }
}
