import type { SaveGameHeader } from "./header/index.ts";
import type { TypeTemplates } from "./type-templates/index.ts";
import type { SaveGameWorld } from "./world/index.ts";
import type { SaveGameSettings } from "./settings/index.ts";
import type { GameObjectGroups } from "./game-objects/index.ts";
import type { SaveGameData } from "./game-data/index.ts";

export interface SaveGame {
  header: SaveGameHeader;
  templates: TypeTemplates;
  world: SaveGameWorld;
  settings: SaveGameSettings;
  simData: ArrayBuffer;
  version: {
    major: number;
    minor: number;
  };
  gameObjects: GameObjectGroups;
  gameData: SaveGameData;
}
