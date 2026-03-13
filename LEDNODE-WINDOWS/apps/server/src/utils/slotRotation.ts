export function nextSlot(lastSlot: number | null, startSlot: number, clipCount: number): number {
  if (clipCount <= 1) {
    return startSlot;
  }

  if (lastSlot === null || Number.isNaN(lastSlot)) {
    return startSlot;
  }

  const maxSlot = startSlot + clipCount - 1;
  const candidate = lastSlot + 1;
  return candidate > maxSlot ? startSlot : candidate;
}
