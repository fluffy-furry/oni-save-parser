import type { GameObjectBehavior } from "../game-object-behavior.ts";
import type { BehaviorName } from "./types.ts";

export const KPrefabIDBehavior: BehaviorName<KPrefabIDBehavior> = "KPrefabID";
export interface KPrefabIDBehavior extends GameObjectBehavior {
  name: "KPrefabID";
  templateData: {
    InstanceID: KPrefabID;
  };
}

export type KPrefabID = number;
