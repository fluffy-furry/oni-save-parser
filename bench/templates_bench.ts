import { ArrayDataWriter } from "../src/binary-serializer/index.ts";
import { unparse } from "../src/parser/index.ts";
import { unparseByTemplate } from "../src/save-structure/type-templates/template-data-parser.ts";
import { createTemplateLookup } from "../src/save-structure/type-templates/template-lookup.ts";
import {
  SerializationTypeInfo as Type,
  type TypeTemplates,
} from "../src/save-structure/type-templates/index.ts";

const templates: TypeTemplates = Array.from({ length: 512 }, (_, index) => ({
  name: `Template${index}`,
  fields: [{ name: "value", type: { info: Type.Int32 } }],
  properties: [],
}));
const names = Array.from(
  { length: 4096 },
  (_, index) => `Template${index % 512}`,
);

Deno.bench({
  name: "4096 template lookups: linear baseline",
  group: "template lookup",
  baseline: true,
}, () => {
  for (const name of names) {
    if (!templates.find((template) => template.name === name)) {
      throw new Error("Missing template");
    }
  }
});
Deno.bench({
  name: "4096 template lookups: operation index including construction",
  group: "template lookup",
}, () => {
  const lookup = createTemplateLookup(templates);
  for (const name of names) {
    if (!lookup.get(name)) throw new Error("Missing template");
  }
});

const rootTemplate = {
  name: "Root",
  fields: [{
    name: "items",
    type: {
      info: Type.Array,
      subTypes: [{ info: Type.UserDefined, templateName: "Template511" }],
    },
  }],
  properties: [],
};
const serializationTemplates: TypeTemplates = [...templates, rootTemplate];
const value = {
  items: Array.from({ length: 500 }, (_, index) => ({ value: index })),
};

Deno.bench({
  name: "500 nested objects: linear template lookup",
  group: "template serialization",
  baseline: true,
}, () => {
  const writer = new ArrayDataWriter();
  unparse(writer, unparseByTemplate(serializationTemplates, "Root", value));
  if (writer.position === 0) throw new Error("Empty serialization");
});
Deno.bench({
  name: "500 nested objects: operation index including construction",
  group: "template serialization",
}, () => {
  const writer = new ArrayDataWriter();
  const lookup = createTemplateLookup(serializationTemplates);
  unparse(
    writer,
    unparseByTemplate(serializationTemplates, "Root", value, lookup),
  );
  if (writer.position === 0) throw new Error("Empty serialization");
});
