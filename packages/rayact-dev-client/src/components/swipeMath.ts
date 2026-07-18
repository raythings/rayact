export const DELETE_REVEAL = 84;

export function clampSwipeOffset(startOffset: number, deltaX: number): number {
  return Math.max(-DELETE_REVEAL, Math.min(0, startOffset + deltaX));
}
