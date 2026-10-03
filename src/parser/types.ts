export interface ParserInstruction {
  type: string;
  isMeta?: boolean;
}

export function isMetaInstruction(inst: unknown): inst is ParserInstruction {
  return typeof inst === "object" && inst !== null && "type" in inst &&
    typeof inst.type === "string" && "isMeta" in inst && inst.isMeta === true;
}
