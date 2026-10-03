import {
  deepStrictEqual,
  equal,
  notStrictEqual,
  ok,
  throws,
} from "node:assert/strict";
import {
  caloriesToKilocalories,
  celsiusToKelvin,
  cyclesToSeconds,
  fahrenheitToKelvin,
  getBehavior,
  getDisplayInfo,
  getHealthStateName,
  HashedString,
  HealthState,
  kelvinToCelsius,
  kelvinToFahrenheit,
  kilocaloriesToCalories,
  kilogramsToUnits,
  parseSaveGame,
  PrimaryElementBehavior,
  secondsToCycles,
  SimHashes,
  unitsToKilograms,
  writeSaveGame,
} from "../src/index.ts";
import { SerializationTypeInfo as Type } from "../src/save-structure/type-templates/index.ts";
import { createSaveGame } from "./fixtures/save_game.ts";

function close(actual: number, expected: number, tolerance = 1e-9): void {
  ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
}

Deno.test("display names distinguish equal hashes in different namespaces", () => {
  const steam = HashedString("steam");
  equal(steam.hash, SimHashes.Steam);
  deepStrictEqual(getDisplayInfo("element", steam), {
    kind: "element",
    rawId: steam,
    internalId: "Steam",
    label: "Steam",
    labelSource: "english",
  });
  equal(getDisplayInfo("geyser", steam).label, "Cool Steam Vent");
  equal(getDisplayInfo("geyser", "hot_steam").label, "Steam Vent");
  equal(getDisplayInfo("attribute", "Digging").label, "Excavation");
  equal(getDisplayInfo("skill", "Mining1").label, "Hard Digging");
  equal(getDisplayInfo("skillGroup", HashedString("Mining")).label, "Digger");
  equal(getDisplayInfo("prefab", "Headquarters").label, "Printing Pod");
  equal(getDisplayInfo("trait", "CantResearch").label, "Yokel");
  equal(
    getDisplayInfo("disease", HashedString("PollenGerms")).label,
    "Floral Scent",
  );
});

Deno.test("unresolved and prototype-like IDs retain visible honest fallbacks", () => {
  for (
    const id of [
      "MyMod.CustomElement",
      "__proto__",
      "constructor",
      "toString",
      "",
      " \t ",
    ]
  ) {
    deepStrictEqual(getDisplayInfo("element", id), {
      kind: "element",
      rawId: id,
      internalId: id,
      label: id.trim().length === 0 ? JSON.stringify(id) : id,
      labelSource: "internal",
    });
  }
  const unknownHash = HashedString("MyMod.CustomElement");
  const unknown = getDisplayInfo("element", unknownHash);
  equal(unknown.internalId, null);
  equal(unknown.labelSource, "unknown");
  equal(unknown.label, `Unknown element (${unknownHash.hash})`);
  equal(getDisplayInfo("element", unknownHash.hash).rawId, unknownHash.hash);
  for (const hash of [NaN, Infinity, -Infinity, 1.5]) {
    equal(getDisplayInfo("element", hash).labelSource, "unknown");
  }
});

Deno.test("display labels are not reinterpreted as internal IDs", () => {
  const raw = SimHashes.DirtyWater;
  equal(getDisplayInfo("element", raw).label, "Polluted Water");
  equal(
    getDisplayInfo("element", "Polluted Water").internalId,
    "Polluted Water",
  );
  equal(getDisplayInfo("element", "Polluted Water").labelSource, "internal");
  equal(
    getDisplayInfo("element", HashedString("Polluted Water")).labelSource,
    "unknown",
  );
  equal(getDisplayInfo("element", "dirtywater").internalId, "dirtywater");
  equal(getDisplayInfo("element", "dirtywater").labelSource, "internal");
});

Deno.test("descriptions snapshot hashes without freezing caller-owned data", () => {
  const hash = { hash: SimHashes.Methane };
  const info = getDisplayInfo("element", hash);
  equal(info.label, "Natural Gas");
  notStrictEqual(info.rawId, hash);
  ok(Object.isFrozen(info));
  ok(Object.isFrozen(info.rawId));
  equal(Object.isFrozen(hash), false);
  hash.hash = SimHashes.Oxygen;
  deepStrictEqual(info.rawId, { hash: SimHashes.Methane });
  equal(info.label, "Natural Gas");
});

