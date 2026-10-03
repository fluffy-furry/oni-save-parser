export enum HealthState {
  Perfect,
  Alright,
  Scuffed,
  Injured,
  Critical,
  Incapacitated,
  Dead,
  Invincible,
}

export function getHealthStateName(stateId: number): string | null {
  if (
    !Number.isInteger(stateId) ||
    !Object.hasOwn(HealthState, stateId)
  ) {
    return null;
  }
  return HealthState[stateId] ?? null;
}
