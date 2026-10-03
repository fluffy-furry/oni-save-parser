import type { TypeTemplate, TypeTemplates } from "./type-templates.ts";

/** An index owned by one save operation; never cache mutable public templates globally. */
export type TemplateLookup = ReadonlyMap<string, TypeTemplate>;

export function createTemplateLookup(templates: TypeTemplates): TemplateLookup {
  const index = new Map<string, TypeTemplate>();
  for (const template of templates) {
    // Match Array.find: the first declaration wins if names are duplicated.
    if (!index.has(template.name)) index.set(template.name, template);
  }
  return index;
}
