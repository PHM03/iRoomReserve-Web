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
