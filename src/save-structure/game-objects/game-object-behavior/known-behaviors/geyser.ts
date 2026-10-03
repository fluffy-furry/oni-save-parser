import { GeyserType } from "../../../const-data/geysers/geyser-type.ts";

import type { GameObjectBehavior } from "../game-object-behavior.ts";

import type { BehaviorName } from "./types.ts";

export const GeyserBehavior: BehaviorName<GeyserBehavior> = "Geyser";
export interface GeyserBehavior extends GameObjectBehavior {
  name: "Geyser";
  templateData: {
    configuration?: {
      typeId: GeyserType;
      rateRoll: number;
      iterationLengthRoll: number;
      iterationPercentRoll: number;
      yearLengthRoll: number;
      yearPercentRoll: number;
    };
  };
}
