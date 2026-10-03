import { HashedString } from "../../../../save-structure/data-types/index.ts";

import { SimHashes } from "../../../const-data/index.ts";

import type { GameObjectBehavior } from "../game-object-behavior.ts";

import type { BehaviorName } from "./types.ts";

export const PrimaryElementBehavior: BehaviorName<PrimaryElementBehavior> =
  "PrimaryElement";
export interface PrimaryElementBehavior extends GameObjectBehavior {
  name: "PrimaryElement";
  templateData: {
    ElementID: SimHashes;
    Units: number;
    _Temperature: number;

    diseaseID: HashedString;
    diseaseCount: number;
  };
}
