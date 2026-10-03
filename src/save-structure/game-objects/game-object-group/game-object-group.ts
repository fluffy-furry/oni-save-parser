import type { GameObject } from "../game-object/index.ts";

export type GameObjectGroups = GameObjectGroup[];

export interface GameObjectGroup {
  name: string;
  gameObjects: GameObject[];
}
