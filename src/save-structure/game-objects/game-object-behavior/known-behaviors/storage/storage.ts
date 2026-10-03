import type { GameObject } from "../../../game-object/index.ts";

import type { GameObjectBehavior } from "../../game-object-behavior.ts";

import type { BehaviorName } from "../types.ts";

export const StorageBehavior: BehaviorName<StorageBehavior> = "Storage";
export interface StorageBehavior extends GameObjectBehavior {
  name: "Storage";
  templateData: {
    onlyFetchMarkedItems: boolean;
    shouldSaveItems?: boolean;
    workTimeRemaining: number;
    numberOfUses: number;
  };
  extraData: StoredGameObject[];
}

export interface StoredGameObject extends GameObject {
  name: string;
}
