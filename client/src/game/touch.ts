/** Vecteur de déplacement du joystick tactile (lu par GameCanvas à chaque frame). */
export const touchInput = { x: 0, y: 0 };

export const isTouchDevice = () =>
  typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window);
