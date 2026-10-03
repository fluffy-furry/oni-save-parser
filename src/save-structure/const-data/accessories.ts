export const ACCESSORY_ID_PREFIX = "Root.Accessories.";

export interface Accessory {
  guid: {
    /**
     * Note: Not an actual guid!  This is a string name of a nested resource,
     * such as ```Root.Accessories.eyes_003```.
     */
    Guid: string;
  };
}

export const AccessoryTypes = [
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
] as const;

export type AccessoryType = typeof AccessoryTypes[number];

export const EyeAccessoryNames = [
  "eyes_001",
  "eyes_002",
  "eyes_003",
  "eyes_004",
  "eyes_005",
] as const;

export const HeadshapeAccessoryNames = [
  "headshape_001",
  "headshape_002",
  "headshape_003",
  "headshape_004",
] as const;

export const MouthAccessoryNames = [
  "mouth_001",
  "mouth_002",
  "mouth_003",
  "mouth_004",
] as const;

export const HairAccessoryNames = [
  "hair_001",
  "hair_002",
  "hair_003",
  "hair_004",
  "hair_005",
  "hair_006",
  "hair_007",
  "hair_008",
  "hair_009",
  "hair_010",
  "hair_011",
  "hair_012",
  "hair_013",
  "hair_014",
  "hair_015",
  "hair_016",
  "hair_017",
  "hair_018",
  "hair_019",
  "hair_020",
  "hair_021",
  "hair_022",
  "hair_023",
  "hair_027",
  "hair_028",
  "hair_029",
  "hair_030",
  "hair_031",
  "hair_032",
  "hair_033",
] as const;

export const BodyAccessoryNames = [
  "body_001",
  "body_002",
  "body_003",
  "body_004",
] as const;

export const AccessoriesByType = {
  body: BodyAccessoryNames,
  hat: null,
  hat_hair: null,
  hair_always: null,
  hair: HairAccessoryNames,
  headshape: HeadshapeAccessoryNames,
  eyes: EyeAccessoryNames,
  mouth: MouthAccessoryNames,
  neck: null,
  arm: null,
} satisfies Record<AccessoryType, readonly string[] | null>;

interface AccessoryFactory {
  (name: string): Accessory;
  new (name: string): Accessory;
}

/** Create an independent accessory value, with or without `new`. */
export const Accessory = function Accessory(name: string): Accessory {
  return { guid: { Guid: makeAccessoryID(name) } };
} as AccessoryFactory;

export function getIndexOfAccessoryType(
  accessories: readonly Accessory[],
  type: AccessoryType,
): number {
  return accessories.findIndex((acc) => {
    const accType = getAccessoryType(acc);
    return type === accType;
  });
}

export function getAccessoryType(
  accessory: string | Accessory,
): AccessoryType | null {
  const guid = accessoryToGuid(accessory);
  if (!guid || !guid.startsWith(ACCESSORY_ID_PREFIX)) {
    return null;
  }
  const id = guid.slice(ACCESSORY_ID_PREFIX.length);
  // Determining the type is a bit problematic, as we have
  //  some types that are prefixes of other types.
  // The game itself can resolve this as it looks up
  //  exact matches, but we need to be able to handle
  //  values we are not aware of.
  // Below is an attempt at a solution in which we find the longest
  //  matching type
  return AccessoryTypes.reduce((matchType: AccessoryType | null, type) => {
    if (
      id.startsWith(type + "_") &&
      (matchType == null || type.length > matchType.length)
    ) {
      return type;
    }
    return matchType;
  }, null);
}

export function getAccessoryName(accessory: string | Accessory): string | null {
  const guid = accessoryToGuid(accessory);
  if (!guid || !guid.startsWith(ACCESSORY_ID_PREFIX)) {
    return null;
  }
  return guid.slice(ACCESSORY_ID_PREFIX.length);
}

export function makeAccessoryID(name: string): string {
  return `${ACCESSORY_ID_PREFIX}${name}`;
}

export function getAccessoryOfType(
  accessories: readonly Accessory[],
  type: AccessoryType,
): Accessory | null {
  const index = getIndexOfAccessoryType(accessories, type);
  return accessories[index] ?? null;
}

function accessoryToGuid(accessory: string | Accessory): string | undefined {
  if (typeof accessory === "string") {
    return accessory;
  }
  if (
    accessory.guid != null &&
    typeof accessory.guid === "object" &&
    typeof accessory.guid.Guid === "string"
  ) {
    return accessory.guid.Guid;
  }
  return undefined;
}
