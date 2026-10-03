import type {
  Quaternion,
  Vector3,
} from "../../../save-structure/data-types/index.ts";

import type { GameObjectBehavior } from "../game-object-behavior/index.ts";

export interface GameObject {
  readonly position: Vector3;
  readonly rotation: Quaternion;
  readonly scale: Vector3;

  /**
   * Number from 0 to 255.
   * This is used to look up the object's unity prefab.
   */
  readonly folder: number;

  /**
   * Behaviors for this game object.
   * The order may matter to ONI; needs more investigation.
   */
  // TODO: Figure out the madness of indexing inside ONI SaveLoadRoot.LoadInternal
  readonly behaviors: GameObjectBehavior[];
}
