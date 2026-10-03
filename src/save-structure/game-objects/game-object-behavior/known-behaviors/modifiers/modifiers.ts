import type { GameObjectBehavior } from "../../game-object-behavior.ts";

import type { BehaviorName } from "../types.ts";

export const ModifiersBehavior: BehaviorName<ModifiersBehavior> =
  "Klei.AI.Modifiers";
export interface ModifiersBehavior extends GameObjectBehavior {
  name: "Klei.AI.Modifiers";
  templateData: Record<string, unknown>;
  extraData: ModifiersExtraData;
}

export interface ModifiersExtraData {
  amounts: AmountInstance[];
  diseases: DiseaseInstance[];
}

export interface ModificationInstance {
  name: string;
  value: unknown;
}

export interface AmountInstance extends ModificationInstance {
  value: { value: number };
}

export interface DiseaseInstance extends ModificationInstance {
  value: {
    diseaseId: string;
    infectionSourceInfo: string;
  };
}
