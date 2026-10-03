import { HashedString, type SaveGame } from "../../src/index.ts";
import {
  SerializationTypeInfo as Type,
  type TypeInfo,
  type TypeTemplate,
} from "../../src/save-structure/type-templates/index.ts";
import { createLatestSaveGame } from "./latest_save.ts";

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
  properties: Record<string, TypeInfo> = {},
): TypeTemplate {
  const entries = (values: Record<string, TypeInfo>) =>
    Object.entries(values).map(([name, type]) => ({ name, type }));
  return { name, fields: entries(fields), properties: entries(properties) };
}

const int = type(Type.Int32);
const single = type(Type.Single);
const string = type(Type.String);
const boolean = type(Type.Boolean);
const struct = (name: string) =>
  type(Type.UserDefined | Type.IS_VALUE_TYPE, name);
const array = (element: TypeInfo) => type(Type.Array, undefined, [element]);
const list = (element: TypeInfo) =>
  type(Type.List | Type.IS_GENERIC_TYPE, undefined, [element]);
const dictionary = (key: TypeInfo, value: TypeInfo) =>
  type(Type.Dictionary | Type.IS_GENERIC_TYPE, undefined, [key, value]);
const referenceName = (wrapper: string, element: string) =>
  `${wrapper}\`1[[${element}, Assembly-CSharp, Version=0.0.0.0, Culture=neutral, PublicKeyToken=null]]`;
const reference = (wrapper: string, element: string) =>
  type(
    Type.UserDefined | Type.IS_GENERIC_TYPE,
    referenceName(wrapper, element),
    [
      type(Type.UserDefined, element),
    ],
  );
const hash = struct("HashedString");

const templates = [
  template("Tag", { name: string, hash: int }),
  template(referenceName("Ref", "MinionAssignablesProxy"), { id: int }),
  template("MinionAssignablesProxy", { target_instance_id: int }),
  template("MinionIdentity", {
    model: struct("Tag"),
    name: string,
    gender: string,
    stickerType: string,
    arrivalTime: single,
    voiceIdx: int,
    assignableProxy: reference("Ref", "MinionAssignablesProxy"),
  }, {
    genderStringKey: string,
    nameStringKey: string,
    personalityResourceId: hash,
  }),
  template("MinionResume", {
    MasteryByRoleID: dictionary(string, boolean),
    MasteryBySkillID: dictionary(string, boolean),
    GrantedSkillIDs: list(string),
    AptitudeByRoleGroup: dictionary(hash, single),
    AptitudeBySkillGroup: dictionary(hash, single),
    currentRole: string,
    targetRole: string,
    currentHat: string,
    targetHat: string,
    totalExperienceGained: single,
  }),
  template("Klei.AI.AttributeLevels+LevelSaveLoad", {
    attributeId: string,
    experience: single,
    level: int,
  }),
  template("Klei.AI.AttributeLevels", {
    saveLoadLevels: array(struct("Klei.AI.AttributeLevels+LevelSaveLoad")),
  }),
  template("Klei.AI.Traits", { TraitIds: list(string) }),
  template("Klei.AI.Effects+SaveLoadEffect", {
    id: string,
    timeRemaining: single,
    saved: boolean,
  }),
  template("Klei.AI.Effects+SaveLoadImmunities", {
    giverID: string,
    effectID: string,
    saved: boolean,
  }),
  template("Klei.AI.Effects", {
    saveLoadEffects: array(struct("Klei.AI.Effects+SaveLoadEffect")),
    saveLoadImmunities: array(struct("Klei.AI.Effects+SaveLoadImmunities")),
  }),
  template("ResourceGuid", { Guid: string }),
  ...["Accessory", "Database.ClothingItemResource"].map((name) =>
    template(referenceName("ResourceRef", name), {
      guid: type(Type.UserDefined, "ResourceGuid"),
    })
  ),
  template("Accessorizer", {
    accessories: list(reference("ResourceRef", "Accessory")),
    clothingItems: list(
      reference("ResourceRef", "Database.ClothingItemResource"),
    ),
  }),
  template("ChoreConsumer+PriorityInfo", { priority: int }),
  template("ChoreConsumer", {
    choreGroupPriorities: dictionary(
      hash,
      struct("ChoreConsumer+PriorityInfo"),
    ),
  }),
  template("PrimaryElement", {
    ElementID: type(Type.Enumeration, "SimHashes"),
    _Temperature: single,
    diseaseID: hash,
    diseaseCount: int,
  }, { Units: single }),
  template("Navigator", {}),
];

const attributeIds = [
  "SpaceNavigation",
  "Construction",
  "Digging",
  "Machinery",
  "Athletics",
  "Learning",
  "Cooking",
  "Caring",
  "Strength",
  "Art",
  "Botanist",
  "Ranching",
  "PowerTinker",
  "FarmTinker",
  "Immunity",
  "LifeSupport",
  "Toggle",
];

const traits = [
  ["None", "FastLearner"],
  ["None", "FrostProof", "FrostProof"],
  [],
  ["None", "Fixture.酸素🧪"],
  ["None", "Fixture.Repeat", "Fixture.Repeat"],
];

