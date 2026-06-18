export const UNUSUAL_VOLUME_THRESHOLD = 1.5;

export function computeRelativeVolume(
  volume: number | null | undefined,
  averageVolume: number | null | undefined,
): number | null {
  if (
    volume === null ||
    volume === undefined ||
    averageVolume === null ||
    averageVolume === undefined ||
    !Number.isFinite(volume) ||
    !Number.isFinite(averageVolume) ||
    volume < 0 ||
    averageVolume <= 0
  ) {
    return null;
  }

  return volume / averageVolume;
}

export function isUnusualVolume(relativeVolume: number | null): boolean {
  return relativeVolume !== null && relativeVolume >= UNUSUAL_VOLUME_THRESHOLD;
}
