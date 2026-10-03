import type { GameObjectBehavior } from "../../game-object-behavior.ts";

import type { BehaviorName } from "../types.ts";

export const MinionModifiersBehavior: BehaviorName<MinionModifiersBehavior> =
  "MinionModifiers";
export interface MinionModifiersBehavior extends GameObjectBehavior {
  name: "MinionModifiers";
  templateData: Record<string, unknown>;
  extraData: MinionModifiersExtraData;
}

export interface MinionModifiersExtraData {
  amounts: AIAmountInstance[];
  sicknesses: AISicknessInstance[];
}

export interface MinionModificationInstance {
  name: string;
  value: unknown;
}

export interface AIAmountInstance extends MinionModificationInstance {
  value: { value: number };
}

export interface AISicknessInstance extends MinionModificationInstance {
  value: {
    diseaseId?: string;
    exposureInfo: {
      sicknessID: string;
      sourceInfo: string;
    };
  };
}
