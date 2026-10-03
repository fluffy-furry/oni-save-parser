import type { MinionSkillGroup } from "../../../const-data/skills/skill-group.ts";

import type { GameObjectBehavior } from "../game-object-behavior.ts";

import type { BehaviorName } from "./types.ts";

export const MinionResumeBehavior: BehaviorName<MinionResumeBehavior> =
  "MinionResume";
export interface MinionResumeBehavior extends GameObjectBehavior {
  name: "MinionResume";
  templateData: {
    MasteryByRoleID: [string, boolean][];
    MasteryBySkillID: [string, boolean][];
    GrantedSkillIDs?: string[];
    AptitudeByRoleGroup?: [MinionSkillGroup, number][];
    AptitudeBySkillGroup: [MinionSkillGroup, number][];

    totalExperienceGained: number;

    currentRole: string;
    targetRole: string;

    currentHat: string | null;
    targetHat: string | null;
  };
}
