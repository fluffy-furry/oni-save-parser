import { validateDotNetIdentifierName } from "../../../../../utils.ts";

import {
  getReaderPosition,
  type ParseIterator,
  readInt32,
  readKleiString,
  type UnparseIterator,
  writeDataLengthBegin,
  writeDataLengthEnd,
  writeInt32,
  writeKleiString,
} from "../../../../../parser/index.ts";

import type {
  TemplateParser,
  TemplateUnparser,
} from "../../../../type-templates/template-data-parser.ts";
import { validateCollectionCount } from "../../../../collection-count.ts";

import type {
  AIAmountInstance,
  AISicknessInstance,
  MinionModificationInstance,
  MinionModifiersExtraData,
} from "./minion-modifiers.ts";

export function* parseMinionModifiersExtraData(
  templateParser: TemplateParser,
): ParseIterator<MinionModifiersExtraData> {
  const amounts: AIAmountInstance[] = yield* parseModifiers<AIAmountInstance>(
    "Klei.AI.AmountInstance",
    templateParser,
  );
  const sicknesses: AISicknessInstance[] = yield* parseModifiers<
    AISicknessInstance
  >("Klei.AI.SicknessInstance", templateParser);

  const extraData: MinionModifiersExtraData = {
    amounts,
    sicknesses,
  };
  return extraData;
}

export function* unparseMinionModifiersExtraData(
  extraData: MinionModifiersExtraData,
  templateUnparser: TemplateUnparser,
): UnparseIterator {
  yield* unparseModifiers<AIAmountInstance>(
    extraData.amounts,
    "Klei.AI.AmountInstance",
    templateUnparser,
  );
  yield* unparseModifiers<AISicknessInstance>(
    extraData.sicknesses,
    "Klei.AI.SicknessInstance",
    templateUnparser,
  );
}

function* parseModifiers<T extends MinionModificationInstance>(
  modifierInstanceType: string,
  templateParser: TemplateParser,
): ParseIterator<T[]> {
  const count = validateCollectionCount(
    yield readInt32(),
    modifierInstanceType,
  );
  const items: T[] = [];
  for (let i = 0; i < count; i++) {
    const modifier = yield* parseModifier<T>(
      modifierInstanceType,
      templateParser,
    );
    items.push(modifier);
  }
  return items;
}

function* unparseModifiers<T extends MinionModificationInstance>(
  instances: T[],
  modifierInstanceType: string,
  templateUnparser: TemplateUnparser,
): UnparseIterator {
  yield writeInt32(instances.length);
  for (const instance of instances) {
    yield* unparseModifier<T>(instance, modifierInstanceType, templateUnparser);
  }
}

function* parseModifier<T extends MinionModificationInstance>(
  modifierInstanceType: string,
  templateParser: TemplateParser,
): ParseIterator<T> {
  const name: string = yield readKleiString();
  validateDotNetIdentifierName(name);
  const dataLength: number = yield readInt32();

  const startPos: number = yield getReaderPosition();
  const value: unknown = yield* templateParser.parseByTemplate(
    modifierInstanceType,
  );
  const endPos: number = yield getReaderPosition();

  const dataRemaining = dataLength - (endPos - startPos);
  if (dataRemaining !== 0) {
    throw new Error(
      `Modifier "${name}" deserialized ${Math.abs(dataRemaining)} ${
        dataRemaining > 0 ? "less" : "more"
      } bytes type data than expected.`,
    );
  }

  const instance: MinionModificationInstance = {
    name,
    value,
  };

  return instance as T;
}

function* unparseModifier<T extends MinionModificationInstance>(
  instance: T,
  modifierInstanceType: string,
  templateUnparser: TemplateUnparser,
): UnparseIterator {
  yield writeKleiString(instance.name);

  const token = yield writeDataLengthBegin();
  yield* templateUnparser.unparseByTemplate(
    modifierInstanceType,
    instance.value,
  );
  yield writeDataLengthEnd(token);
}
