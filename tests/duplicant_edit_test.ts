import { deepStrictEqual, equal, ok } from "node:assert/strict";
import { inflateSync } from "node:zlib";
import {
  AIAttributeLevelsBehavior,
  AITraitsBehavior,
  type GameObject,
  getBehavior,
  getGameObjectGroup,
  parseSaveGame,
  type SaveGame,
  writeSaveGame,
  writeSaveGameStream,
} from "../src/index.ts";
import { ArrayDataReader } from "../src/binary-serializer/index.ts";
import { parse } from "../src/parser/index.ts";
import { parseHeader } from "../src/save-structure/header/parser.ts";
import { parseTemplates } from "../src/save-structure/type-templates/template-parser.ts";
import { createPopulatedSaveGame } from "./fixtures/populated_save.ts";

function editedFields(object: GameObject) {
  const attributes = getBehavior(object, AIAttributeLevelsBehavior);
  const traits = getBehavior(object, AITraitsBehavior);
  ok(attributes && traits);
  return { attributes: attributes.templateData, traits: traits.templateData };
}

function editDuplicants(save: SaveGame): void {
  const group = getGameObjectGroup(save.gameObjects, "Minion");
  ok(group);
  for (const object of group.gameObjects) {
    const { attributes, traits } = editedFields(object);
    for (const attribute of attributes.saveLoadLevels) {
      attribute.level = attribute.attributeId === "Athletics" ? 20 : 10;
    }
    if (!traits.TraitIds.includes("FrostProof")) {
      traits.TraitIds.push("FrostProof");
    }
  }
}

function behaviorPayloads(bytes: Uint8Array, name: string): Uint8Array[] {
  const reader = new ArrayDataReader(bytes);
  const header = parse(reader, parseHeader());
  parse(reader, parseTemplates());
  const body = header.isCompressed
    ? new Uint8Array(inflateSync(reader.viewAllBytes()))
    : reader.viewAllBytes();
  const encodedName = new TextEncoder().encode(name);
  const marker = new Uint8Array(4 + encodedName.length);
  new DataView(marker.buffer).setInt32(0, encodedName.length, true);
  marker.set(encodedName, 4);
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
  const payloads: Uint8Array[] = [];
  for (let offset = 0; offset <= body.length - marker.length - 4; offset++) {
    if (!marker.every((byte, index) => body[offset + index] === byte)) continue;
    const length = view.getInt32(offset + marker.length, true);
    const start = offset + marker.length + 4;
    ok(length >= 0 && start + length <= body.length);
    payloads.push(body.slice(start, start + length));
    offset = start + length - 1;
  }
  return payloads;
}

const originalAttributeBytes = Uint8Array.fromHex(
  "5e010000110000000f00000053706163654e617669676174696f6e0000803efcffffff0c000000436f6e737472756374696f6e0000403ffdffffff0700000044696767696e670000a03ffeffffff090000004d616368696e6572790000e03fffffffff090000004174686c65746963730000104000000000080000004c6561726e696e67000030400100000007000000436f6f6b696e67000050400200000006000000436172696e67000070400300000008000000537472656e677468000088400400000003000000417274000098400500000008000000426f74616e6973740000a840060000000800000052616e6368696e670000b840070000000b000000506f77657254696e6b65720000c840080000000a0000004661726d54696e6b65720000d8400900000008000000496d6d756e6974790000e8400a0000000b0000004c696665537570706f72740000f8400b00000006000000546f67676c65000004410c000000",
);
const editedAttributeBytes = Uint8Array.fromHex(
  "5e010000110000000f00000053706163654e617669676174696f6e0000803e0a0000000c000000436f6e737472756374696f6e0000403f0a0000000700000044696767696e670000a03f0a000000090000004d616368696e6572790000e03f0a000000090000004174686c65746963730000104014000000080000004c6561726e696e67000030400a00000007000000436f6f6b696e67000050400a00000006000000436172696e67000070400a00000008000000537472656e677468000088400a00000003000000417274000098400a00000008000000426f74616e6973740000a8400a0000000800000052616e6368696e670000b8400a0000000b000000506f77657254696e6b65720000c8400a0000000a0000004661726d54696e6b65720000d8400a00000008000000496d6d756e6974790000e8400a0000000b0000004c696665537570706f72740000f8400a00000006000000546f67676c65000004410a000000",
);
const editedTraitBytes = Uint8Array.fromHex(
  "2500000003000000040000004e6f6e650b000000466173744c6561726e65720a00000046726f737450726f6f66",
);
const expectedTraits = [
  ["None", "FastLearner", "FrostProof"],
  ["None", "FrostProof", "FrostProof"],
  ["FrostProof"],
  ["None", "Fixture.酸素🧪", "FrostProof"],
  ["None", "Fixture.Repeat", "Fixture.Repeat", "FrostProof"],
];

