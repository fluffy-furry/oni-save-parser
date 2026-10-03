import type { ProgressInstruction } from "./types.ts";
import type { ParseInterceptor } from "../parser/index.ts";

export function reportProgress(message: string): ProgressInstruction {
  return {
    type: "progress",
    isMeta: true,
    message,
  };
}

export function progressReporter(
  onProgress: (message: string) => void,
): ParseInterceptor {
  return (instruction) => {
    if (
      typeof instruction === "object" && instruction !== null &&
      "type" in instruction && instruction.type === "progress" &&
      "message" in instruction && typeof instruction.message === "string"
    ) {
      onProgress(instruction.message);
    }
    return instruction;
  };
}
