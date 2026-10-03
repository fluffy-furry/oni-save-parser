import { deepStrictEqual } from "node:assert/strict";
import { parseArgs } from "node:util";
import {
  parseSaveGame,
  progressReporter,
  tagReporter,
  writeSaveGame,
} from "../src/index.ts";
import type { ParseInterceptor } from "../src/parser/index.ts";

const usage = `Usage: deno task roundtrip [options] <input.sav>

Parse a save, serialize it, and verify that every value survives the round trip,
including world streams and unknown behavior bytes. Write the verified result to
a new file; an existing output file is never overwritten.

Options:
  -o, --output <file>  Output path (default: <input>-writeback.sav)
      --progress       Show parser and writer progress
      --progress-tags  Show nested parser and writer tags
  -h, --help           Show this help
`;

export async function roundtrip(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      output: { type: "string", short: "o" },
      progress: { type: "boolean", default: false },
      "progress-tags": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  if (values.help) {
    console.log(usage);
    return;
  }
  const [inputPath] = positionals;
  if (positionals.length !== 1 || inputPath === undefined) {
    throw new Error(usage);
  }

  const outputPath = values.output ??
    `${inputPath.replace(/\.sav$/i, "")}-writeback.sav`;
  const tagPath: string[] = [];

  function reporter(phase: string): ParseInterceptor | undefined {
    if (!values.progress && !values["progress-tags"]) return undefined;
    const progress = progressReporter((message) => {
      if (values.progress) console.log(`${phase}: ${message}`);
    });
    const tags = tagReporter(
      (tag, instance) => {
        const name = instance === null ? tag : `${tag}::${instance}`;
        tagPath.push(name);
        if (values["progress-tags"]) console.log(`${phase} tag start: ${name}`);
      },
      (tag, instance) => {
        const name = instance === null ? tag : `${tag}::${instance}`;
        if (tagPath.pop() !== name) {
          throw new Error(`Unbalanced parser tag: ${name}`);
        }
        if (values["progress-tags"]) console.log(`${phase} tag end: ${name}`);
      },
    );
    return (instruction) => tags(progress(instruction));
  }

  try {
    const input = await Deno.readFile(inputPath);
    const original = parseSaveGame(input, reporter("Loading"));
    const output = new Uint8Array(writeSaveGame(original, reporter("Saving")));
    const reloaded = parseSaveGame(output, reporter("Checking"));
    deepStrictEqual(reloaded, original, "Save changed during the round trip");

    await Deno.writeFile(outputPath, output, { createNew: true });
    console.log(
      `Verified ${inputPath} (${input.byteLength} bytes) → ${outputPath} (${output.byteLength} bytes)`,
    );
  } catch (error) {
    if (tagPath.length) {
      throw new Error(`Failed inside ${tagPath.join(" → ")}`, { cause: error });
    }
    throw error;
  }
}

if (import.meta.main) {
  try {
    await roundtrip(Deno.args);
  } catch (error) {
    console.error(error);
    Deno.exitCode = 1;
  }
}
