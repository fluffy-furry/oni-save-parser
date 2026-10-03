export * from "./health-state.ts";
export * from "./sim-hashes.ts";

import { HealthState } from "./health-state.ts";
import { SimHashes } from "./sim-hashes.ts";

export const EnumerationsByName = {
  "Health+HealthState": HealthState,
  SimHashes,
};
