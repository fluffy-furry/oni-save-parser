import type { GameObjectBehavior } from "../game-object-behavior.ts";

declare const behaviorType: unique symbol;

export type BehaviorName<T extends GameObjectBehavior> = string & {
  readonly [behaviorType]?: T;
};
