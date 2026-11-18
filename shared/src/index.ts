export * from './types';
export * from './cards';
export * from './map';

/** Constantes d'équilibrage (modifiables sans toucher à la logique). */
export const BALANCE = {
  startHandSurvivor: 6,
  startHandPossessed: 5,
  possessedHexCards: 2,
  cursePanic: 20,
  passivePanicEveryMs: 15000,
  passivePanicAmount: 1,
  sabotagePanic: 3,
  sabotageCooldownMs: 30000,
  lightsDurationMs: 20000,
  lockDurationMs: 15000,
  jamDurationMs: 15000,
  slipCooldownMs: 20000,
  searchCooldownMs: 8000,
  saltDurationMs: 30000,
  uvDurationMs: 20000,
  meetingDurationMs: 60000,
  meetingResultMs: 6000,
  ghostSpeed: 90,
  ghostTouchCards: 1,
  ghostTouchCooldownMs: 6000,
  lightRadius: 260,
  lightRadiusSabotaged: 95,
  voiceMaxDistance: 600,
  voiceWallDamping: 0.35,
};
