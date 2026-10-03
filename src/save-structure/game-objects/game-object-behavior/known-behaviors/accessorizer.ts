import { Accessory } from "../../../const-data/accessories.ts";

import type { GameObjectBehavior } from "../game-object-behavior.ts";

import type { BehaviorName } from "./types.ts";

export const AccessorizerBehavior: BehaviorName<AccessorizerBehavior> =
  "Accessorizer";
export interface AccessorizerBehavior extends GameObjectBehavior {
  name: "Accessorizer";
  templateData: {
    accessories: Accessory[];
  };
}
