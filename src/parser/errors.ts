/** An error with a byte offset in the current (possibly decompressed) stream. */
export class ParseError extends Error {
  readonly dataOffset: number;
  code?: string | number;

  constructor(message: string, dataOffset: number, options?: ErrorOptions) {
    super(message, options);
    this.name = "ParseError";
    this.dataOffset = dataOffset;
  }

  static create(error: unknown, dataOffset: number): ParseError {
    if (error instanceof ParseError) {
      return error;
    }

    const message = error instanceof Error
      ? `Error while processing content: ${error.message}`
      : String(error);
    const result = new ParseError(message, dataOffset, { cause: error });
    if (
      typeof error === "object" && error !== null && "code" in error &&
      (typeof error.code === "string" || typeof error.code === "number")
    ) {
      result.code = error.code;
    }
    return result;
  }
}
