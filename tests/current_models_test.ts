import { equal, ok } from "node:assert/strict";
import { HashedString } from "../src/save-structure/data-types/index.ts";
import type { SaveGameData } from "../src/save-structure/game-data/game-data.ts";
import type { MinionIdentityBehavior } from "../src/save-structure/game-objects/game-object-behavior/known-behaviors/minion-identity.ts";
import type { MinionResumeBehavior } from "../src/save-structure/game-objects/game-object-behavior/known-behaviors/minion-resume.ts";
import type { HealthBehavior } from "../src/save-structure/game-objects/game-object-behavior/known-behaviors/health.ts";
import type { StorageBehavior } from "../src/save-structure/game-objects/game-object-behavior/known-behaviors/storage/storage.ts";
import type { PrimaryElementBehavior } from "../src/save-structure/game-objects/game-object-behavior/known-behaviors/primary-element.ts";
import type { AISicknessInstance } from "../src/save-structure/game-objects/game-object-behavior/known-behaviors/minion-modifiers/minion-modifiers.ts";
import { SimHashes } from "../src/save-structure/const-data/template-enumerations/sim-hashes.ts";
import { HealthState } from "../src/save-structure/const-data/template-enumerations/health-state.ts";

Deno.test("current serialized behavior shapes satisfy the public models", () => {
  const identity = {
    model: { name: "Minion", ...HashedString("Minion") },
    name: "Example",
    gender: "MALE",
    stickerType: "",
    arrivalTime: 0,
    voiceIdx: 0,
    assignableProxy: { id: 1 },
    genderStringKey: "MALE",
    nameStringKey: "EXAMPLE",
    personalityResourceId: { hash: 0 },
  } satisfies MinionIdentityBehavior["templateData"];
  const resume = {
    MasteryByRoleID: [],
    MasteryBySkillID: [["FixtureSkill", true]],
    GrantedSkillIDs: ["FixtureSkill"],
    AptitudeByRoleGroup: [],
    AptitudeBySkillGroup: [[HashedString("FixtureInterest"), 1]],
    currentRole: "NoRole",
    targetRole: "NoRole",
    currentHat: null,
    targetHat: null,
    totalExperienceGained: 1200,
  } satisfies MinionResumeBehavior["templateData"];
  const health = {
    canBeIncapacitated: false,
    State: HealthState.Perfect,
    CauseOfIncapacitation: { name: null, hash: 0 },
  } satisfies HealthBehavior["templateData"];
  const storage = {
    onlyFetchMarkedItems: false,
    shouldSaveItems: true,
    workTimeRemaining: 2.25,
    numberOfUses: 3,
  } satisfies StorageBehavior["templateData"];
  const element = {
    ElementID: SimHashes.Cobalt,
    Units: 1,
    _Temperature: 293.15,
    KeepZeroMassObject: false,
    diseaseID: { hash: 0 },
    diseaseCount: 0,
  } satisfies PrimaryElementBehavior["templateData"];
  equal(identity.model.name, "Minion");
  equal(resume.targetHat, null);
  equal(health.State, HealthState.Perfect);
  ok(storage.shouldSaveItems);
  equal(element.ElementID, 108179667);
});

Deno.test("current game data allows new settings and absent legacy regions", () => {
  const data = {
    gasConduitFlow: null,
    liquidConduitFlow: null,
    fallingWater: null,
    bubbleManager: null,
    unstableGround: null,
    worldDetail: null,
    customGameSettings: {
      is_custom_game: true,
      customGameMode: 255,
      CurrentQualityLevelsBySetting: [["Radiation", "Default"]],
      CurrentMixingLevelsBySetting: [["DLC3_ID", "Enabled"]],
    },
    storySetings: null,
    spaceScannerNetworkManager: null,
    debugWasUsed: false,
    autoPrioritizeRoles: false,
    advancedPersonalPriorities: true,
    savedInfo: {
      discoveredSurface: false,
      discoveredOilField: false,
      curedDisease: false,
      blockedCometWithBunkerDoor: false,
      creaturePoopAmount: [],
      powerCreatedbyGeneratorType: [],
    },
    dateGenerated: "",
    changelistsPlayedOn: [744825],
  } satisfies SaveGameData;
  equal(data.changelistsPlayedOn[0], 744825);
  equal(
    data.customGameSettings.CurrentMixingLevelsBySetting[0]?.[0],
    "DLC3_ID",
  );
});

Deno.test("legacy health fields remain accepted", () => {
  const health = {
    CanBeIncapacitated: true,
    State: HealthState.Scuffed,
  } satisfies HealthBehavior["templateData"];
  equal(health.State, HealthState.Scuffed);
});

Deno.test("legacy identities and sicknesses accept old fields without new ones", () => {
  const identity = {
    name: "Example",
    nameStringKey: "EXAMPLE",
    gender: "NB",
    genderStringKey: "NB",
    arrivalTime: 0,
    voiceIdx: 0,
    bodyData: {
      headShape: { hash: 0 },
      mouth: { hash: 0 },
      neck: { hash: 0 },
      eyes: { hash: 0 },
      hair: { hash: 0 },
      body: { hash: 0 },
      arms: { hash: 0 },
      hat: { hash: 0 },
    },
    assignableProxy: { id: 1 },
  } satisfies MinionIdentityBehavior["templateData"];
  const currentSickness = {
    name: "FoodSickness",
    value: {
      exposureInfo: { sicknessID: "FoodSickness", sourceInfo: "Example" },
    },
  } satisfies AISicknessInstance;
  const legacySickness = {
    ...currentSickness,
    value: { ...currentSickness.value, diseaseId: "FoodSickness" },
  } satisfies AISicknessInstance;
  equal(identity.bodyData.headShape.hash, 0);
  equal(legacySickness.value.diseaseId, currentSickness.name);
});
