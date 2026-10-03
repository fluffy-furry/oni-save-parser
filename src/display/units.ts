export function kelvinToCelsius(kelvin: number): number {
  return kelvin - 273.15;
}

export function celsiusToKelvin(celsius: number): number {
  return celsius + 273.15;
}

export function kelvinToFahrenheit(kelvin: number): number {
  return kelvin * 1.8 - 459.67;
}

export function fahrenheitToKelvin(fahrenheit: number): number {
  return (fahrenheit + 459.67) / 1.8;
}

export function caloriesToKilocalories(calories: number): number {
  return calories / 1000;
}

export function kilocaloriesToCalories(kilocalories: number): number {
  return kilocalories * 1000;
}

export function secondsToCycles(seconds: number): number {
  return seconds / 600;
}

export function cyclesToSeconds(cycles: number): number {
  return cycles * 600;
}

export function unitsToKilograms(units: number, massPerUnit: number): number {
  validateMassPerUnit(massPerUnit);
  return units * massPerUnit;
}

export function kilogramsToUnits(
  kilograms: number,
  massPerUnit: number,
): number {
  validateMassPerUnit(massPerUnit);
  return kilograms / massPerUnit;
}

function validateMassPerUnit(massPerUnit: number): void {
  if (!Number.isFinite(massPerUnit) || massPerUnit <= 0) {
    throw new RangeError(
      "massPerUnit must be a finite number greater than zero.",
    );
  }
}
