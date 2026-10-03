/** Validate counts stored as signed 32-bit integers without imposing a file-size limit. */
export function validateCollectionCount(count: number, label: string): number {
  if (!Number.isInteger(count) || count < 0 || count > 0x7fffffff) {
    throw new RangeError(
      `${label} count must be a non-negative 32-bit integer.`,
    );
  }
  return count;
}
