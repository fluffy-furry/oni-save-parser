import type { SaveGame } from "../../src/index.ts";
import { HashedString } from "../../src/save-structure/data-types/index.ts";
import {
  SerializationTypeInfo as Type,
  type TypeInfo,
  type TypeTemplate,
} from "../../src/save-structure/type-templates/index.ts";
import { createSaveGame } from "./save_game.ts";

function type(
  info: Type,
  templateName?: string,
  subTypes?: TypeInfo[],
): TypeInfo {
  return { info, templateName, subTypes };
}

function template(
  name: string,
  fields: Record<string, TypeInfo>,
): TypeTemplate {
  return {
    name,
    fields: Object.entries(fields).map(([name, type]) => ({ name, type })),
    properties: [],
  };
}

const int = type(Type.Int32);
const string = type(Type.String);
const boolean = type(Type.Boolean);
const single = type(Type.Single);
const hash = type(Type.UserDefined | Type.IS_VALUE_TYPE, "HashedString");
const strings = type(Type.Array, undefined, [string]);
const mastery = type(Type.Dictionary | Type.IS_GENERIC_TYPE, undefined, [
  string,
  boolean,
]);
const aptitude = type(Type.Dictionary | Type.IS_GENERIC_TYPE, undefined, [
  hash,
  single,
]);

export function createLatestSaveGame(
  minor: 37 | 38 = 38,
  isCompressed = true,
): SaveGame {
  const save = createSaveGame(isCompressed);
  save.version.minor = minor;
  save.header.buildVersion = minor === 38 ? 744825 : 707956;
  save.header.gameInfo = {
    ...save.header.gameInfo,
    baseName: "Synthetic modern colony",
    saveMinorVersion: minor,
    dlcId: null,
    dlcIds: ["EXPANSION1_ID", "DLC2_ID", "DLC3_ID"],
    worldTraits: null,
  };
  save.templates.push(
    template("HashedString", { hash: int }),
    template("Fixture.Proxy", { id: int }),
    template("Fixture.Tag", { name: string, hash: int }),
    template("Health", { canBeIncapacitated: boolean }),
    template("MinionIdentity", {
      model: type(Type.UserDefined, "Fixture.Tag"),
      name: string,
      gender: string,
      stickerType: string,
      arrivalTime: single,
      voiceIdx: int,
      assignableProxy: type(Type.UserDefined, "Fixture.Proxy"),
      genderStringKey: string,
      nameStringKey: string,
      personalityResourceId: hash,
    }),
    template("MinionResume", {
      MasteryByRoleID: mastery,
      MasteryBySkillID: mastery,
      GrantedSkillIDs: strings,
      AptitudeByRoleGroup: aptitude,
      AptitudeBySkillGroup: aptitude,
      currentRole: string,
      targetRole: string,
      currentHat: string,
      targetHat: string,
      totalExperienceGained: single,
    }),
    template("Fixture.FutureBehavior", {
      enabled: boolean,
      absent: strings,
      values: type(Type.List | Type.IS_GENERIC_TYPE, undefined, [int]),
    }),
  );
  const worldTemplate = save.templates.find((item) =>
    item.name === "Klei.SaveFileRoot"
  )!;
  worldTemplate.fields.push({ name: "fixtureNewField", type: string });
  Object.assign(save.world, { fixtureNewField: "preserved extension" });
  const group = save.gameObjects[0]!;
  group.name = "Minion";
  const values: Record<string, unknown> = {
    Health: { canBeIncapacitated: true },
    MinionIdentity: {
      model: { name: "Minion", ...HashedString("Minion") },
      name: "Fixture Duplicant",
      gender: "NB",
      stickerType: "",
      arrivalTime: 600,
      voiceIdx: 2,
      assignableProxy: { id: 123 },
      genderStringKey: "NB",
      nameStringKey: "FIXTURE",
      personalityResourceId: HashedString("Fixture"),
    },
    MinionResume: {
      MasteryByRoleID: [],
      MasteryBySkillID: [["Mining1", true], ["Building1", false]],
      GrantedSkillIDs: ["Mining1"],
      AptitudeByRoleGroup: [],
      AptitudeBySkillGroup: [[HashedString("Mining"), 1]],
      currentRole: "NoRole",
      targetRole: "NoRole",
      currentHat: "hat_role_mining1",
      targetHat: null,
      totalExperienceGained: 1024.5,
    },
    "Fixture.FutureBehavior": {
      enabled: true,
      absent: null,
      values: [7, 8],
    },
  };
  for (const [name, templateData] of Object.entries(values)) {
    group.gameObjects[0]!.behaviors.push({
      name,
      templateData,
      extraData: undefined,
      extraRaw: name === "Fixture.FutureBehavior"
        ? new Uint8Array([0, 255, 17, 128, 64]).buffer
        : undefined,
    });
  }
  return save;
}
