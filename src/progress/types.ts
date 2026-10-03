import type { ParserInstruction } from "../parser/types.ts";

export interface ProgressInstruction extends ParserInstruction {
  type: "progress";
  isMeta: true;
  message: string;
}
