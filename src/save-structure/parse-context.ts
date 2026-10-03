import type {
  TemplateParser,
  TemplateUnparser,
} from "./type-templates/template-data-parser.ts";

import type { SaveGameHeader } from "./header/index.ts";

export type ParseContext = TemplateParser & SaveGameHeader;
export type WriteContext = TemplateUnparser & SaveGameHeader;
