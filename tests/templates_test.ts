import { deepStrictEqual, equal, ok, throws } from "node:assert/strict";
import {
  ArrayDataReader,
  ArrayDataWriter,
} from "../src/binary-serializer/index.ts";
import { parse, unparse, type UnparseIterator } from "../src/parser/index.ts";
import { parseSaveGame, writeSaveGame } from "../src/index.ts";
import {
  parseByTemplate,
  unparseByTemplate,
} from "../src/save-structure/type-templates/template-data-parser.ts";
import { createTemplateLookup } from "../src/save-structure/type-templates/template-lookup.ts";
import { parseTemplates } from "../src/save-structure/type-templates/template-parser.ts";
import {
  parseByType,
  unparseByType,
} from "../src/save-structure/type-templates/type-data-parser.ts";
import {
  parseTypeInfo,
  unparseTypeInfo,
} from "../src/save-structure/type-templates/type-info-parser.ts";
import {
  SerializationTypeInfo as Type,
  type TypeInfo,
  type TypeTemplates,
} from "../src/save-structure/type-templates/index.ts";
import { createSaveGame } from "./fixtures/save_game.ts";

const int: TypeInfo = { info: Type.Int32 };
const array: TypeInfo = { info: Type.Array, subTypes: [int] };
const dictionary: TypeInfo = {
  info: Type.Dictionary | Type.IS_GENERIC_TYPE,
  subTypes: [int, int],
};

function write(generator: UnparseIterator): ArrayBuffer {
  const writer = new ArrayDataWriter();
  unparse(writer, generator);
  return writer.getBytes();
}

function words(...values: number[]): ArrayBuffer {
  const writer = new ArrayDataWriter();
  for (const value of values) writer.writeInt32(value);
  return writer.getBytes();
}

Deno.test("template fields named __proto__, constructor and prototype remain own data", () => {
  const templates: TypeTemplates = [{
    name: "Root",
    fields: [{
      name: "__proto__",
      type: { info: Type.UserDefined, templateName: "Payload" },
    }, { name: "constructor", type: { info: Type.String } }],
    properties: [{ name: "prototype", type: int }],
  }, {
    name: "Payload",
    fields: [{ name: "polluted", type: { info: Type.Boolean } }],
    properties: [],
  }];
  const value = {
    ["__proto__"]: { polluted: true },
    constructor: "data",
    prototype: 12,
  };
  const bytes = write(unparseByTemplate(templates, "Root", value));
  const result = parse(
    new ArrayDataReader(bytes),
    parseByTemplate<Record<string, unknown>>(templates, "Root"),
  );
  equal(Object.getPrototypeOf(result), Object.prototype);
  equal(Object.hasOwn(result, "__proto__"), true);
  equal(Reflect.get(Object.prototype, "polluted"), undefined);
  deepStrictEqual(result, value);
  deepStrictEqual(write(unparseByTemplate(templates, "Root", result)), bytes);
});

Deno.test("direct template helpers observe array replacement and renaming", () => {
  const templates: TypeTemplates = [{
    name: "Before",
    fields: [{ name: "x", type: int }],
    properties: [],
  }];
  deepStrictEqual(
    parse(new ArrayDataReader(words(3)), parseByTemplate(templates, "Before")),
    { x: 3 },
  );
  templates[0] = {
    name: "After",
    fields: [{ name: "y", type: int }],
    properties: [],
  };
  throws(
    () =>
      parse(
        new ArrayDataReader(words(3)),
        parseByTemplate(templates, "Before"),
      ),
    /not found/,
  );
  deepStrictEqual(
    parse(new ArrayDataReader(words(4)), parseByTemplate(templates, "After")),
    { y: 4 },
  );
  deepStrictEqual(
    write(unparseByTemplate(templates, "After", { y: 7 })),
    words(7),
  );
});

Deno.test("operation lookup preserves the first duplicate declaration", () => {
  const templates: TypeTemplates = [
    {
      name: "Duplicate",
      fields: [{ name: "first", type: int }],
      properties: [],
    },
    {
      name: "Duplicate",
      fields: [{ name: "second", type: int }],
      properties: [],
    },
  ];
  const lookup = createTemplateLookup(templates);
  deepStrictEqual(
    parse(
      new ArrayDataReader(words(5)),
      parseByTemplate(templates, "Duplicate", lookup),
    ),
    { first: 5 },
  );
  deepStrictEqual(
    write(unparseByTemplate(templates, "Duplicate", { first: 6 }, lookup)),
    words(6),
  );
});

