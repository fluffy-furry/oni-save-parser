import type { SaveGame } from "../../src/index.ts";
import {
  SerializationTypeInfo as Type,
  type TypeInfo,
  type TypeTemplate,
} from "../../src/save-structure/type-templates/index.ts";

function type(
  info: Type,
  templateName?: string,
  subTypes?: TypeInfo[],
): TypeInfo {
  return { info, templateName, subTypes };
}

function template(
  name: string,
  fields: Record<string, TypeInfo>,
): TypeTemplate {
  return {
    name,
    fields: Object.entries(fields).map(([name, type]) => ({ name, type })),
    properties: [],
  };
}

const int = type(Type.Int32);
const boolean = type(Type.Boolean);
const string = type(Type.String);
const bytes = type(Type.Array, undefined, [type(Type.Byte)]);
const opaque = type(Type.UserDefined, "Fixture.Opaque");

function dictionary(key: TypeInfo, value: TypeInfo): TypeInfo {
  return type(Type.Dictionary | Type.IS_GENERIC_TYPE, undefined, [key, value]);
}

/**
 * A synthetic save exercising the supported 7.31 wire format. This is not a
 * game-generated fixture and does not establish compatibility with newer ONI.
 */
export function createSaveGame(isCompressed = false): SaveGame {
  return {
    header: {
      buildVersion: 1,
      headerVersion: 1,
      isCompressed,
      gameInfo: {
        numberOfCycles: 42,
        numberOfDuplicants: 1,
        baseName: "Test colony 🌍",
        isAutoSave: false,
        originalSaveName: "Fixture",
        saveMajorVersion: 7,
        saveMinorVersion: 31,
        clusterId: "Fixture",
        sandboxEnabled: false,
        colonyGuid: "00000000-0000-0000-0000-000000000000",
        dlcId: "",
      },
    },
    templates: [
      template("Klei.SaveFileRoot", {
        WidthInCells: int,
        HeightInCells: int,
        streamed: dictionary(string, bytes),
      }),
      template("Game+Settings", {
        baseAlreadyCreated: boolean,
        nextUniqueID: int,
        gameID: int,
      }),
      template("Game+GameSaveData", {
        gasConduitFlow: opaque,
        liquidConduitFlow: opaque,
        simActiveRegionMin: type(Type.Vector2I),
        simActiveRegionMax: type(Type.Vector2I),
        fallingWater: opaque,
        unstableGround: opaque,
        worldDetail: opaque,
        customGameSettings: type(Type.UserDefined, "Fixture.CustomSettings"),
        debugWasUsed: boolean,
        autoPrioritizeRoles: boolean,
        advancedPersonalPriorities: boolean,
        savedInfo: type(Type.UserDefined, "Fixture.SavedInfo"),
      }),
      template("Fixture.Opaque", {}),
      template("Fixture.CustomSettings", {
        is_custom_game: boolean,
        customGameMode: type(Type.Byte),
        CurrentQualityLevelsBySetting: dictionary(string, string),
      }),
      template("Fixture.SavedInfo", { discoveredSurface: boolean }),
      {
        ...template("Fixture.Behavior", { id: int }),
        properties: [{ name: "label", type: string }],
      },
    ],
    world: {
      WidthInCells: 4,
      HeightInCells: 3,
      streamed: [
        ["terrain", new Uint8Array([0, 1, 127, 128, 254, 255])],
        ["empty", new Uint8Array()],
      ],
    },
    settings: { baseAlreadyCreated: true, nextUniqueID: 123, gameID: 456 },
    simData: new Uint8Array([0, 0, 255, 42, 11]).buffer,
    version: { major: 7, minor: 31 },
    gameObjects: [{
      name: "FixturePrefab",
      gameObjects: [{
        position: { x: -1.5, y: 2.5, z: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        scale: { x: 1, y: 1, z: 1 },
        folder: 255,
        behaviors: [{
          name: "Fixture.Behavior",
          templateData: { id: 17, label: "Unicode: 酸素 🫧" },
          extraData: undefined,
          extraRaw: new Uint8Array([9, 8, 0, 255]).buffer,
        }],
      }],
    }],
    gameData: {
      gasConduitFlow: null,
      liquidConduitFlow: {},
      simActiveRegionMin: { x: -2, y: -3 },
      simActiveRegionMax: { x: 4, y: 3 },
      fallingWater: null,
      unstableGround: {},
      worldDetail: null,
      customGameSettings: {
        is_custom_game: true,
        customGameMode: 255,
        CurrentQualityLevelsBySetting: [["ImmuneSystem", "Default"], [
          "SandboxMode",
          "Disabled",
        ]],
      },
      debugWasUsed: false,
      autoPrioritizeRoles: true,
      advancedPersonalPriorities: true,
      savedInfo: { discoveredSurface: false },
    },
  };
}
