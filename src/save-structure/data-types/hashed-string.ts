export interface HashedString {
  hash: number;
}

interface HashedStringFactory {
  (str: string): HashedString;
  new (str: string): HashedString;
}

/** Create a frozen hash value, with or without `new`. */
export const HashedString = function HashedString(str: string): HashedString {
  return Object.freeze(getHashedString(str));
} as HashedStringFactory;

export function getHashedString(str: string): HashedString {
  return {
    hash: getSDBM32LowerHash(str),
  };
}

export type HashedStringEnum<T extends string> =
  & Record<T, HashedString>
  & Record<number, T>;

export function createHashedStringEnum<const T extends string>(
  strings: readonly T[],
): HashedStringEnum<T> {
  const entries: Record<string, HashedString | string> = {};
  for (const str of strings) {
    const hashed = HashedString(str);
    Object.defineProperty(entries, str, {
      value: hashed,
      enumerable: true,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(entries, hashed.hash, {
      value: str,
      enumerable: false,
    });
  }
  return entries as HashedStringEnum<T>;
}

/**
 * Hashes a string with the SDBM hashing algorithm,
 * then returns the signed 32 bit representation of the hash.
 * This is the algorithm ONI uses for HashString, whose values appear through the save file.
 * @param str The string to hash
 */
function getSDBM32LowerHash(str: string): number {
  if (str == null) {
    return 0;
  }
  str = str.toLowerCase();

  let num = 0;
  for (let index = 0; index < str.length; ++index) {
    // Bitwise coercion reproduces unchecked signed 32-bit integer arithmetic.
    num = (str.charCodeAt(index) + (num << 6) + (num << 16) - num) | 0;
  }

  return num;
}
