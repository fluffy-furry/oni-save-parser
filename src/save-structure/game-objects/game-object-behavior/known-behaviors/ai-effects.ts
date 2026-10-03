import type { GameObjectBehavior } from "../game-object-behavior.ts";
import type { BehaviorName } from "./types.ts";

export const AIEffectsBehavior: BehaviorName<AIEffectsBehavior> =
  "Klei.AI.Effects";
export interface AIEffectsBehavior extends GameObjectBehavior {
  name: "Klei.AI.Effects";
  templateData: {
    saveLoadEffects: EffectInstance[];
  };
}
export interface EffectInstance {
  id: string;
  timeRemaining: number;
}

// TODO: move to oni-save-parser
export const AI_EFFECT_IDS: string[] = [
  "UncomfortableSleep",
  "Sleep",
  "NarcolepticSleep",
  "RestfulSleep",
  "AnewHope",
  "Mourning",
  "DisturbedSleep",
  "NewCrewArrival",
  "UnderWater",
  "FullBladder",
  "StressfulyEmptyingBladder",
  "RedAlert",
  "MentalBreak",
  "CoolingDown",
  "WarmingUp",
  "Darkness",
  "SteppedInContaminatedWater",
  "WellFed",
  "StaleFood",
  "SmelledPutridOdour",
  "Vomiting",
  "DirtyHands",
  "Unclean",
  "LightWounds",
  "ModerateWounds",
  "SevereWounds",
  "WasAttacked",
  "SoreBack",
  "WarmAir",
  "ColdAir",
  "Hypothermia",
  "Hyperthermia",

  // Found in DB.cs
  "CenterOfAttention",
];