for (const compressed of [false, true]) {
  Deno.test(`populated duplicant edits preserve unrelated data and native bytes (${compressed})`, async () => {
    const original = createPopulatedSaveGame({ isCompressed: compressed });
    const input = new Uint8Array(writeSaveGame(original));
    const inputSnapshot = input.slice();
    deepStrictEqual(
      behaviorPayloads(input, AIAttributeLevelsBehavior)[0],
      originalAttributeBytes,
    );
    const edited = parseSaveGame(input);
    deepStrictEqual(edited, original);
    editDuplicants(edited);
    const expected = structuredClone(edited);
    editDuplicants(edited);
    deepStrictEqual(edited, expected);

    const interceptor = (instruction: unknown) => instruction;
    const outputs = [
      new Uint8Array(writeSaveGame(edited)),
      new Uint8Array(writeSaveGame(edited, interceptor)),
      new Uint8Array(
        await new Response(writeSaveGameStream(edited)).arrayBuffer(),
      ),
      new Uint8Array(
        await new Response(writeSaveGameStream(edited, { interceptor }))
          .arrayBuffer(),
      ),
    ];
    for (const bytes of outputs) {
      const attributePayloads = behaviorPayloads(
        bytes,
        AIAttributeLevelsBehavior,
      );
      equal(attributePayloads.length, 6);
      deepStrictEqual(attributePayloads[0], editedAttributeBytes);
      deepStrictEqual(attributePayloads[5], originalAttributeBytes);
      deepStrictEqual(
        behaviorPayloads(bytes, AITraitsBehavior)[0],
        editedTraitBytes,
      );
      const parsed = parseSaveGame(bytes);
      deepStrictEqual(parsed, expected);
      deepStrictEqual(parseSaveGame(bytes, interceptor), expected);
      const duplicants = getGameObjectGroup(parsed.gameObjects, "Minion");
      const originalDuplicants = getGameObjectGroup(
        original.gameObjects,
        "Minion",
      );
      ok(duplicants && originalDuplicants);
      equal(duplicants.gameObjects.length, 5);
      for (const [index, object] of duplicants.gameObjects.entries()) {
        const { attributes, traits } = editedFields(object);
        deepStrictEqual(attributes.saveLoadLevels.map((value) => value.level), [
          10,
          10,
          10,
          10,
          20,
          10,
          10,
          10,
          10,
          10,
          10,
          10,
          10,
          10,
          10,
          10,
          10,
        ]);
        deepStrictEqual(traits.TraitIds, expectedTraits[index]);
        const originalObject = originalDuplicants.gameObjects[index];
        ok(originalObject);
        const previous = editedFields(originalObject);
        attributes.saveLoadLevels.forEach((value, attributeIndex) => {
          const old = previous.attributes.saveLoadLevels[attributeIndex];
          ok(old);
          value.level = old.level;
        });
        traits.TraitIds = [...previous.traits.TraitIds];
      }
      deepStrictEqual(parsed, original);
    }
    deepStrictEqual(edited, expected);
    deepStrictEqual(input, inputSnapshot);
  });
}

Deno.test("populated schemas preserve nullable references and native collection prefixes", () => {
  const save = createPopulatedSaveGame({ isCompressed: false });
  const bytes = new Uint8Array(writeSaveGame(save));
  const resume = behaviorPayloads(bytes, "MinionResume");
  deepStrictEqual(
    resume[1]!.subarray(0, 24),
    Uint8Array.fromHex(
      "00000000ffffffff00000000000000000000000000000000",
    ),
  );
  for (const name of ["Accessorizer", "Klei.AI.Effects"]) {
    const payloads = behaviorPayloads(bytes, name);
    deepStrictEqual(
      payloads[1],
      Uint8Array.fromHex("000000000000000000000000ffffffff"),
    );
    deepStrictEqual(
      payloads[2],
      Uint8Array.fromHex("00000000ffffffff0000000000000000"),
    );
  }
  const priorities = behaviorPayloads(bytes, "ChoreConsumer");
  deepStrictEqual(
    priorities[0],
    Uint8Array.fromHex(
      "300000000300000004000000ffffffff04000000000000000400000005000000040000000000000004000000000000800400000000000000",
    ),
  );
  deepStrictEqual(priorities[1], Uint8Array.fromHex("00000000ffffffff"));
  deepStrictEqual(priorities[2], Uint8Array.fromHex("0000000000000000"));
  deepStrictEqual(parseSaveGame(bytes), save);
});

Deno.test("populated duplicant and attribute counts exceed one byte without losing duplicate IDs", () => {
  for (
    const options of [
      { duplicantCount: 257, attributeCount: 17 },
      { duplicantCount: 2, attributeCount: 257 },
    ]
  ) {
    const original = createPopulatedSaveGame({
      isCompressed: false,
      ...options,
    });
    editDuplicants(original);
    const bytes = new Uint8Array(writeSaveGame(original));
    const parsed = parseSaveGame(bytes);
    deepStrictEqual(parsed, original);
    const duplicants = getGameObjectGroup(parsed.gameObjects, "Minion");
    ok(duplicants);
    equal(duplicants.gameObjects.length, options.duplicantCount);
    equal(parsed.header.gameInfo.numberOfDuplicants, options.duplicantCount);
    const payloads = behaviorPayloads(bytes, AIAttributeLevelsBehavior);
    equal(payloads.length, options.duplicantCount + 1);
    const first = payloads[0]!;
    const view = new DataView(first.buffer, first.byteOffset, first.byteLength);
    equal(view.getInt32(4, true), options.attributeCount);
    equal(view.getInt32(0, true), options.attributeCount === 17 ? 350 : 5301);
    for (const object of duplicants.gameObjects) {
      const { attributes } = editedFields(object);
      equal(attributes.saveLoadLevels.length, options.attributeCount);
      equal(
        attributes.saveLoadLevels.filter((item) =>
          item.attributeId === "Athletics"
        ).length,
        options.attributeCount === 17 ? 1 : 15,
      );
      equal(
        attributes.saveLoadLevels.filter((item) => item.level === 20).length,
        options.attributeCount === 17 ? 1 : 15,
      );
    }
  }
});
