# oni-save-parser

This library parses and writes save data from
[Oxygen Not Included](https://www.klei.com/games/oxygen-not-included). It is
written in TypeScript and runs on the latest stable Deno, with no external
dependencies.

This is a utility library for editing saves. For a save editor, see
[Duplicity](https://github.com/RoboPhred/oni-duplicity).

## Game Compatibility

The parser accepts save versions **7.28, 7.31, 7.33, 7.34, 7.37, and 7.38**.
Writing a save preserves its version. Unknown versions are rejected by default.

In-game testing covers one edited 7.38 save with Spaced Out! and The Frosty
Planet Pack. Older formats have been checked against sample saves for round-trip
preservation. Other DLC combinations have not been tested in-game.

## API

- `parseSaveGame(data, options?): SaveGame` Parses an `ArrayBuffer` or
  typed-array view. Pass file bytes directly, rather than their `.buffer`, to
  preserve view offsets.
- `writeSaveGame(save, interceptor?): ArrayBuffer` Writes a save game object
  into an array buffer.
- `writeSaveGameStream(save, options?): ReadableStream<Uint8Array>` Writes a
  save in chunks with streaming compression.
- `getBehavior(object, behaviorName)` Gets a behavior with its corresponding
  TypeScript type.
- `getDisplayInfo(kind, id)` Resolves saved identifiers to English labels, with
  fallbacks for unknown IDs.

Types and helpers are exported from `src/index.ts`. Parse options include
`interceptor`, `versionStrictness`, and `maxDecompressedBytes`.
`progressReporter` and `tagReporter` provide progress interceptors.

## Example usage

Import the entry point from your checkout. Run this example with
`deno run --allow-read --allow-write example.ts`.

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
  const attributes = getBehavior(minion, AIAttributeLevelsBehavior);
  for (const attribute of attributes?.templateData.saveLoadLevels ?? []) {
    attribute.level = 10;
  }
}

await Deno.writeFile("colony-edited.sav", new Uint8Array(writeSaveGame(save)), {
  createNew: true,
});
```

Attribute levels are trained levels. Displayed totals also include trait, skill,
and equipment modifiers. Skill points, mastery, and interests are stored
separately.

## Display values

Keep raw identifiers when writing saves; display labels are for presentation.
Helpers such as `kelvinToCelsius`, `caloriesToKilocalories`, and
`secondsToCycles` convert saved units. Mass conversion requires the object's
kilograms per unit.

Geyser roll values are generation inputs and need the game's formulas to
calculate output. Health state describes injury severity; hit points alone do
not give a health percentage.

## Design Philosophy

### Idempotent load-save cycle

Loading and writing an unchanged save should preserve its uncompressed content.
Compressed bytes may differ. Dictionaries use arrays of key-value tuples to
preserve ordering and duplicate keys.

Unknown behavior data and world simulation bytes are preserved as-is. The
library cannot create a playable world from scratch.

### Large saves

Parsing loads the full save into memory. `maxDecompressedBytes` limits the
inflated body, not total memory usage.

Use `writeSaveGameStream` to reduce output buffering. Keep binary payloads
unchanged until the stream finishes, or pass `{ copyBuffers: true }` to copy
them when creating the stream.

## Development

```sh
deno task verify
deno task coverage
deno task bench
deno task roundtrip colony.sav --output colony-copy.sav
deno task profile --sizes 8,64,256
```

`verify` runs formatting, lint, strict type checking, and tests. The round-trip
tool compares the written save with its input and never overwrites an existing
output file. Keep local saves and reports in the ignored `test-data/` and
`bench/results/` directories.
