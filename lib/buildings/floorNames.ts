export function normalizeFloorName(value: string) {
  return value
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function getFloorDocumentId(value: string) {
  return normalizeFloorName(value).replace(/[^\p{L}\p{N}]+/gu, "-");
}

export function getNextFloorSortOrder(sortOrders: number[]) {
  const maxSortOrder = sortOrders.reduce(
    (maxValue, value) =>
      Number.isFinite(value) ? Math.max(maxValue, value) : maxValue,
    -1
  );

  return maxSortOrder + 1;
}

function formatOrdinal(level: number) {
  const remainder = level % 100;
  if (remainder >= 11 && remainder <= 13) {
    return `${level}th Floor`;
  }

  switch (level % 10) {
    case 1:
      return `${level}st Floor`;
    case 2:
      return `${level}nd Floor`;
    case 3:
      return `${level}rd Floor`;
    default:
      return `${level}th Floor`;
  }
}

/** Returns the floor label immediately above the highest numbered floor. */
export function getNextSequentialFloorName(floorNames: string[]) {
  const highestLevel = floorNames.reduce((highest, floorName) => {
    const match = floorName.match(/\d+/);
    const level = match ? Number.parseInt(match[0], 10) : 0;
    return Number.isFinite(level) ? Math.max(highest, level) : highest;
  }, 1);

  return formatOrdinal(highestLevel + 1);
}

export function compareFloorsBySortOrder(
  left: { id: string; normalizedName: string; sortOrder: number },
  right: { id: string; normalizedName: string; sortOrder: number }
) {
  return (
    left.sortOrder - right.sortOrder ||
    left.normalizedName.localeCompare(right.normalizedName) ||
    left.id.localeCompare(right.id)
  );
}
