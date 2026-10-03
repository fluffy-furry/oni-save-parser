import type { GameObject } from "../game-object/index.ts";

import type { GameObjectBehavior } from "../game-object-behavior/index.ts";

import type { BehaviorName } from "./known-behaviors/index.ts";

export function getBehavior<T extends GameObjectBehavior>(
  gameObject: GameObject,
  name: BehaviorName<T>,
): T | undefined {
  return gameObject.behaviors.find((x) => x.name === name) as T | undefined;
}
