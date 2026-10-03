import type { DataReader } from "../../../binary-serializer/data-reader/interfaces.ts";
import {
  type ParseIterator,
  readByte,
  readInt32,
  readWith,
  type UnparseIterator,
  writeByte,
  writeInt32,
  writeWith,
} from "../../../parser/index.ts";

import type {
  TemplateParser,
  TemplateUnparser,
} from "../../type-templates/template-data-parser.ts";
import { validateCollectionCount } from "../../collection-count.ts";

import {
  parseQuaternion,
  parseVector3,
  unparseQuaternion,
  unparseVector3,
} from "../../../save-structure/data-types/data-types-parser.ts";

import type { GameObject } from "../game-object/index.ts";

import type { GameObjectBehavior } from "../game-object-behavior/index.ts";
import {
  parseGameObjectBehavior,
  unparseGameObjectBehavior,
} from "../game-object-behavior/parser.ts";

export function* parseGameObject(
  templateParser: TemplateParser,
): ParseIterator<GameObject> {
  const { position, rotation, scale, folder, behaviorCount }: GameObjectHeader =
    templateParser.useDirectIO
      ? yield readWith(readGameObjectHeader)
      : yield* parseGameObjectHeader();

  const behaviors: GameObjectBehavior[] = [];
  for (let i = 0; i < behaviorCount; i++) {
    behaviors.push(yield* parseGameObjectBehavior(templateParser));
  }

  const gameObject: GameObject = {
    position,
    rotation,
    scale,
    folder,
    behaviors,
  };

  return gameObject;
}

export function* unparseGameObject(
  gameObject: GameObject,
  templateUnparser: TemplateUnparser,
): UnparseIterator {
  const { position, rotation, scale, folder, behaviors } = gameObject;

  if (templateUnparser.useDirectIO) {
    yield writeWith((writer) => {
      writer.writeVector3(position);
      writer.writeQuaternion(rotation);
      writer.writeVector3(scale);
      writer.writeByte(folder);
      writer.writeInt32(
        validateCollectionCount(behaviors.length, "Game object behavior"),
      );
    });
  } else {
    yield* unparseVector3(position);
    yield* unparseQuaternion(rotation);
    yield* unparseVector3(scale);
    yield writeByte(folder);

    yield writeInt32(
      validateCollectionCount(behaviors.length, "Game object behavior"),
    );
  }

  for (const behavior of behaviors) {
    yield* unparseGameObjectBehavior(behavior, templateUnparser);
  }
}

type GameObjectHeader =
  & Pick<GameObject, "position" | "rotation" | "scale" | "folder">
  & {
    behaviorCount: number;
  };

function* parseGameObjectHeader(): ParseIterator<GameObjectHeader> {
  const position = yield* parseVector3();
  const rotation = yield* parseQuaternion();
  const scale = yield* parseVector3();
  const folder = yield readByte();

  const behaviorCount = validateCollectionCount(
    yield readInt32(),
    "Game object behavior",
  );

  return { position, rotation, scale, folder, behaviorCount };
}

function readGameObjectHeader(reader: DataReader): GameObjectHeader {
  // Keep scalar reads in their original order so truncated data reports the
  // same byte offset as the instruction-by-instruction generator path.
  const position = {
    x: reader.readSingle(),
    y: reader.readSingle(),
    z: reader.readSingle(),
  };
  const rotation = {
    x: reader.readSingle(),
    y: reader.readSingle(),
    z: reader.readSingle(),
    w: reader.readSingle(),
  };
  const scale = {
    x: reader.readSingle(),
    y: reader.readSingle(),
    z: reader.readSingle(),
  };
  const folder = reader.readByte();
  const behaviorCount = validateCollectionCount(
    reader.readInt32(),
    "Game object behavior",
  );
  return { position, rotation, scale, folder, behaviorCount };
}
