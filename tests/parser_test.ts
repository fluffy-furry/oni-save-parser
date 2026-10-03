import { equal, throws } from "node:assert/strict";
import {
  ArrayDataReader,
  ArrayDataWriter,
} from "../src/binary-serializer/index.ts";
import {
  checkedDataLength,
  type DataLengthToken,
  parse,
  ParseError,
  type ParseIterator,
  readKleiString,
  unparse,
  type UnparseIterator,
  writeDataLengthBegin,
  writeDataLengthEnd,
  writeKleiString,
} from "../src/parser/index.ts";

Deno.test("parse errors preserve native causes, codes and stream offsets", () => {
  const cause = Object.assign(new Error("unsupported version"), {
    code: "VERSION",
  });
  const error = ParseError.create(cause, 12);
  equal(error.name, "ParseError");
  equal(error.dataOffset, 12);
  equal(error.code, "VERSION");
  equal(error.cause, cause);
  equal(ParseError.create(error, 99), error);
});

Deno.test("non-Error exceptions are wrapped without losing the thrown value", () => {
  for (const value of [null, undefined, 0, "failure", { code: 0 }]) {
    const broken = function* (): ParseIterator<never> {
      yield readKleiString();
      throw value;
    };
    const bytes = new Uint8Array(4); // Empty string advances the cursor by four.
    throws(
      () => parse(new ArrayDataReader(bytes), broken()),
      (error: unknown) => {
        equal(error instanceof ParseError, true);
        const parsed = error as ParseError;
        equal(parsed.cause, value);
        equal(parsed.dataOffset, 4);
        if (typeof value === "object" && value !== null) equal(parsed.code, 0);
        return true;
      },
    );
  }
});

Deno.test("nullable Klei strings round trip through typed instructions", () => {
  function* write(): UnparseIterator {
    yield writeKleiString(null);
    yield writeKleiString("");
    yield writeKleiString("hello");
  }
  const writer = new ArrayDataWriter();
  unparse(writer, write());
  function* read(): ParseIterator<void> {
    equal(yield readKleiString(), null);
    equal(yield readKleiString(), "");
    equal(yield readKleiString(), "hello");
  }
  const reader = new ArrayDataReader(writer.getBytesView());
  parse(reader, read());
  equal(reader.position, writer.position);
});

Deno.test("returned data resembling instructions is never executed", () => {
  const readResult = { type: "read", dataType: "int-32" };
  // deno-lint-ignore require-yield -- Regresses terminal-only generators.
  const parseResult = function* (): ParseIterator<typeof readResult> {
    return readResult;
  };
  const reader = new ArrayDataReader(new ArrayBuffer(0));
  equal(parse(reader, parseResult()), readResult);
  equal(reader.position, 0);

  const writeResult = { type: "write", dataType: "int-32", value: 42 };
  // deno-lint-ignore require-yield -- Regresses terminal-only generators.
  const unparseResult = function* (): UnparseIterator<typeof writeResult> {
    return writeResult;
  };
  const writer = new ArrayDataWriter();
  equal(unparse(writer, unparseResult()), writeResult);
  equal(writer.position, 0);
});

Deno.test("instruction dispatch rejects inherited object keys", () => {
  for (const dataType of ["constructor", "toString", "__proto__"]) {
    const read = function* (): ParseIterator<void> {
      yield { type: "read", dataType };
    };
    throws(() => parse(new ArrayDataReader(new ArrayBuffer(0)), read()), {
      name: "ParseError",
      message:
        `Error while processing content: Unknown read instruction: ${dataType}`,
    });
    const write = function* (): UnparseIterator {
      yield { type: "write", dataType };
    };
    throws(() => unparse(new ArrayDataWriter(), write()), {
      name: "ParseError",
      message:
        `Error while processing content: Unknown write instruction: ${dataType}`,
    });
  }
});

Deno.test("interceptor failures include their original cause and offset", () => {
  const cause = new Error("callback failed");
  const read = function* (): ParseIterator<void> {
    yield readKleiString();
  };
  throws(
    () =>
      parse(new ArrayDataReader(new ArrayBuffer(0)), read(), () => {
        throw cause;
      }),
    (error: unknown) => {
      equal(error instanceof ParseError, true);
      equal((error as ParseError).cause, cause);
      equal((error as ParseError).dataOffset, 0);
      return true;
    },
  );
});

Deno.test("framing lengths accept signed int32 bounds and reject overflow without wrapping", () => {
  for (const length of [-2147483648, -4, 0, 2147483647]) {
    equal(checkedDataLength(length), length);
  }
  for (
    const length of [-2147483649, 2147483648, 0.5, NaN, Infinity, -Infinity]
  ) {
    throws(() => checkedDataLength(length), RangeError);
  }
});

class VirtualPositionWriter extends ArrayDataWriter {
  virtualPosition: number | undefined;

  override get position(): number {
    return this.virtualPosition ?? super.position;
  }
}

Deno.test("generic length backpatching rejects a body larger than 2 GiB without allocating it", () => {
  const writer = new VirtualPositionWriter();
  function* write(): UnparseIterator {
    const token: DataLengthToken = yield writeDataLengthBegin();
    writer.virtualPosition = 2147483648 + 4;
    yield writeDataLengthEnd(token);
  }
  throws(() => unparse(writer, write()), (error: unknown) => {
    equal(error instanceof ParseError, true);
    const parsed = error as ParseError;
    equal(parsed.cause instanceof RangeError, true);
    equal(parsed.dataOffset, 2147483648 + 4);
    return true;
  });
  // Failure leaves the original placeholder intact rather than wrapping to MIN_INT32.
  equal(writer.getBytes().byteLength, 4);
  equal(new DataView(writer.getBytes()).getInt32(0, true), 0);
});

Deno.test("generic length backpatching accepts MAX_INT32 and preserves legacy negative advisory lengths", () => {
  const maximum = new VirtualPositionWriter();
  function* writeMaximum(): UnparseIterator {
    const token: DataLengthToken = yield writeDataLengthBegin();
    maximum.virtualPosition = 2147483647 + 4;
    yield writeDataLengthEnd(token);
  }
  unparse(maximum, writeMaximum());
  equal(maximum.getBytes().byteLength, 4);
  equal(new DataView(maximum.getBytes()).getInt32(0, true), 2147483647);

  const advisory = new ArrayDataWriter();
  function* writeAdvisory(): UnparseIterator {
    const token: DataLengthToken = yield writeDataLengthBegin(4);
    yield writeDataLengthEnd(token);
  }
  unparse(advisory, writeAdvisory());
  equal(new DataView(advisory.getBytes()).getInt32(0, true), -4);
});
