import type { ParseInterceptor } from "../parser/parse/parser.ts";

export function tagReporter(
  onTagStart: (tag: string, instanceName: string | null) => void,
  onTagEnd?: (tag: string, instanceName: string | null) => void,
): ParseInterceptor {
  return (instruction) => {
    if (
      typeof instruction !== "object" || instruction === null ||
      !("type" in instruction) || !("tag" in instruction) ||
      typeof instruction.tag !== "string"
    ) return instruction;
    const instanceName = "instanceName" in instruction &&
        typeof instruction.instanceName === "string"
      ? instruction.instanceName || null
      : null;
    if (instruction.type === "tagged-parse:start") {
      onTagStart(instruction.tag, instanceName);
    } else if (instruction.type === "tagged-parse:end") {
      onTagEnd?.(instruction.tag, instanceName);
    }
    return instruction;
  };
}
