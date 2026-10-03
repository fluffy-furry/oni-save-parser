import { deepStrictEqual } from "node:assert/strict";
import { resolve } from "node:path";
import { resourceUsage } from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import type { GameObject, SaveGame } from "../src/index.ts";
import { createSaveGame } from "../tests/fixtures/save_game.ts";

const MiB = 1024 * 1024;
const modes = ["sync", "stream"] as const;
const patterns = ["compressible", "random", "object-heavy"] as const;
type Mode = typeof modes[number];
type Pattern = typeof patterns[number];

interface SaveModule {
  parseSaveGame(data: Uint8Array): SaveGame;
  writeSaveGame(save: SaveGame): ArrayBuffer;
  writeSaveGameStream?(save: SaveGame): ReadableStream<Uint8Array>;
}

const usage =
  `Usage: deno run --allow-read --allow-write --allow-run tools/profile-save.ts [options]

Measure read → parse → edit → serialize → disk in fresh child processes. Fixture
generation runs separately so it does not inflate measured peak memory. Results
are JSON Lines on stdout; fixture progress goes to stderr. Files are removed
afterwards unless --keep is set. Synthetic saves are not playable game worlds.
Each result is verified against the modified input in another fresh process;
verification time and memory are excluded from measurement.

Options:
  --module <path>          Source entry point; repeat to compare implementations
                          (default: src/index.ts next to this tool)
  --mode <value>           sync, stream, or both (default: both)
  --sizes <MiB,...>        Opaque world+simulation bytes (default: 8,64,256)
  --patterns <names,...>   compressible,random,object-heavy (default: all three)
  --compression <value>    compressed, uncompressed, or both (default: both)
  --objects <count>        Override object count (default: 50,000 for object-heavy;
                          1,000 otherwise)
  --templates <count>      Additional empty templates (default: 512)
  --iterations <count>     Fresh measurement processes per case (default: 1)
  --directory <path>       Parent directory for temporary fixtures/results
  --keep                  Retain generated files
  --help                  Show this help

Example:
  deno run --allow-read --allow-write --allow-run tools/profile-save.ts \\
    --module /path/to/baseline/src/index.ts --module src/index.ts \\
    --sizes 8 --patterns compressible --compression compressed

Streaming serialization overlaps disk output, so its combined serializeAndWrite
time is comparable to the sum of synchronous serialize and write. No fsync is
included: disk output measures writes accepted by the operating system.
`;

const { values } = parseArgs({
  args: Deno.args,
  options: {
    module: { type: "string", multiple: true },
    mode: { type: "string", default: "both" },
    sizes: { type: "string", default: "8,64,256" },
    patterns: { type: "string", default: patterns.join(",") },
    compression: { type: "string", default: "both" },
    objects: { type: "string" },
    templates: { type: "string", default: "512" },
    iterations: { type: "string", default: "1" },
    directory: { type: "string" },
    keep: { type: "boolean", default: false },
    help: { type: "boolean", default: false },
    // Private worker arguments are also explicit so unknown flags are rejected.
    worker: { type: "string" },
    input: { type: "string" },
    output: { type: "string" },
    iteration: { type: "string" },
  },
});

if (values.help) {
  console.log(usage);
} else {
  try {
    if (values.worker) await runWorker(values.worker);
    else await orchestrate();
  } catch (error) {
    console.error(error);
    Deno.exitCode = 1;
  }
}

function moduleUrl(path: string): string {
  const url = path.startsWith("file:")
    ? new URL(path)
    : pathToFileURL(resolve(path));
  if (url.protocol !== "file:") {
    throw new TypeError("Module must be a local file");
  }
  return url.href;
}

function naturalNumber(value: string, label: string, minimum = 0): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum) {
    throw new RangeError(`${label} must be an integer >= ${minimum}`);
  }
  return number;
}

function payloadSize(value: string): number {
  const bytes = Number(value) * MiB;
  if (!Number.isSafeInteger(bytes) || bytes < 4 || bytes % 4 !== 0) {
    throw new RangeError(
      "Sizes must be positive MiB values with whole 4-byte units",
    );
  }
  return bytes;
}

function selected<T extends string>(value: string, allowed: readonly T[]): T {
  const found = allowed.find((entry) => entry === value);
  if (found === undefined) {
    throw new TypeError(`Expected ${allowed.join(", ")}; got ${value}`);
  }
  return found;
}

function objectCount(pattern: Pattern): number {
  return values.objects === undefined
    ? pattern === "object-heavy" ? 50_000 : 1_000
    : naturalNumber(values.objects, "objects", 1);
}

