import {
  createHashedStringEnum,
  type HashedString,
} from "../../data-types/index.ts";

export const GeyserTypeNames = [
  "steam",
  "hot_steam",
  "hot_water",
  "slush_water",
  "filthy_water",
  "salt_water",
  "small_volcano",
  "big_volcano",
  "liquid_co2",
  "hot_co2",
  "hot_hydrogen",
  "hot_po2",
  "slimy_po2",
  "chlorine_gas",
  "methane",
  "molten_copper",
  "molten_iron",
  "molten_gold",
  "oil_drip",
  "slush_salt_water",
  "chlorine_gas_cool",
  "molten_aluminum",
  "molten_tungsten",
  "molten_niobium",
  "molten_cobalt",
  "liquid_sulfur",
  "murky_brine",
] as const;

export type GeyserType = HashedString;

export const GeyserType = createHashedStringEnum(GeyserTypeNames);