Deno.test("health labels use enum values and preserve the raw-name API", () => {
  equal(getDisplayInfo("healthState", HealthState.Scuffed).label, "Minor");
  equal(getDisplayInfo("healthState", HealthState.Perfect).label, "None");
  equal(getDisplayInfo("healthState", HealthState.Alright).label, "None");
  equal(getHealthStateName(HealthState.Scuffed), "Scuffed");
  equal(
    getDisplayInfo("healthState", HealthState.Invincible).labelSource,
    "internal",
  );
  equal(getDisplayInfo("healthState", 99).label, "Unknown healthState (99)");
  throws(() => {
    // @ts-expect-error Health state integers are enum values, not hashes.
    getDisplayInfo("healthState", { hash: HealthState.Scuffed });
  }, TypeError);
  throws(() => {
    // @ts-expect-error A domain is required and must be known.
    getDisplayInfo("__proto__", 0);
  }, RangeError);
});

Deno.test("unit conversions use absolute temperatures and duration cycles", () => {
  close(kelvinToCelsius(293.15), 20);
  close(kelvinToFahrenheit(293.15), 68);
  close(celsiusToKelvin(-40), fahrenheitToKelvin(-40));
  close(celsiusToKelvin(kelvinToCelsius(310.15)), 310.15);
  close(fahrenheitToKelvin(kelvinToFahrenheit(310.15)), 310.15);
  equal(secondsToCycles(0), 0);
  equal(secondsToCycles(900), 1.5);
  equal(cyclesToSeconds(1.5), 900);
  equal(caloriesToKilocalories(1_000_000), 1000);
  equal(kilocaloriesToCalories(1000), 1_000_000);
  equal(unitsToKilograms(4, 0.25), 1);
  equal(kilogramsToUnits(1, 0.25), 4);
  for (const factor of [0, -1, NaN, Infinity, -Infinity]) {
    throws(() => unitsToKilograms(1, factor), RangeError);
    throws(() => kilogramsToUnits(1, factor), RangeError);
  }
  throws(() => {
    // @ts-expect-error Never assume a prefab's mass per unit.
    unitsToKilograms(2);
  }, RangeError);
});

Deno.test("displaying parsed data leaves save bytes and unknown IDs unchanged", () => {
  const save = createSaveGame();
  save.templates.push({
    name: "HashedString",
    fields: [{ name: "hash", type: { info: Type.Int32 } }],
    properties: [],
  }, {
    name: "PrimaryElement",
    fields: [
      { name: "ElementID", type: { info: Type.Int32 } },
      { name: "Units", type: { info: Type.Single } },
      { name: "_Temperature", type: { info: Type.Single } },
      {
        name: "diseaseID",
        type: { info: Type.UserDefined, templateName: "HashedString" },
      },
      { name: "diseaseCount", type: { info: Type.Int32 } },
    ],
    properties: [],
  });
  const object = save.gameObjects[0]?.gameObjects[0];
  ok(object);
  const unknownGerm = HashedString("Mod.Germ");
  const primary: PrimaryElementBehavior = {
    name: "PrimaryElement",
    templateData: {
      ElementID: SimHashes.DirtyWater,
      Units: 4,
      _Temperature: 300,
      diseaseID: unknownGerm,
      diseaseCount: 7,
    },
  };
  object.behaviors.push(primary);
  const bytes = writeSaveGame(save);
  const parsed = parseSaveGame(bytes);
  const parsedObject = parsed.gameObjects[0]?.gameObjects[0];
  ok(parsedObject);
  const data = getBehavior(parsedObject, PrimaryElementBehavior)?.templateData;
  ok(data);
  equal(getDisplayInfo("element", data.ElementID).label, "Polluted Water");
  equal(getDisplayInfo("disease", data.diseaseID).labelSource, "unknown");
  close(kelvinToCelsius(data._Temperature), 26.85);
  deepStrictEqual(writeSaveGame(parsed), bytes);
  deepStrictEqual(data.diseaseID, unknownGerm);

  data._Temperature = celsiusToKelvin(20);
  const edited = parseSaveGame(writeSaveGame(parsed));
  const editedObject = edited.gameObjects[0]?.gameObjects[0];
  ok(editedObject);
  const editedData = getBehavior(editedObject, PrimaryElementBehavior)
    ?.templateData;
  ok(editedData);
  close(editedData._Temperature, 293.15, 0.0001);
  equal(editedData.ElementID, SimHashes.DirtyWater);
  deepStrictEqual(editedData.diseaseID, unknownGerm);
  deepStrictEqual(edited.version, { major: 7, minor: 31 });
});