export function createPopulatedSaveGame(
  {
    isCompressed = true,
    duplicantCount = 5,
    attributeCount = 17,
  }: {
    isCompressed?: boolean;
    duplicantCount?: number;
    attributeCount?: number;
  } = {},
): SaveGame {
  const save = createLatestSaveGame(38, isCompressed);
  save.header.gameInfo.numberOfDuplicants = duplicantCount;
  save.templates = [
    ...save.templates.filter((old) =>
      !templates.some((item) => item.name === old.name)
    ),
    ...structuredClone(templates),
  ];
  save.simData =
    Uint8Array.from({ length: 65539 }, (_, index) => index * 17 & 255).buffer;
  save.world.streamed.push(["terrain", new Uint8Array([255, 0, 128])]);
  save.world.streamed.push(["地形 🧪", new Uint8Array([17, 34, 51])]);
  const group = save.gameObjects[0]!;
  const prototype = structuredClone(group.gameObjects[0]!);
  group.gameObjects.length = 0;
  for (let index = 0; index < duplicantCount; index++) {
    const variant = index % 5;
    const empty = variant === 1;
    const absent = variant === 2;
    const object = structuredClone(prototype);
    object.position.x = index + 0.25;
    object.position.y = -index - 0.5;
    const values: Record<string, unknown> = {
      MinionIdentity: {
        model: { name: "Minion", ...HashedString("Minion") },
        name: `Fixture ${index + 1} 酸素 🧪`,
        gender: ["NB", "FEMALE", "MALE"][index % 3],
        stickerType: index % 2 ? "" : "Fixture.Sticker",
        arrivalTime: index * 600 + 0.5,
        voiceIdx: variant,
        assignableProxy: { id: 1000 + index },
        genderStringKey: ["NB", "FEMALE", "MALE"][index % 3],
        nameStringKey: `FIXTURE_${index}`,
        personalityResourceId: HashedString(`Fixture.${index}`),
      },
      MinionResume: {
        MasteryByRoleID: empty ? null : [],
        MasteryBySkillID: empty ? [] : absent ? null : [
          ["Mining1", true],
          ["Building1", false],
          ["Mining1", false],
        ],
        GrantedSkillIDs: empty ? [] : absent ? null : ["Mining1", "Mining1"],
        AptitudeByRoleGroup: empty ? null : [],
        AptitudeBySkillGroup: empty ? [] : absent ? null : [
          [HashedString("Mining"), 1],
          [HashedString("Mining"), 0.5],
          [HashedString("Fixture.未知"), -0.25],
        ],
        currentRole: "NoRole",
        targetRole: "NoRole",
        currentHat: empty ? "" : absent ? null : "hat_role_mining1",
        targetHat: index % 2 ? "hat_role_building1" : null,
        totalExperienceGained: index * 1024 + 0.25,
      },
      "Klei.AI.AttributeLevels": {
        saveLoadLevels: Array.from(
          { length: attributeCount },
          (_, attribute) => ({
            attributeId: attributeIds[attribute % attributeIds.length],
            experience: index * 16 + attribute * 0.5 + 0.25,
            level: variant === 1 && attribute < 2
              ? attribute === 0 ? -2147483648 : 2147483647
              : attribute - 4 + index,
          }),
        ),
      },
      "Klei.AI.Traits": { TraitIds: [...traits[variant]!] },
      "Klei.AI.Effects": {
        saveLoadEffects: empty ? [] : absent ? null : [
          { id: "Fixture.Effect", timeRemaining: 1.5, saved: true },
          { id: "Fixture.Effect", timeRemaining: -1, saved: false },
          { id: "Fixture.効果🧪", timeRemaining: 4096.25, saved: true },
        ],
        saveLoadImmunities: empty ? null : absent ? [] : [
          { giverID: "Fixture.Giver", effectID: "Fixture.Effect", saved: true },
          { giverID: "", effectID: "Fixture.効果🧪", saved: false },
        ],
      },
      Accessorizer: {
        accessories: empty ? [] : absent ? null : [
          { guid: { Guid: "Fixture.Accessory.頭" } },
          null,
          { guid: null },
          { guid: { Guid: "Fixture.Accessory.頭" } },
        ],
        clothingItems: empty ? null : absent ? [] : [
          { guid: { Guid: "Fixture.Clothing.🧪" } },
        ],
      },
      ChoreConsumer: {
        choreGroupPriorities: empty ? null : absent ? [] : [
          [{ hash: 0 }, { priority: -1 }],
          [{ hash: -2147483648 }, { priority: 0 }],
          [{ hash: 0 }, { priority: 5 }],
        ],
      },
      PrimaryElement: {
        ElementID: 108179667,
        _Temperature: 273.125 + index,
        diseaseID: HashedString("Fixture.Disease"),
        diseaseCount: index === 0 ? 2147483647 : 0,
        Units: index * 0.25,
      },
      Health: { canBeIncapacitated: index % 2 === 0 },
      Navigator: {},
    };
    object.behaviors.splice(
      0,
      object.behaviors.length,
      ...object.behaviors.filter((behavior) =>
        !Object.hasOwn(values, behavior.name)
      ),
      ...Object.entries(values).map(([name, templateData]) => ({
        name,
        templateData,
        extraData: undefined,
        extraRaw: name === "Navigator"
          ? new Uint8Array([0, 255, index & 255, 128, 17]).buffer
          : undefined,
      })),
    );
    group.gameObjects.push(object);
  }
  if (group.gameObjects[0]) {
    save.gameObjects.push({
      name: "Fixture.NonMinion",
      gameObjects: [structuredClone(group.gameObjects[0])],
    });
  }
  return save;
}
