import { HealthState } from "../../../const-data/index.ts";
import type { Tag } from "../../../data-types/index.ts";

import type { GameObjectBehavior } from "../game-object-behavior.ts";
import type { BehaviorName } from "./types.ts";

export const HealthBehavior: BehaviorName<HealthBehavior> = "Health";
export interface HealthBehavior extends GameObjectBehavior {
  name: "Health";
  templateData: {
    CanBeIncapacitated?: boolean;
    canBeIncapacitated?: boolean;
    State?: HealthState;
    CauseOfIncapacitation?: Tag;
  };
}