Deno.test("save operations rebuild template lookup after public template edits", () => {
  const save = createSaveGame();
  deepStrictEqual(parseSaveGame(writeSaveGame(save)), save);
  const template = save.templates.find((item) =>
    item.name === "Fixture.Behavior"
  );
  const behavior = save.gameObjects[0]?.gameObjects[0]?.behaviors[0];
  ok(template && behavior);
  template.name = "Renamed.Behavior";
  behavior.name = template.name;
  deepStrictEqual(parseSaveGame(writeSaveGame(save)), save);
});

Deno.test("intercepted save writes observe template mutations during the operation", () => {
  const save = createSaveGame();
  const template = save.templates.find((item) => item.name === "Game+Settings");
  ok(template);
  throws(() =>
    writeSaveGame(save, (instruction) => {
      if (
        typeof instruction === "object" && instruction !== null &&
        "dataType" in instruction && instruction.dataType === "klei-string" &&
        "value" in instruction && instruction.value === "world"
      ) {
        template.name = "RemovedDuringWrite";
      }
      return instruction;
    }), /Template "Game\+Settings" not found/);
});

Deno.test("template counts reject negative values before allocating", () => {
  throws(
    () => parse(new ArrayDataReader(words(-1)), parseTemplates()),
    /Invalid template count/,
  );
  for (const [fieldCount, propertyCount] of [[-1, 0], [0, -1]] as const) {
    const writer = new ArrayDataWriter();
    writer.writeInt32(1);
    writer.writeKleiString("Root");
    writer.writeInt32(fieldCount);
    writer.writeInt32(propertyCount);
    throws(
      () => parse(new ArrayDataReader(writer.getBytes()), parseTemplates()),
      /Invalid (field|property) count/,
    );
  }
});

Deno.test("collections reject malformed counts and truncated huge counts", () => {
  for (const info of [array, dictionary]) {
    throws(
      () => parse(new ArrayDataReader(words(4, -2)), parseByType(info, [])),
      /Invalid .* element count/,
    );
    equal(
      parse(new ArrayDataReader(words(4, -1)), parseByType(info, [])),
      null,
    );
    throws(
      () =>
        parse(new ArrayDataReader(words(0, 0x7fffffff)), parseByType(info, [])),
      /Buffer length exceeded/,
    );
  }
});

Deno.test("legacy negative advisory collection lengths remain supported", () => {
  deepStrictEqual(
    parse(new ArrayDataReader(words(-4, 0)), parseByType(array, [])),
    [],
  );
  deepStrictEqual(
    parse(new ArrayDataReader(words(-4, 0)), parseByType(dictionary, [])),
    [],
  );
});

Deno.test("malformed subtypes and unknown type codes produce clear errors", () => {
  throws(
    () => write(unparseTypeInfo({ info: Type.Array, subTypes: [] })),
    /requires 1 subtype/,
  );
  throws(
    () =>
      write(
        unparseTypeInfo({
          info: Type.Dictionary | Type.IS_GENERIC_TYPE,
          subTypes: [int],
        }),
      ),
    /requires 2 subtypes/,
  );
  throws(
    () => parse(new ArrayDataReader(new Uint8Array([255])), parseTypeInfo()),
    /Unsupported/,
  );
  throws(
    () =>
      parse(
        new ArrayDataReader(
          new Uint8Array([Type.Dictionary | Type.IS_GENERIC_TYPE, 0]),
        ),
        parseTypeInfo(),
      ),
    /requires 2 subtypes/,
  );
  throws(
    () => parseByType({ info: Type.Array }, []).next(),
    /requires subtype 1/,
  );
});

Deno.test("user-defined object lengths reject malformed null and size values", () => {
  const info: TypeInfo = { info: Type.UserDefined, templateName: "Root" };
  const templates: TypeTemplates = [{
    name: "Root",
    fields: [{ name: "x", type: int }],
    properties: [],
  }];
  equal(
    parse(new ArrayDataReader(words(-1)), parseByType(info, templates)),
    null,
  );
  throws(
    () => parse(new ArrayDataReader(words(-2)), parseByType(info, templates)),
    /Invalid object data length/,
  );
  throws(
    () =>
      parse(new ArrayDataReader(words(0, 123)), parseByType(info, templates)),
    /more than expected/,
  );
});

Deno.test("dynamic template writes reject values that cannot represent the declared type", () => {
  throws(() => write(unparseByType("42", int, [])), /numeric template value/);
  throws(() => write(unparseByType({ length: 1 }, array, [])), /array value/);
  throws(() => write(unparseByType([[1]], dictionary, [])), /key\/value pairs/);
  throws(
    () => write(unparseByType({ x: 1 }, { info: Type.Vector2 }, [])),
    /numeric template value/,
  );
});
