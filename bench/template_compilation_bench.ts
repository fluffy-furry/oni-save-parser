import {
  ArrayDataReader,
  ArrayDataWriter,
} from "../src/binary-serializer/index.ts";
import { parse, unparse } from "../src/parser/index.ts";
import { createCompiledTemplates } from "../src/save-structure/type-templates/compiled-templates.ts";
import { createTemplateLookup } from "../src/save-structure/type-templates/template-lookup.ts";
import {
  parseByTemplate,
  unparseByTemplate,
} from "../src/save-structure/type-templates/template-data-parser.ts";
import {
  SerializationTypeInfo as Type,
  type TypeInfo,
  type TypeTemplates,
} from "../src/save-structure/type-templates/index.ts";

const int: TypeInfo = { info: Type.Int32 };
const templates: TypeTemplates = Array.from({ length: 512 }, (_, index) => ({
  name: `Unused${index}`,
  fields: [{ name: "id", type: int }],
  properties: [],
}));
templates.push({
  name: "Element",
  fields: [
    { name: "id", type: int },
    { name: "label", type: { info: Type.String } },
    { name: "position", type: { info: Type.Vector3 } },
    { name: "active", type: { info: Type.Boolean } },
    {
      name: "values",
      type: { info: Type.List | Type.IS_GENERIC_TYPE, subTypes: [int] },
    },
  ],
  properties: [],
}, {
  name: "Root",
  fields: [{
    name: "items",
    type: {
      info: Type.Array,
      subTypes: [{ info: Type.UserDefined, templateName: "Element" }],
    },
  }],
  properties: [],
});
const model = {
  items: Array.from({ length: 2048 }, (_, id) => ({
    id,
    label: `Duplicant ${id}: 保存`,
    position: { x: id, y: 1.5, z: -2 },
    active: true,
    values: [1, 2, 3, 4],
  })),
};
type Model = typeof model;
const initial = new ArrayDataWriter();
unparse(initial, unparseByTemplate(templates, "Root", model));
const bytes = initial.getBytesView();

for (const compiled of [false, true]) {
  const label = compiled ? "compiled closures" : "indexed generators";
  Deno.bench({
    name: `2048 objects read: ${label}`,
    group: "template read",
    baseline: !compiled,
  }, () => {
    const reader = new ArrayDataReader(bytes);
    const lookup = createTemplateLookup(templates);
    const codecs = compiled ? createCompiledTemplates(templates) : undefined;
    parse(reader, parseByTemplate(templates, "Root", lookup, codecs));
    if (reader.position !== bytes.byteLength) {
      throw new Error("Incomplete read");
    }
  });
  Deno.bench({
    name: `2048 objects write: ${label}`,
    group: "template write",
    baseline: !compiled,
  }, () => {
    const writer = new ArrayDataWriter();
    const lookup = createTemplateLookup(templates);
    const codecs = compiled ? createCompiledTemplates(templates) : undefined;
    unparse(
      writer,
      unparseByTemplate(templates, "Root", model, lookup, codecs),
    );
    if (writer.position !== bytes.byteLength) {
      throw new Error("Incomplete write");
    }
  });
  Deno.bench({
    name: `2048 objects load-modify-write: ${label}`,
    group: "template edit cycle",
    baseline: !compiled,
  }, () => {
    const readLookup = createTemplateLookup(templates);
    const readCodecs = compiled
      ? createCompiledTemplates(templates)
      : undefined;
    const value = parse(
      new ArrayDataReader(bytes),
      parseByTemplate<Model>(templates, "Root", readLookup, readCodecs),
    );
    const first = value.items[0];
    if (first) first.id++;
    // Independent operations each pay index/compiler setup cost.
    const writeLookup = createTemplateLookup(templates);
    const writeCodecs = compiled
      ? createCompiledTemplates(templates)
      : undefined;
    const writer = new ArrayDataWriter();
    unparse(
      writer,
      unparseByTemplate(templates, "Root", value, writeLookup, writeCodecs),
    );
    if (writer.position !== bytes.byteLength) {
      throw new Error("Incomplete write");
    }
  });
}