async function orchestrate(): Promise<void> {
  const implementations = values.module?.map(moduleUrl) ??
    [new URL("../src/index.ts", import.meta.url).href];
  const selectedModes = values.mode === "both"
    ? modes
    : [selected(values.mode, modes)];
  const selectedPatterns = values.patterns.split(",").map((value) =>
    selected(value, patterns)
  );
  const selectedCompression = values.compression === "both" ? [false, true] : [
    selected(values.compression, ["compressed", "uncompressed"]) ===
      "compressed",
  ];
  const sizes = values.sizes.split(",").map(payloadSize);
  const iterations = naturalNumber(values.iterations, "iterations", 1);
  const extraTemplates = naturalNumber(values.templates, "templates");
  const directory = await Deno.makeTempDir({
    prefix: "oni-profile-",
    ...(values.directory === undefined ? {} : { dir: values.directory }),
  });
  console.error(`Profile files: ${directory}`);
  try {
    for (const bytes of sizes) {
      for (const pattern of selectedPatterns) {
        for (const compressed of selectedCompression) {
          const caseName = `${bytes / MiB}MiB-${pattern}-${
            compressed ? "compressed" : "plain"
          }`;
          const input = `${directory}/${caseName}.sav`;
          const caseArgs = [
            "--sizes",
            String(bytes / MiB),
            "--patterns",
            pattern,
            "--compression",
            compressed ? "compressed" : "uncompressed",
            "--objects",
            String(objectCount(pattern)),
            "--templates",
            String(extraTemplates),
            "--input",
            input,
          ];
          console.error(`Generating ${caseName}`);
          // Generate each common input once using the first implementation.
          // Later module comparisons therefore read exactly the same file.
          await child([
            "--worker",
            "generate",
            "--module",
            implementations[0]!,
            ...caseArgs,
          ]);
          for (
            const [implementationIndex, implementation] of implementations
              .entries()
          ) {
            for (const mode of selectedModes) {
              for (let iteration = 1; iteration <= iterations; iteration++) {
                const output =
                  `${directory}/${caseName}-${implementationIndex}-${mode}-${iteration}.sav`;
                const result = await child([
                  "--worker",
                  "measure",
                  "--module",
                  implementation,
                  "--mode",
                  mode,
                  "--output",
                  output,
                  "--iteration",
                  String(iteration),
                  ...caseArgs,
                ]);
                const measurement: Record<string, unknown> = JSON.parse(result);
                if (measurement.status === "ok") {
                  await child([
                    "--worker",
                    "verify",
                    "--module",
                    implementation,
                    "--output",
                    output,
                    ...caseArgs,
                  ]);
                  measurement.verification = "passed";
                }
                console.log(JSON.stringify(measurement));
                if (!values.keep) {
                  await Deno.remove(output).catch((error: unknown) => {
                    if (!(error instanceof Deno.errors.NotFound)) throw error;
                  });
                }
              }
            }
          }
          if (!values.keep) await Deno.remove(input);
        }
      }
    }
  } finally {
    if (!values.keep) await Deno.remove(directory, { recursive: true });
  }
}

async function child(args: string[]): Promise<string> {
  const result = await new Deno.Command(Deno.execPath(), {
    args: [
      "run",
      "--allow-read",
      "--allow-write",
      fileURLToPath(import.meta.url),
      ...args,
    ],
    stdout: "piped",
    stderr: "piped",
  }).output();
  const stderr = new TextDecoder().decode(result.stderr);
  if (!result.success) {
    throw new Error(`Profile worker failed (${result.code}): ${stderr}`);
  }
  if (stderr) console.error(stderr.trim());
  return new TextDecoder().decode(result.stdout);
}

