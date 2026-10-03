import type { BehaviorName } from "./types.ts";
import type { GameObjectBehavior } from "../game-object-behavior.ts";

export const UncoverableBehavior: BehaviorName<UncoverableBehavior> =
  "Uncoverable";
export interface UncoverableBehavior extends GameObjectBehavior {
  name: "Uncoverable";
  templateData: {
    hasBeenUncovered: boolean;
  };
}
