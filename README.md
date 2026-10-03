# oni-save-parser

Read and write
[Oxygen Not Included](https://www.klei.com/games/oxygen-not-included) save files
with Deno and TypeScript.

Use the **latest stable Deno**. This project uses Deno's bundled TypeScript
compiler, formatter, linter, test runner, and benchmark runner. There are no
third-party runtime or development packages to install.

## Quick start

[Install Deno](https://docs.deno.com/runtime/getting_started/installation/), or
run `deno upgrade` to update an existing installation. CI follows the latest
stable release; there is no pinned Deno or TypeScript version.

```sh
deno task verify
```

Import the TypeScript entry point directly from your checkout:

```ts
import {
  AIAttributeLevelsBehavior,
  getBehavior,
  parseSaveGame,
  writeSaveGame,
} from "./src/index.ts";

const save = parseSaveGame(await Deno.readFile("colony.sav"));
const minions = save.gameObjects.find((group) => group.name === "Minion");

for (const minion of minions?.gameObjects ?? []) {
  minion.scale.x = 0.5;
  minion.scale.y = 0.5;

  const attributes = getBehavior(minion, AIAttributeLevelsBehavior);
  for (const attribute of attributes?.templateData.saveLoadLevels ?? []) {
    attribute.level = 10;
  }
}

await Deno.writeFile("colony-edited.sav", new Uint8Array(writeSaveGame(save)), {
  createNew: true,
});
```

Run a script containing this example with
`deno run --allow-read --allow-write example.ts`. The library itself needs no
permissions; reading and writing files belongs to the caller.

## API

- `parseSaveGame(data, options?): SaveGame` accepts an `ArrayBuffer` or any
  `ArrayBufferView`, including `Uint8Array`, `DataView`, and Node buffers. View
  offsets and lengths are respected. Pass a view directly instead of its
  potentially larger `.buffer`.
- `writeSaveGame(save, interceptor?): ArrayBuffer` writes a save synchronously.
- `writeSaveGameStream(save, options?): ReadableStream<Uint8Array>` serializes
  into chunks and uses native streaming compression when needed. Options accept
  `interceptor` and `copyBuffers` (default `false`).
- `ParseOptions` accepts `interceptor` and `versionStrictness` (`"minor"`, the
  default; `"major"`; or `"none"`). The legacy second-argument interceptor
  overload remains supported. Optional `maxDecompressedBytes` limits the
  inflated body through native zlib; it must be a positive safe integer.
- `progressReporter(callback)` and `tagReporter(onStart, onEnd?)` create
  instruction interceptors. Compose them with ordinary function calls, returning
  each instruction to the parser.
- `ParseError` exposes `dataOffset`, a native `cause`, and an optional error
  `code`. Offsets inside compressed content refer to the decompressed stream.

All model types are exported from `src/index.ts`. The lossless, JSON-compatible
64-bit `LongNum` representation remains `{ unsigned, lower, upper }`; integers
are never coerced into imprecise JavaScript numbers.

## Human-readable values

Saved IDs and numbers often differ from the game's labels and displayed values.
Use `getDisplayInfo(kind, id)` to describe an identifier without changing it:

```ts
import { getDisplayInfo, kelvinToCelsius } from "./src/index.ts";

const attribute = getDisplayInfo("attribute", "Digging");
console.log(attribute.label);
console.log(attribute.rawId);
console.log(getDisplayInfo("skill", "Mining1").label);
console.log(kelvinToCelsius(300));
```

Supported kinds are `element`, `prefab`, `attribute`, `skill`, `skillGroup`,
`trait`, `geyser`, `disease`, and `healthState`. String inputs are internal IDs,
not human labels. The result preserves `rawId`; `internalId` contains the
internal name when supplied or resolved, or `null` for unresolved numeric IDs.
`labelSource` is `"english"`, `"internal"`, or `"unknown"`. Internal fallbacks
are not verified translations or proof that an ID is recognized. Unknown IDs and
hashes remain visible through fallback labels. Keep the original identifiers in
data passed to a save writer.

The `disease` kind describes germ contamination identifiers, not active sickness
records. `healthState` describes injury severity, not hit points: both `Perfect`
and `Alright` have the injury label "None". Labels are not unique identifiers.

English labels were checked against the installed game's localization and
runtime metadata (Steam build 24423041). This is display metadata, not a claim
of support for that game's save format. Labels can differ by game version,
language, DLC, or mods; unknown identifiers still round-trip unchanged.

Unit conversions are explicit and do not modify the save:

| Saved/display units            | Helpers                                                                       |
| ------------------------------ | ----------------------------------------------------------------------------- |
| Kelvin ↔ Celsius               | `kelvinToCelsius`, `celsiusToKelvin`                                          |
| Kelvin ↔ Fahrenheit            | `kelvinToFahrenheit`, `fahrenheitToKelvin`                                    |
| Calories ↔ kilocalories        | `caloriesToKilocalories`, `kilocaloriesToCalories`                            |
| Seconds ↔ cycles (600 seconds) | `secondsToCycles`, `cyclesToSeconds`                                          |
| Object units ↔ kilograms       | `unitsToKilograms(units, massPerUnit)`, `kilogramsToUnits(mass, massPerUnit)` |

Temperature helpers convert absolute temperatures, not temperature differences.
Cycle helpers convert elapsed durations, not the one-based cycle number in the
UI. Mass conversion needs the object's kilograms per unit; a field named `units`
does not by itself establish its mass. Percentages need their reference values,
too: hit points are not a health percentage without maximum health.

Geyser `*Roll` fields are generation inputs, not rates, durations, or
percentages. Calculating output requires the game's nonlinear mapping,
type-specific bounds, and applicable modifiers. Output while erupting differs
from average output including dormancy. The geyser object's `ElementID`
describes its own material, not the material it emits.

Duplicants have several separate progression systems:

- `AttributeLevels.saveLoadLevels` stores trained attribute levels and progress
  toward each attribute's next level. Displayed totals also include modifiers
  from traits, effects, equipment, and skills. Setting `level = 10`, as in the
  example above, does not guarantee a displayed total of 10.
- `MinionResume.MasteryBySkillID` stores skill-tree mastery flags. Purchased and
  game-granted skills can have different skill-point and morale accounting;
  mastery alone does not describe every capability.
- `MinionResume.AptitudeBySkillGroup` stores interests by hashed skill group,
  rather than attribute levels or individual skill IDs. For example, the Mining
  group, the `Mining1` skill, and the `Digging` attribute are distinct concepts.
- `MinionResume.totalExperienceGained` is cumulative skill-point progression XP,
  separate from per-attribute XP. Available points, experience to the next
  point, and morale need require the applicable game's rules and character
  context.

## Save compatibility

The implemented save format is **7.31**. Modernizing the runtime does not add
support for later game formats. Unknown versions are rejected by default;
relaxing `versionStrictness` does not make an unsupported format compatible.

The parser preserves unknown behavior payloads and opaque world/simulation
bytes. It cannot construct a playable world from scratch. Some game object data
remains undecoded. The automated suite uses deterministic synthetic saves; a
current game save corpus is not included.

## Development

```sh
deno task check       # Strict TypeScript checking
deno task test        # Tests, without filesystem or network permissions
deno task lint
deno task fmt
deno task verify      # Formatting, lint, type checking, and tests
deno task bench       # Binary, template, and whole-save benchmarks
deno task coverage    # Tests with coverage reporting
```

To verify one of your saves, the round-trip tool reads, writes, and reparses it,
then compares the full structure, including opaque binary payloads:

```sh
deno task roundtrip colony.sav
deno task roundtrip colony.sav --output colony-copy.sav --progress --progress-tags
```

The default output is `colony-writeback.sav`. Existing output files are never
overwritten. Save files can be kept under the ignored `test-data/` directory.

## Dependency maintenance audit

The migration **replaced or removed all npm dependencies**, including
development tools and `@types` packages. There are no npm or JSR libraries left
to upgrade. Imports such as `node:zlib`, `node:buffer`, `node:util`, and
`node:assert/strict` use modules supplied by Deno.

The October 2, 2026 audit verified the latest stable release as
[Deno 2.9.7](https://github.com/denoland/deno/releases/tag/v2.9.7), with its
bundled TypeScript 6.0.3 compiler. This is the tested environment, not a version
pin. The standalone
[TypeScript 7.0.2 release](https://github.com/microsoft/TypeScript/releases/tag/v7.0.2)
is newer; this project deliberately uses the compiler shipped with Deno. CI
follows the latest stable Deno and uses the current
[checkout 7.0.1](https://github.com/actions/checkout/releases/tag/v7.0.1) and
[setup-deno 2.0.5](https://github.com/denoland/setup-deno/releases/tag/v2.0.5)
actions. Dependabot checks for action updates monthly.

The removed dependencies had different maintenance situations:

| Removed dependency           | Verified upstream status                                                                                                                                                              | Replacement                                 |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `text-encoding`              | [Archived since 2018](https://github.com/inexorabletash/text-encoding); npm marks it unmaintained                                                                                     | Native text encoding APIs                   |
| `deep-diff`                  | [npm marks it unsupported](https://registry.npmjs.org/deep-diff/1.0.2)                                                                                                                | Built-in strict assertions                  |
| `lodash.flowright`           | [Standalone method packages are discouraged](https://lodash.com/per-method-packages); main Lodash remains maintained                                                                  | Ordinary function composition               |
| `rimraf@2.6.2`               | [This old major is unsupported](https://registry.npmjs.org/rimraf/2.6.2); current rimraf is maintained                                                                                | Generated build cleanup is no longer needed |
| `@types/long`, `@types/pako` | Current releases are deprecated stubs because [long](https://registry.npmjs.org/%40types%2Flong/5.0.0) and [pako](https://registry.npmjs.org/%40types%2Fpako/3.0.0) now provide types | Both underlying dependencies were removed   |

The other removed packages (`jsonschema`, `long`, `pako`, `minimist`,
`prettier`, and standalone `typescript`) were replaced because the Deno
implementation no longer needs them. An old release date alone does not
establish that a project is abandoned.

## Implementation and migration

This is a Deno-first ES module library. The old npm/CommonJS build, generated
`lib/` and `dts/` trees, and standalone TypeScript/Prettier/rimraf toolchain
have been removed. Import the `.ts` entry point instead of using `require()`.

- Native `TextEncoder` / `TextDecoder` replace `text-encoding`.
- Built-in `node:zlib` replaces `pako` and keeps the synchronous API. Browser
  bundling now requires a separate compression adapter; direct browser support
  is no longer provided. Web `CompressionStream` is asynchronous and cannot
  replace the existing synchronous contract directly; the new stream API uses
  it.
- Focused native header validation replaces `jsonschema`, preserving its
  existing shallow validation and open game metadata.
- Unused `long` and its types are removed. The manual test tool uses Deno file
  APIs and built-in argument parsing/assertions instead of `minimist`,
  `lodash.flowright`, and `deep-diff`.
- `ParseError.cause` is now the original thrown value, following the standard
  `Error` API. Replace old `error.cause()` calls with `error.cause`.
- Unknown template payloads and interceptor arguments now require type
  narrowing. Exported metadata lists use readonly tuple types; copy them before
  extending a list locally. The parsed save data remains editable.

Save writers use chunked storage, avoiding repeated copies as the save grows.
Large opaque blocks are borrowed for the duration of synchronous serialization;
intercepted writes copy them to preserve callback mutation semantics. Readers
decode UTF-8 from views and pass compressed bytes directly to zlib. Retained
binary fields are copied so editing a parsed save does not modify its input.

The generator-based parser remains inspectable through progress/tag
interceptors. Dynamic template payloads use `unknown`; known behavior names
carry their model through a typed symbol so `getBehavior` infers the correct
shape. The only remaining `any` types are two documented generator-response
boundaries, where TypeScript cannot relate each yielded instruction to its
particular response. The `no-explicit-any` lint rule is enabled everywhere else.

Type checking also enforces checked indexed access, exact optional properties,
explicit overrides, and switch fallthrough checks. Tagged parsers preserve their
full argument tuple and return type. Tests cover original-writer golden files,
seeded binary fuzz cases, unusual template names, and template mutation between
operations.

Template indexes and compiled codecs live for a single operation. Supported
schemas compile to closures once, removing nested generator dispatch from every
field of every object. No generated JavaScript or `eval` is involved.
Interceptors retain the original instruction sequence and live template lookups
on writes. UTF-8 strings encode directly into writer capacity with
`TextEncoder.encodeInto`; native byte-length calculation is used only when more
capacity may be needed.

The load/save contract preserves field and tuple ordering. Compressed files can
have different zlib bytes while representing the same uncompressed data.

## Large saves and performance

The complete path is file read → header/schema parse → body inflation → object
decode and retained-byte copies → edits → encode → compression → file write. For
object-heavy saves, compiled field codecs eliminate repeated schema
interpretation; template-name lookup is constant-time after a linear indexing
pass. Compilation is proportional to schema size, and decoding/encoding remain
proportional to the values and bytes processed. Editing selected objects need
not copy the entire save.

For large opaque payloads, chunked writers keep scalar pages and binary blocks
separate. The synchronous API still assembles the uncompressed body for zlib and
returns a contiguous final buffer. The stream API avoids both assemblies and
feeds at most 64 KiB per input chunk to `CompressionStream`, respecting consumer
backpressure. Length backpatches are resolved before output starts.

The format stores the body as one zlib stream, so even a small edit requires
recompressing that body. Incompressible payloads therefore remain dominated by
compression CPU time. Streaming mainly reduces their memory overhead. Saves with
`header.isCompressed = false` skip compression entirely.

```ts
import { parseSaveGame, writeSaveGameStream } from "./src/index.ts";

const save = parseSaveGame(await Deno.readFile("colony.sav"), {
  maxDecompressedBytes: 512 * 1024 * 1024,
});
save.settings.nextUniqueID += 1;
await Deno.writeFile("colony-edited.sav", writeSaveGameStream(save), {
  createNew: true,
});
```

Keep binary payloads unchanged until the output stream completes. Use
`writeSaveGameStream(save, { copyBuffers: true })` to snapshot them instead, at
the cost of additional memory. Metadata is serialized synchronously when the
stream is created. Stream cancellation and source/sink errors release the
remaining chunks and compression readers.

Loading is still eager: peak memory can include the input file, inflated body,
retained binary copies, and decoded objects. Streaming output does **not** make
loading constant-memory. `maxDecompressedBytes` limits inflation, not the number
of decoded objects or total heap; arrays of zero-byte structs can consume much
more heap than their wire size. Isolate untrusted inputs in a process with a
memory limit. Individual length-prefixed blocks must fit the format's signed
32-bit lengths; overflowing output lengths are rejected.

Run the complete pipeline profiler with fresh processes and verification:

```sh
deno task profile --sizes 8,64,256 --patterns compressible,random --compression compressed
deno task profile --sizes 64 --patterns object-heavy --objects 50000 --compression uncompressed
```

It reports stage timings and peak RSS as JSON Lines. Fixture generation and full
output verification run in separate processes, outside measured time and memory.
`--module` may be repeated to compare local implementations against identical
input. Disk timing covers operating-system writes, without `fsync`. Run
`deno task bench` for smaller binary, template and whole-save benchmarks.
