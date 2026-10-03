import type { GameObjectBehavior } from "../game-object-behavior.ts";
import type { BehaviorName } from "./types.ts";

export const MinionAssignablesProxy: BehaviorName<MinionAssignablesProxy> =
  "MinionAssignablesProxy";
export interface MinionAssignablesProxy extends GameObjectBehavior {
  target_instance_id: number;
}
