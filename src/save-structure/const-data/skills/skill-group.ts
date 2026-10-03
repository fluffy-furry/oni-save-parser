import {
  createHashedStringEnum,
  type HashedString,
} from "../../data-types/index.ts";

export const MinionSkillGroupNames = [
  "Farming",
  "Ranching",
  "Mining",
  "Cooking",
  "Art",
  "Building",
  "Management",
  "Research",
  "Suits",
  "Hauling",
  "Technicals",
  "MedicalAid",
  "Basekeeping",
  "Rocketry",
  "SwimmingSkills",
  "BionicSkills",
] as const;
export type MinionSkillGroup = HashedString;

export const MinionSkillGroup = createHashedStringEnum(MinionSkillGroupNames);
