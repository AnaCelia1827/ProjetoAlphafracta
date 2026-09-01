export function downsampleHistory<T>(items: readonly T[], maximum: number): T[] {
  if (items.length <= maximum) {
    return [...items];
  }

  if (maximum < 2) {
    throw new RangeError('maximum must be at least 2');
  }

  return Array.from(
    { length: maximum },
    (_, index) => items[Math.round((index * (items.length - 1)) / (maximum - 1))]!,
  );
}
