import type { ParseIterator } from "../parser/index.ts";
import { taggedParseEnd, taggedParseStart } from "./instructions.ts";

type Label<Args extends unknown[]> = string | ((...args: Args) => string);
type Parser<Args extends unknown[], Result> = (
  ...args: Args
) => ParseIterator<Result>;

/** Wrap a generator while preserving its parameter tuple and return type. */
export default function taggedParser<Args extends unknown[], Result>(
  tag: NoInfer<Label<Args>>,
  parser: Parser<Args, Result>,
): Parser<Args, Result>;
export default function taggedParser<Args extends unknown[], Result>(
  tag: NoInfer<Label<Args>>,
  instanceName: NoInfer<Label<Args>>,
  parser: Parser<Args, Result>,
): Parser<Args, Result>;
export default function taggedParser<Args extends unknown[], Result>(
  tag: NoInfer<Label<Args>>,
  nameOrParser: Label<Args> | Parser<Args, Result>,
  parserArgument?: Parser<Args, Result>,
): Parser<Args, Result> {
  // The overload determines whether the second function is a label or a parser.
  const parser = parserArgument ?? nameOrParser as Parser<Args, Result>;
  const instanceName = parserArgument === undefined
    ? undefined
    : nameOrParser as Label<Args>;

  return function* (...args: Args): ParseIterator<Result> {
    const resolvedTag = typeof tag === "function" ? tag(...args) : tag;
    const resolvedInstance = typeof instanceName === "function"
      ? instanceName(...args)
      : instanceName;
    yield taggedParseStart(resolvedTag, resolvedInstance);
    const result = yield* parser(...args);
    yield taggedParseEnd(resolvedTag, resolvedInstance);
    return result;
  };
}
