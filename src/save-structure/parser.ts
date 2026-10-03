import {
  type ParseIterator,
  readBytes,
  readChars,
  readCompressed,
  readInt32,
  readKleiString,
  type UnparseIterator,
  writeBytes,
  writeChars,
  writeCompressed,
  writeInt32,
  writeKleiString,
} from "../parser/index.ts";

import type { ParseContext, WriteContext } from "./parse-context.ts";

import type { SaveGameHeader } from "./header/index.ts";
import { parseHeader, unparseHeader } from "./header/parser.ts";

import type { TypeTemplates } from "./type-templates/index.ts";
import {
  parseTemplates,
  unparseTemplates,
} from "./type-templates/template-parser.ts";
import {
  parseByTemplate,
  unparseByTemplate,
} from "./type-templates/template-data-parser.ts";

import type { SaveGameWorld } from "./world/index.ts";
import { parseWorld, unparseWorld } from "./world/parser.ts";

import type { SaveGameSettings } from "./settings/index.ts";
import { parseSettings, unparseSettings } from "./settings/parser.ts";

import type { GameObjectGroup } from "./game-objects/index.ts";
import { parseGameObjects, unparseGameObjects } from "./game-objects/parser.ts";

import type { SaveGameData } from "./game-data/index.ts";
import { parseGameData, writeGameData } from "./game-data/parser.ts";
import type { SaveGame } from "./save-game.ts";
import { validateVersion } from "./version-validator.ts";

import { createTemplateLookup } from "./type-templates/template-lookup.ts";
import { createCompiledTemplates } from "./type-templates/compiled-templates.ts";
import { validateCollectionCount } from "./collection-count.ts";

const SAVE_HEADER = "KSAV";

interface SaveGameBody {
  world: SaveGameWorld;
  settings: SaveGameSettings;
  simData: ArrayBuffer;
  version: {
    major: number;
    minor: number;
  };
  gameObjects: GameObjectGroup[];
  gameData: SaveGameData;
}

export interface SaveGameParserOptions {
  /**
   * How strict the parser should be in ensuring the correct save file version is used.
   * - "minor": Require the major and minor version to match.  This is the safest option.
   * - "major": Allow unknown minor versions as long as the major version matches.
   * - "none": Disable version checking.  This can result in corrupt data.
   */
  versionStrictness?: "none" | "major" | "minor";
}

export function* parseSaveGame(
  options: SaveGameParserOptions = {},
  useCompiledTemplates = false,
): ParseIterator<SaveGame> {
  const header: SaveGameHeader = yield* parseHeader();

  const { saveMajorVersion, saveMinorVersion } = header.gameInfo;
  const versionStrictness = options.versionStrictness || "minor";
  if (versionStrictness !== "none") {
    validateVersion(saveMajorVersion, saveMinorVersion, versionStrictness);
  }

  const templates: TypeTemplates = yield* parseTemplates();

  const context = makeSaveParserContext(
    header,
    templates,
    useCompiledTemplates,
  );

  let body: SaveGameBody;

  if (header.isCompressed) {
    body = yield readCompressed(parseSaveBody(context));
  } else {
    body = yield* parseSaveBody(context);
  }

  const saveGame: SaveGame = {
    header,
    templates,
    ...body,
  };
  return saveGame;
}

function* parseSaveBody(context: ParseContext): ParseIterator<SaveGameBody> {
  const worldMarker = yield readKleiString();
  if (worldMarker !== "world") {
    throw new Error(`Expected "world" string.`);
  }

  const world: SaveGameWorld = yield* parseWorld(context);
  const settings: SaveGameSettings = yield* parseSettings(context);

  const simDataLength: number = yield readInt32();
  const simData: ArrayBuffer = yield readBytes(simDataLength);

  const ksav: string = yield readChars(SAVE_HEADER.length);
  if (ksav !== SAVE_HEADER) {
    throw new Error(
      `Failed to parse ksav header: Expected "${SAVE_HEADER}" but got "${ksav}" (${
        Array.from(
          ksav,
        ).map((x) => x.charCodeAt(0))
      })`,
    );
  }
  const versionMajor: number = yield readInt32();
  const versionMinor: number = yield readInt32();

  // The header contains this same data and validates it.
  // validateVersion(versionMajor, versionMinor);

  const gameObjects: GameObjectGroup[] = yield* parseGameObjects(context);

  const gameData: SaveGameData = yield* parseGameData(context);

  const body: SaveGameBody = {
    world,
    settings,
    simData,
    version: {
      major: versionMajor,
      minor: versionMinor,
    },
    gameObjects,
    gameData,
  };
  return body;
}

function makeSaveParserContext(
  header: SaveGameHeader,
  templates: TypeTemplates,
  useCompiledTemplates: boolean,
): ParseContext {
  // Parsed templates are private until this save operation finishes.
  const lookup = createTemplateLookup(templates);
  const compiled = useCompiledTemplates
    ? createCompiledTemplates(templates)
    : undefined;
  return {
    ...header,
    useDirectIO: useCompiledTemplates,
    parseByTemplate: <T>(templateName: string) =>
      parseByTemplate<T>(templates, templateName, lookup, compiled),
  };
}

export function* unparseSaveGame(
  saveGame: SaveGame,
  useTemplateIndex = false,
  useCompiledTemplates = false,
): UnparseIterator {
  yield* unparseHeader(saveGame.header);
  yield* unparseTemplates(saveGame.templates);

  const context = makeSaveWriterContext(
    saveGame.header,
    saveGame.templates,
    useTemplateIndex,
    useCompiledTemplates,
  );

  if (saveGame.header.isCompressed) {
    yield writeCompressed(unparseSaveBody(saveGame, context));
  } else {
    yield* unparseSaveBody(saveGame, context);
  }
}

function* unparseSaveBody(
  saveGame: SaveGame,
  context: WriteContext,
): UnparseIterator {
  yield writeKleiString("world");

  yield* unparseWorld(saveGame.world, context);
  yield* unparseSettings(saveGame.settings, context);

  yield writeInt32(
    validateCollectionCount(
      saveGame.simData.byteLength,
      "Simulation data byte",
    ),
  );
  yield writeBytes(saveGame.simData);

  yield writeChars(SAVE_HEADER);

  yield writeInt32(saveGame.version.major);
  yield writeInt32(saveGame.version.minor);

  yield* unparseGameObjects(saveGame.gameObjects, context);

  yield* writeGameData(saveGame.gameData, context);
}

function makeSaveWriterContext(
  header: SaveGameHeader,
  templates: TypeTemplates,
  useTemplateIndex: boolean,
  useCompiledTemplates: boolean,
): WriteContext {
  // Intercepted writes keep live array lookups because callbacks may mutate it.
  // Otherwise a fresh index per write observes changes made between operations.
  const lookup = useTemplateIndex ? createTemplateLookup(templates) : undefined;
  const compiled = useCompiledTemplates
    ? createCompiledTemplates(templates)
    : undefined;
  return {
    ...header,
    useDirectIO: useCompiledTemplates,
    unparseByTemplate: <T>(templateName: string, value: T) =>
      unparseByTemplate(templates, templateName, value, lookup, compiled),
  };
}
