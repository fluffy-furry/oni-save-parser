export const CURRENT_VERSION_MAJOR = 7;
export const CURRENT_VERSION_MINOR = [28, 31, 33, 34, 37, 38];

export function validateVersion(
  major: number,
  minor: number,
  strictness: "major" | "minor" = "minor",
): void {
  if (
    major !== CURRENT_VERSION_MAJOR ||
    (strictness === "minor" && !CURRENT_VERSION_MINOR.includes(minor))
  ) {
    const error = new Error(
      `Save version "${major}.${minor}" is not compatible with this parser. Expected one of: ${
        CURRENT_VERSION_MINOR.map((version) =>
          `${CURRENT_VERSION_MAJOR}.${version}`
        ).join(", ")
      }.`,
    );
    throw Object.assign(error, {
      code: major !== CURRENT_VERSION_MAJOR ? E_VERSION_MAJOR : E_VERSION_MINOR,
    });
  }
}

export const E_VERSION_MAJOR = "E_VERSION_MAJOR";
export const E_VERSION_MINOR = "E_VERSION_MINOR";
