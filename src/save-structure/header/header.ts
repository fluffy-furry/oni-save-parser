export interface SaveGameHeader {
  buildVersion: number;
  headerVersion: number;
  isCompressed: boolean;
  gameInfo: SaveGameInfo;
}

/**
 * Class: "SaveGame+GameInfo"
 * Parser: "SaveGame.GetGameInfo(byte[] bytes)"
 */
export interface SaveGameInfo {
  numberOfCycles: number;
  numberOfDuplicants: number;
  baseName: string;
  isAutoSave: boolean;
  originalSaveName: string;
  saveMajorVersion: number;
  saveMinorVersion: number;
  clusterId: string;
  worldTraits?: unknown;
  sandboxEnabled: boolean;
  colonyGuid: string;
  dlcId: string | null;
  dlcIds?: string[];
}

/**
 * Header shape metadata, retained for consumers using JSON Schema validators.
 * Game info fields vary between game versions and deliberately remain open.
 */
export const headerSchema = {
  type: "object",
  properties: {
    buildVersion: {
      type: "number",
    },
    headerVersion: {
      type: "number",
    },
    isCompressed: {
      type: "boolean",
    },
    gameInfo: {
      type: "object",
    },
  },
  additionalProperties: false,
} as const;
