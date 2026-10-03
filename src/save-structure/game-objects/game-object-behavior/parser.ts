import {
  getReaderPosition,
  type ParseIterator,
  readBytes,
  readInt32,
  readKleiString,
  type UnparseIterator,
  writeBytes,
  writeDataLengthBegin,
  writeDataLengthEnd,
  writeKleiString,
} from "../../../parser/index.ts";

import taggedParser from "../../../tagger/parse-tagger.ts";

import { validateDotNetIdentifierName } from "../../../utils.ts";

import type {
  TemplateParser,
  TemplateUnparser,
} from "../../type-templates/template-data-parser.ts";

import type { GameObjectBehavior } from "./game-object-behavior.ts";

interface ExtraDataParser<T = unknown> {
  parse(templateParser: TemplateParser): ParseIterator<T>;
  unparse(value: T, templateUnparser: TemplateUnparser): UnparseIterator;
}

function registerExtraDataParser<T>(
  parser: ExtraDataParser<T>,
): ExtraDataParser {
  return {
    parse: parser.parse,
    // The behavior name selects the payload schema. Keep this assertion at the
    // registry boundary rather than leaking any into all parsed game objects.
    unparse: (value, templates) => parser.unparse(value as T, templates),
  };
}

import { StorageBehavior } from "./known-behaviors/storage/index.ts";
import {
  parseStorageExtraData,
  unparseStorageExtraData,
} from "./known-behaviors/storage/parser.ts";

import { MinionModifiersBehavior } from "./known-behaviors/minion-modifiers/index.ts";
import {
  parseMinionModifiersExtraData,
  unparseMinionModifiersExtraData,
} from "./known-behaviors/minion-modifiers/parser.ts";

import { ModifiersBehavior } from "./known-behaviors/modifiers/index.ts";
import {
  parseModifiersExtraData,
  unparseModifiersExtraData,
} from "./known-behaviors/modifiers/parser.ts";

const EXTRA_DATA_PARSERS = new Map<string, ExtraDataParser>([
  [
    StorageBehavior,
    registerExtraDataParser({
      parse: parseStorageExtraData,
      unparse: unparseStorageExtraData,
    }),
  ],
  [
    MinionModifiersBehavior,
    registerExtraDataParser({
      parse: parseMinionModifiersExtraData,
      unparse: unparseMinionModifiersExtraData,
    }),
  ],
  [
    ModifiersBehavior,
    registerExtraDataParser({
      parse: parseModifiersExtraData,
      unparse: unparseModifiersExtraData,
    }),
  ],
]);

export function* parseGameObjectBehavior(
  templateParser: TemplateParser,
): ParseIterator<GameObjectBehavior> {
  const name = yield readKleiString();
  validateDotNetIdentifierName(name);

  return yield* parseNamedGameObjectBehavior(name, templateParser);
}

const parseNamedGameObjectBehavior = taggedParser(
  "GameObjectBehavior",
  (name) => name,
  function* (
    name: string,
    templateParser: TemplateParser,
  ): ParseIterator<GameObjectBehavior> {
    let extraData: unknown;
    let extraRaw: ArrayBuffer | undefined;

    const dataLength = yield readInt32();

    const preParsePosition = yield getReaderPosition();
    const templateData = yield* templateParser.parseByTemplate(name);

    const extraDataParser = EXTRA_DATA_PARSERS.get(name);
    if (extraDataParser) {
      extraData = yield* extraDataParser.parse(templateParser);
    }

    const postParsePosition = yield getReaderPosition();

    const dataRemaining = dataLength - (postParsePosition - preParsePosition);
    if (dataRemaining < 0) {
      throw new Error(
        `GameObjectBehavior "${name}" deserialized more type data than expected.`,
      );
    } else if (dataRemaining > 0) {
      if (extraDataParser) {
        // If we had an extraData parser, then it should have parsed the rest of it.
        throw new Error(
          `GameObjectBehavior "${name}" extraData parser did not consume all extra data.`,
        );
      }

      // No extraData parser, so this is probably extraData that we do not know how to handle.
      //  Store it so that it can be saved again.
      extraRaw = yield readBytes(dataRemaining);
    }

    const behavior: GameObjectBehavior = {
      name,
      templateData,
      extraData,
      extraRaw,
    };
    return behavior;
  },
);

export function* unparseGameObjectBehavior(
  behavior: GameObjectBehavior,
  templateUnparser: TemplateUnparser,
): UnparseIterator {
  yield* unparseTaggedGameObjectBehavior(behavior, templateUnparser);
}

const unparseTaggedGameObjectBehavior = taggedParser(
  "GameObjectBehavior",
  (behavior) => behavior.name,
  function* (
    behavior: GameObjectBehavior,
    templateUnparser: TemplateUnparser,
  ): UnparseIterator {
    const { name, templateData, extraData, extraRaw } = behavior;
    const extraDataParser = EXTRA_DATA_PARSERS.get(name);

    yield writeKleiString(name);

    const lengthToken = yield writeDataLengthBegin();

    yield* templateUnparser.unparseByTemplate(name, templateData);

    if (extraData) {
      if (!extraDataParser) {
        throw new Error(
          `GameObjectBehavior "${name}" has extraData set, but no extraData parser exists for this behavior.`,
        );
      }

      yield* extraDataParser.unparse(extraData, templateUnparser);
    }

    if (extraRaw) {
      yield writeBytes(extraRaw);
    }

    yield writeDataLengthEnd(lengthToken);
  },
);
