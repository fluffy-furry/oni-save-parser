import {
  deepStrictEqual,
  equal,
  notStrictEqual,
  ok,
  throws,
} from "node:assert/strict";
import {
  createHashedStringEnum,
  getHashedString,
  HashedString,
} from "../src/save-structure/data-types/hashed-string.ts";
import {
  AccessoriesByType,
  Accessory,
  AccessoryTypes,
  getAccessoryName,
  getAccessoryOfType,
  getAccessoryType,
  getIndexOfAccessoryType,
  makeAccessoryID,
} from "../src/save-structure/const-data/accessories.ts";
import {
  GeyserType,
  GeyserTypeNames,
} from "../src/save-structure/const-data/geysers/geyser-type.ts";
import {
  MinionSkillGroup,
  MinionSkillGroupNames,
} from "../src/save-structure/const-data/skills/skill-group.ts";
import {
  getHealthStateName,
  HealthState,
} from "../src/save-structure/const-data/template-enumerations/health-state.ts";
import {
  SimHashes,
  SimHashNames,
} from "../src/save-structure/const-data/template-enumerations/sim-hashes.ts";
import {
  SpaceDestinationTypeName,
  SpaceDestinationTypeNames,
  SpaceDestinationTypes,
} from "../src/save-structure/const-data/space-destinations.ts";
import {
  E_VERSION_MAJOR,
  E_VERSION_MINOR,
  validateVersion,
} from "../src/save-structure/version-validator.ts";

Deno.test("SDBM hashes preserve signed overflow, UTF-16 and case folding", () => {
  const examples = [
    ["", 0],
    ["Oxygen", -1528777920],
    ["OXYGEN", -1528777920],
    ["steam", -899515856],
    ["Mining", 2129168560],
    ["Unicode: 酸素 🫧", -2047182530],
    ["a".repeat(10000), -659152384],
  ] as const;
  for (const [value, expected] of examples) {
    equal(HashedString(value).hash, expected);
    equal(getHashedString(value).hash, expected);
  }
});

Deno.test("hash factories work with new without changing or freezing the factory", () => {
  const constructed = new HashedString("Oxygen");
  const called = HashedString("Oxygen");
  deepStrictEqual(constructed, called);
  notStrictEqual(constructed, called);
  ok(Object.isFrozen(constructed));
  ok(Object.isFrozen(called));
  equal(Object.isFrozen(HashedString), false);
  equal(Object.hasOwn(HashedString, "hash"), false);
  equal(new HashedString("steam").hash, -899515856);

  const mutable = getHashedString("Oxygen");
  mutable.hash = 42;
  equal(mutable.hash, 42);
  equal(called.hash, -1528777920);
});

Deno.test("hashed enums retain ordered names and hidden reverse mappings", () => {
  const names = ["steam", "Mining", "__proto__", "constructor"] as const;
  const values = createHashedStringEnum(names);
  deepStrictEqual(Object.keys(values), names);
  equal(Object.getPrototypeOf(values), Object.prototype);
  for (const name of names) {
    const value = values[name];
    equal(values[value.hash], name);
    ok(Object.isFrozen(value));
    equal(
      Object.getOwnPropertyDescriptor(values, value.hash)?.enumerable,
      false,
    );
  }
});

Deno.test("game constant hashes and enumeration order remain consistent", () => {
  deepStrictEqual(Object.keys(GeyserType), GeyserTypeNames);
  deepStrictEqual(Object.keys(MinionSkillGroup), MinionSkillGroupNames);
  deepStrictEqual(SimHashNames, SimHashNames.toSorted());
  equal(SimHashNames.length * 2, Object.keys(SimHashes).length);
  for (const name of SimHashNames) {
    equal(HashedString(name).hash, SimHashes[name]);
    equal(SimHashes[SimHashes[name]], name);
  }
  deepStrictEqual(
    SpaceDestinationTypeNames,
    Object.keys(SpaceDestinationTypes),
  );
  equal(SpaceDestinationTypeNames[0], SpaceDestinationTypeName.Satellite);
  equal(SpaceDestinationTypeNames.at(-1), SpaceDestinationTypeName.Earth);
});

Deno.test("accessory factories return independent values with and without new", () => {
  const constructed = new Accessory("eyes_003");
  const called = Accessory("eyes_003");
  deepStrictEqual(constructed, { guid: { Guid: "Root.Accessories.eyes_003" } });
  deepStrictEqual(constructed, called);
  notStrictEqual(constructed, called);
  notStrictEqual(constructed.guid, called.guid);
  equal(Object.hasOwn(Accessory, "guid"), false);
  constructed.guid.Guid = makeAccessoryID("eyes_001");
  equal(getAccessoryName(called), "eyes_003");
  equal(getAccessoryName(new Accessory("hair_001")), "hair_001");
});

Deno.test("accessory helpers find the longest valid type prefix and missing values", () => {
  deepStrictEqual(AccessoryTypes, [
    "hat",
    "hat_hair",
    "hair_always",
    "hair",
    "headshape",
    "eyes",
    "mouth",
    "neck",
    "body",
    "arm",
  ]);
  for (const type of AccessoryTypes) {
    const accessory = Accessory(`${type}_999`);
    equal(getAccessoryType(accessory), type);
    equal(getAccessoryName(accessory), `${type}_999`);
  }
  equal(getAccessoryType("Root.Accessories.hat_hair_001"), "hat_hair");
  equal(getAccessoryType("Root.Accessories.hair_always_001"), "hair_always");
  equal(getAccessoryType("Root.Accessories.unknown_001"), null);
  equal(getAccessoryType("Root.Accessories.hair"), null);
  equal(getAccessoryType("hair_001"), null);
  equal(getAccessoryName("hair_001"), null);
  equal(AccessoriesByType.hat, null);

  const hair = Accessory("hair_001");
  const eyes = Accessory("eyes_003");
  const accessories = [hair, eyes] as const;
  equal(getIndexOfAccessoryType(accessories, "eyes"), 1);
  equal(getAccessoryOfType(accessories, "eyes"), eyes);
  equal(getIndexOfAccessoryType(accessories, "hat"), -1);
  equal(getAccessoryOfType(accessories, "hat"), null);
  equal(getAccessoryOfType([], "hair"), null);
});

Deno.test("health state lookups return null for invalid numeric IDs", () => {
  equal(getHealthStateName(HealthState.Perfect), "Perfect");
  equal(getHealthStateName(HealthState.Invincible), "Invincible");
  for (const invalid of [NaN, Infinity, -Infinity, -1, 0.5, 100]) {
    equal(getHealthStateName(invalid), null);
  }
  equal(Reflect.apply(getHealthStateName, undefined, ["Perfect"]), null);
});

Deno.test("version validation preserves native errors and stable error codes", () => {
  validateVersion(7, 31);
  validateVersion(7, 99, "major");
  throws(() => validateVersion(8, 31), {
    name: "Error",
    code: E_VERSION_MAJOR,
  });
  throws(() => validateVersion(7, 32), {
    name: "Error",
    code: E_VERSION_MINOR,
  });
});
