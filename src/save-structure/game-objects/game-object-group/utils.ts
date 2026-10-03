import type { GameObjectGroup, GameObjectGroups } from "./game-object-group.ts";

export function getGameObjectGroup(
  groups: GameObjectGroups,
  name: string,
): GameObjectGroup | undefined {
  return groups.find((x) => x.name === name);
}
