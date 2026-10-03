import type { HashedString } from "../save-structure/data-types/hashed-string.ts";

export type DisplayKind =
  | "element"
  | "prefab"
  | "attribute"
  | "skill"
  | "skillGroup"
  | "trait"
  | "geyser"
  | "disease"
  | "healthState";

export type DisplayId = string | number | Readonly<HashedString>;

export type DisplayIdFor<K extends DisplayKind> = K extends "healthState"
  ? string | number
  : DisplayId;

export interface DisplayInfo<K extends DisplayKind = DisplayKind> {
  readonly kind: K;
  readonly rawId: DisplayIdFor<K>;
  readonly internalId: string | null;
  readonly label: string;
  readonly labelSource: "english" | "internal" | "unknown";
}
