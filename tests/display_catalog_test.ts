import { equal, ok } from "node:assert/strict";
import { englishLabels } from "../src/display/catalog.ts";
import { GeyserTypeNames } from "../src/save-structure/const-data/geysers/geyser-type.ts";
import { MinionSkillGroupNames } from "../src/save-structure/const-data/skills/skill-group.ts";
import { MinionSkillNames } from "../src/save-structure/const-data/skills/skills.ts";
import { SimHashNames } from "../src/save-structure/const-data/template-enumerations/sim-hashes.ts";
import { AI_TRAIT_IDS } from "../src/save-structure/game-objects/game-object-behavior/known-behaviors/ai-traits.ts";
import { KnownGameObjectTypes } from "../src/save-structure/game-objects/game-object-group/known-game-objects.ts";

Deno.test("English element names preserve the game's confusing internal aliases", () => {
  const expected = {
    Carbon: "Coal",
    Chlorine: "Liquid Chlorine",
    ChlorineGas: "Chlorine Gas",
    ContaminatedOxygen: "Polluted Oxygen",
    Cuprite: "Copper Ore",
    DirtyWater: "Polluted Water",
    Katairite: "Abyssalite",
    Methane: "Natural Gas",
    Oxygen: "Oxygen",
    Polypropylene: "Plastic",
    ToxicSand: "Polluted Dirt",
    Unobtanium: "Neutronium",
  };
  for (const [id, label] of Object.entries(expected)) {
    equal(englishLabels.element[id], label, id);
  }
  equal(englishLabels.element.Isoresin, "Isosap");
  equal(englishLabels.element.SuperInsulator, "Insulite");
});

Deno.test("prefabs and geysers name objects rather than their materials", () => {
  equal(englishLabels.prefab.Headquarters, "Printing Pod");
  equal(englishLabels.prefab.GasPermeableMembrane, "Airflow Tile");
  equal(englishLabels.prefab.ColdBreather, "Wheezewort");
  equal(englishLabels.prefab.Oilfloater, "Slickster");
  equal(englishLabels.geyser.methane, "Natural Gas Geyser");
  equal(englishLabels.prefab.GeyserGeneric_methane, "Natural Gas Geyser");
  equal(englishLabels.geyser.steam, "Cool Steam Vent");
  equal(englishLabels.geyser.hot_steam, "Steam Vent");
  equal(englishLabels.geyser.slush_water, "Cool Slush Geyser");
  equal(englishLabels.geyser.filthy_water, "Polluted Water Vent");
  equal(englishLabels.geyser.oil_drip, "Leaky Oil Fissure");
});

Deno.test("attribute, skill, trait, disease, and injury names remain distinct", () => {
  equal(englishLabels.attribute.Digging, "Excavation");
  equal(englishLabels.skill.Mining1, "Hard Digging");
  equal(englishLabels.skill.Mining2, "Superhard Digging");
  equal(englishLabels.skill.Mining3, "Super-Duperhard Digging");
  equal(englishLabels.skillGroup.Mining, "Digging");
  equal(englishLabels.attribute.Learning, "Science");
  equal(englishLabels.trait.FastLearner, "Quick Learner");
  equal(englishLabels.trait.BedsideManner, "Caregiver");
  equal(englishLabels.skill.Medicine2, "Bedside Manner");
  equal(englishLabels.disease.PollenGerms, "Floral Scent");
  equal(englishLabels.disease.SlimeLung, "Slimelung");
  equal(englishLabels.healthState.Alright, "None");
  equal(englishLabels.healthState.Scuffed, "Minor");
  equal(englishLabels.healthState.Critical, "Severe");
  equal(englishLabels.healthState.Dead, "Conclusive");
});

Deno.test("unverified, obsolete, and placeholder names stay unresolved", () => {
  equal(englishLabels.trait.None, undefined);
  equal(englishLabels.trait.Stinky, undefined);
  equal(englishLabels.trait.Claustrophobic, undefined);
  equal(englishLabels.skillGroup.Management, undefined);
  equal(englishLabels.skill.Astronauting1, undefined);
  equal(englishLabels.skill.Astronauting2, undefined);
  equal(englishLabels.healthState.Invincible, undefined);
  equal(englishLabels.element.UnrecognizedElement, undefined);
  equal(englishLabels.geyser.unrecognized_geyser, undefined);
});

Deno.test("current element, geyser, and skill labels resolve verified IDs", () => {
  equal(englishLabels.element.Cobalt, "Cobalt");
  equal(englishLabels.element.Cobaltite, "Cobalt Ore");
  equal(englishLabels.element.MurkyBrine, "Polluted Brine");
  equal(englishLabels.geyser.slush_salt_water, "Cool Salt Slush Geyser");
  equal(englishLabels.prefab.GeyserGeneric_molten_cobalt, "Cobalt Volcano");
  equal(englishLabels.skill.Mining4, "Hazmat Digging");
  equal(englishLabels.skill.AtomicResearch, "Applied Sciences Research");
  equal(englishLabels.skill.BionicsA1, "Booster Processing I");
  equal(englishLabels.skill.Swimming2, "Divemaster");
  equal(englishLabels.skillGroup.Rocketry, "Rocketry");
  equal(englishLabels.skillGroup.SwimmingSkills, "Swimming");
  equal(englishLabels.disease.RadiationSickness, "Radioactive Contaminants");
});

Deno.test("display catalog contains frozen plain names scoped to existing catalogs", () => {
  const existing = {
    element: SimHashNames,
    prefab: Object.values(KnownGameObjectTypes),
    skill: MinionSkillNames,
    skillGroup: MinionSkillGroupNames,
    trait: AI_TRAIT_IDS,
    geyser: GeyserTypeNames,
  };
  for (const [kind, ids] of Object.entries(existing)) {
    const catalog = englishLabels[kind as keyof typeof existing];
    const knownIds = new Set<string>(ids);
    for (const id of Object.keys(catalog)) {
      ok(knownIds.has(id), `${kind}: ${id}`);
    }
  }
  for (const id of SimHashNames) {
    ok(Object.hasOwn(englishLabels.element, id), id);
  }
  for (const id of GeyserTypeNames) {
    ok(Object.hasOwn(englishLabels.geyser, id), id);
  }
  ok(Object.isFrozen(englishLabels));
  for (const catalog of Object.values(englishLabels)) {
    ok(Object.isFrozen(catalog));
    for (const label of Object.values(catalog)) {
      ok(label.length > 0);
      equal(/[<>\r\n{}]/u.test(label), false, label);
    }
  }
});
