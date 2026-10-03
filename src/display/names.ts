import { englishLabels } from "./catalog.ts";
import type {
  DisplayId,
  DisplayIdFor,
  DisplayInfo,
  DisplayKind,
} from "./types.ts";
import { getHashedString } from "../save-structure/data-types/hashed-string.ts";
import { SimHashNames } from "../save-structure/const-data/template-enumerations/sim-hashes.ts";
import { getHealthStateName } from "../save-structure/const-data/template-enumerations/health-state.ts";
import { KnownGameObjectTypes } from "../save-structure/game-objects/game-object-group/known-game-objects.ts";
import { MinionSkillNames } from "../save-structure/const-data/skills/skills.ts";
import { MinionSkillGroupNames } from "../save-structure/const-data/skills/skill-group.ts";
import { AI_TRAIT_IDS } from "../save-structure/game-objects/game-object-behavior/known-behaviors/ai-traits.ts";
import { GeyserTypeNames } from "../save-structure/const-data/geysers/geyser-type.ts";

const knownIds: Readonly<
  Record<Exclude<DisplayKind, "healthState">, readonly string[]>
> = {
  element: SimHashNames,
  prefab: Object.values(KnownGameObjectTypes),
  attribute: [],
  skill: MinionSkillNames,
  skillGroup: MinionSkillGroupNames,
  trait: AI_TRAIT_IDS,
  geyser: GeyserTypeNames,
  disease: [],
};

const hashIndexes = new Map<DisplayKind, ReadonlyMap<number, string | null>>();

function hashIndex(
  kind: Exclude<DisplayKind, "healthState">,
): ReadonlyMap<number, string | null> {
  const cached = hashIndexes.get(kind);
  if (cached) return cached;
  const index = new Map<number, string | null>();
  for (
    const id of new Set([
      ...knownIds[kind],
      ...Object.keys(englishLabels[kind]),
    ])
  ) {
    const hash = getHashedString(id).hash;
    index.set(hash, index.has(hash) && index.get(hash) !== id ? null : id);
  }
  hashIndexes.set(kind, index);
  return index;
}

export function getDisplayInfo<K extends DisplayKind>(
  kind: K,
  rawId: DisplayIdFor<K>,
): DisplayInfo<K> {
  if (!Object.hasOwn(englishLabels, kind)) {
    throw new RangeError(`Unknown display kind: ${kind}`);
  }
  const id: DisplayId = rawId;
  if (typeof id !== "string" && typeof id !== "number") {
    if (id === null || typeof id !== "object" || typeof id.hash !== "number") {
      throw new TypeError("Expected an internal ID, number, or hash object.");
    }
    if (kind === "healthState") {
      throw new TypeError("Health states use enum values, not hash objects.");
    }
  }

  let internalId: string | null;
  if (typeof id === "string") {
    internalId = id;
  } else if (kind === "healthState") {
    internalId = typeof id === "number" ? getHealthStateName(id) : null;
  } else {
    const hash = typeof id === "number" ? id : id.hash;
    internalId = hashIndex(kind).get(hash) ?? null;
  }

  const labels = englishLabels[kind];
  const english = internalId !== null && Object.hasOwn(labels, internalId)
    ? labels[internalId]
    : undefined;
  const labelSource = english !== undefined
    ? "english"
    : internalId !== null
    ? "internal"
    : "unknown";
  const value = typeof id === "object" ? id.hash : id;
  const internalLabel = internalId !== null && internalId.trim().length === 0
    ? JSON.stringify(internalId)
    : internalId;
  return Object.freeze({
    kind,
    rawId: (typeof id === "object"
      ? Object.freeze({ hash: id.hash })
      : id) as DisplayIdFor<K>,
    internalId,
    label: english ?? internalLabel ?? `Unknown ${kind} (${value})`,
    labelSource,
  });
}