async function runWorker(worker: string): Promise<void> {
  const path = values.module?.[0];
  if (path === undefined || values.input === undefined) {
    throw new TypeError("Worker requires --module and --input");
  }
  const module = await import(moduleUrl(path)) as SaveModule;
  const pattern = selected(values.patterns, patterns);
  const payloadBytes = payloadSize(values.sizes);
  const compressed =
    selected(values.compression, ["compressed", "uncompressed"]) ===
      "compressed";
  const objects = objectCount(pattern);
  if (worker === "generate") {
    const save = makeFixture(payloadBytes, pattern, compressed, objects);
    await Deno.writeFile(
      values.input,
      new Uint8Array(module.writeSaveGame(save)),
      { createNew: true },
    );
    return;
  }
  if (worker === "verify") {
    if (values.output === undefined) {
      throw new TypeError("Verification worker requires --output");
    }
    const expected = module.parseSaveGame(await Deno.readFile(values.input));
    modify(expected);
    const actual = module.parseSaveGame(await Deno.readFile(values.output));
    deepStrictEqual(
      actual,
      expected,
      "Profile output lost or changed save data",
    );
    return;
  }
  if (worker !== "measure" || values.output === undefined) {
    throw new TypeError("Measurement worker requires --output");
  }
  const mode = selected(values.mode, modes);
  const metadata = {
    module: moduleUrl(path),
    mode,
    pattern,
    compressed,
    payloadBytes,
    objects,
    iteration: naturalNumber(values.iteration ?? "1", "iteration", 1),
    deno: Deno.version.deno,
  };
  if (mode === "stream" && module.writeSaveGameStream === undefined) {
    console.log(
      JSON.stringify({
        ...metadata,
        status: "unsupported",
        reason: "Module has no writeSaveGameStream",
      }),
    );
    return;
  }

  const initialResources = resources();
  const rssMiB: Record<string, number> = {
    initial: Deno.memoryUsage().rss / MiB,
  };
  const start = performance.now();
  let input: Uint8Array | undefined = await Deno.readFile(values.input);
  const inputBytes = input.byteLength;
  const readDone = performance.now();
  rssMiB.afterRead = Deno.memoryUsage().rss / MiB;
  const save = module.parseSaveGame(input);
  input = undefined;
  const parseDone = performance.now();
  rssMiB.afterParse = Deno.memoryUsage().rss / MiB;
  modify(save);
  const modifyDone = performance.now();
  rssMiB.afterModify = Deno.memoryUsage().rss / MiB;

  let serialize: number | null = null;
  let write: number | null = null;
  if (mode === "sync") {
    const output = new Uint8Array(module.writeSaveGame(save));
    const serializeDone = performance.now();
    serialize = serializeDone - modifyDone;
    rssMiB.afterSerialize = Deno.memoryUsage().rss / MiB;
    await Deno.writeFile(values.output, output, { createNew: true });
    write = performance.now() - serializeDone;
  } else {
    await Deno.writeFile(values.output, module.writeSaveGameStream!(save), {
      createNew: true,
    });
  }
  const done = performance.now();
  rssMiB.afterWrite = Deno.memoryUsage().rss / MiB;
  const finalResources = resources();
  console.log(JSON.stringify({
    ...metadata,
    status: "ok",
    inputBytes,
    outputBytes: (await Deno.stat(values.output)).size,
    milliseconds: {
      read: readDone - start,
      parse: parseDone - readDone,
      modify: modifyDone - parseDone,
      serialize,
      write,
      serializeAndWrite: done - modifyDone,
      total: done - start,
    },
    rssMiB,
    initialMaxRssMiB: initialResources?.maxRSS === undefined
      ? null
      : initialResources.maxRSS / 1024,
    maxRssMiB: finalResources?.maxRSS === undefined
      ? null
      : finalResources.maxRSS / 1024,
    linuxPeakRssMiB: await linuxPeakRss(),
    userCpuMilliseconds: finalResources && initialResources
      ? (finalResources.userCPUTime - initialResources.userCPUTime) / 1000
      : null,
    systemCpuMilliseconds: finalResources && initialResources
      ? (finalResources.systemCPUTime - initialResources.systemCPUTime) / 1000
      : null,
  }));
}

function resources(): ReturnType<typeof resourceUsage> | null {
  try {
    return resourceUsage();
  } catch {
    return null;
  }
}

async function linuxPeakRss(): Promise<number | null> {
  if (Deno.build.os !== "linux") return null;
  try {
    const status = await Deno.readTextFile("/proc/self/status");
    const value = /^VmHWM:\s+(\d+) kB$/m.exec(status)?.[1];
    return value === undefined ? null : Number(value) / 1024;
  } catch {
    // Some platforms require unrestricted permissions for procfs. The portable
    // resourceUsage maxRSS measurement remains available without that access.
    return null;
  }
}

function makeFixture(
  bytes: number,
  pattern: Pattern,
  compressed: boolean,
  objects: number,
): SaveGame {
  const save = createSaveGame(compressed);
  const worldBytes = Math.floor(bytes * 3 / 16) * 4;
  save.world.streamed = [["terrain", payload(worldBytes, pattern)]];
  save.simData = payload(bytes - worldBytes, pattern).buffer;
  const base = save.gameObjects[0]?.gameObjects[0];
  if (base === undefined) {
    throw new Error("Fixture requires a base game object");
  }
  const gameObjects: GameObject[] = Array.from(
    { length: objects },
    (_, index) => ({
      ...base,
      position: { x: index % 256, y: Math.floor(index / 256), z: 0 },
      scale: { ...base.scale },
      behaviors: [{
        name: "Fixture.Behavior",
        templateData: { id: index, label: `Fixture object ${index}` },
        extraRaw: new Uint8Array([9, 8, 0, 255]).buffer,
      }],
    }),
  );
  save.gameObjects = [{ name: "FixturePrefab", gameObjects }];
  for (
    let index = 0;
    index < naturalNumber(values.templates, "templates");
    index++
  ) {
    save.templates.push({
      name: `Fixture.Unused${index}`,
      fields: [],
      properties: [],
    });
  }
  return save;
}

function payload(length: number, pattern: Pattern): Uint8Array<ArrayBuffer> {
  const data = new Uint8Array(length);
  if (pattern !== "random") {
    data.fill(42);
    return data;
  }
  const words = new Uint32Array(data.buffer, 0, Math.floor(length / 4));
  let seed = 0x12345678;
  for (let index = 0; index < words.length; index++) {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    words[index] = seed >>> 0;
  }
  return data;
}

function modify(save: SaveGame): void {
  save.settings.nextUniqueID += 1;
  const terrain = save.world.streamed[0]?.[1];
  if (terrain?.length) terrain[0] = (terrain[0] ?? 0) ^ 0xff;
  const sim = new Uint8Array(save.simData);
  if (sim.length) sim[0] = (sim[0] ?? 0) ^ 0xff;
  for (const group of save.gameObjects) {
    for (const object of group.gameObjects) object.scale.x *= 0.5;
  }
}
