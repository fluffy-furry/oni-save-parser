import type { Tag, Vector2I } from "../../save-structure/data-types/index.ts";

export interface SaveGameData {
  // TODO: Several type-template types in here.  Type them.

  gasConduitFlow: unknown;
  liquidConduitFlow: unknown;
  simActiveRegionMin?: Vector2I;
  simActiveRegionMax?: Vector2I;
  fallingWater: unknown;
  bubbleManager?: unknown;
  unstableGround: unknown;
  worldDetail: unknown;
  customGameSettings: CustomGameSettings;
  storySetings?: unknown;
  spaceScannerNetworkManager?: unknown;
  debugWasUsed: boolean;
  autoPrioritizeRoles: boolean;
  advancedPersonalPriorities: boolean;
  savedInfo: {
    discoveredSurface: boolean;
    discoveredOilField?: boolean;
    curedDisease?: boolean;
    blockedCometWithBunkerDoor?: boolean;
    creaturePoopAmount?: [Tag, number][];
    powerCreatedbyGeneratorType?: [Tag, number][];
  };
  dateGenerated?: string | null;
  changelistsPlayedOn?: number[];
}

export interface CustomGameSettings {
  is_custom_game: boolean;
  customGameMode: number; // 0 normal, 1 easy, 255 custom
  CurrentQualityLevelsBySetting: [string, string][];
  CurrentMixingLevelsBySetting?: [string, string][];
}

export type QualityLevelSetting<TKey, TValues extends readonly string[]> = [
  TKey,
  TValues[number],
];
export type QualityLevelSettings =
  | QualityLevelSetting<"ImmuneSystem", typeof ImmuneSystemSettings>
  | QualityLevelSetting<"Stress", typeof StressSettings>
  | QualityLevelSetting<"Morale", typeof MoraleSettings>
  | QualityLevelSetting<"CalorieBurn", typeof CalorieBurnSettings>
  | QualityLevelSetting<"StressBreaks", typeof StressBreaksSettings>
  | QualityLevelSetting<"SandboxMode", typeof SandboxModeSettings>;

export const ImmuneSystemSettings = [
  "Compromised",
  "Weak",
  "Default",
  "Strong",
  "Invincible",
] as const;
export const StressSettings = [
  "Doomed",
  "Pessimistic",
  "Default",
  "Optimistic",
  "Indomitable",
] as const;
export const MoraleSettings = [
  "VeryHard",
  "Hard",
  "Default",
  "Easy",
  "Disabled",
] as const;
export const CalorieBurnSettings = [
  "VeryHard",
  "Hard",
  "Default",
  "Easy",
  "Disabled",
] as const;
export const StressBreaksSettings = ["Disabled", "Default"] as const;
export const SandboxModeSettings = ["Disabled", "Enabled"] as const;

export const QualityLevelSettingValues = {
  ImmuneSystem: ImmuneSystemSettings,
  Stress: StressSettings,
  StressBreaks: StressBreaksSettings,
  Morale: MoraleSettings,
  CalorieBurn: CalorieBurnSettings,
  SandboxMode: SandboxModeSettings,
} satisfies Record<QualityLevelSettings[0], readonly string[]>;
