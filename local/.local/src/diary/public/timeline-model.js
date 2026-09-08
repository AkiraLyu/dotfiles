const DEFAULT_ENTRY_HEIGHT = 132;
const MONTH_HEADER_HEIGHT = 42;
const YEAR_HEADER_HEIGHT = 38;

export function groupEntriesByMonth(entries) {
  const groups = [];
  for (const entry of entries) {
    const key = entry.date.slice(0, 7);
    let group = groups.at(-1);
    if (!group || group.key !== key) {
      const year = key.slice(0, 4);
      group = {
        key,
        year,
        yearBoundary: !groups.length || groups.at(-1).year !== year,
        entries: []
      };
      groups.push(group);
    }
    group.entries.push(entry);
  }
  return groups;
}

function estimateMonthHeight(group) {
  return MONTH_HEADER_HEIGHT + (group.yearBoundary ? YEAR_HEADER_HEIGHT : 0) + group.entries.length * DEFAULT_ENTRY_HEIGHT;
}

export function buildMonthOffsets(groups, measuredHeights = new Map()) {
  const offsets = [0];
  for (const group of groups) {
    const measured = Number(measuredHeights.get(group.key));
    const height = Number.isFinite(measured) && measured > 0 ? measured : estimateMonthHeight(group);
    offsets.push(offsets.at(-1) + height);
  }
  return offsets;
}

export function findMonthIndexAtOffset(offsets, offset) {
  const total = Math.max(0, offsets.length - 1);
  if (!total) return -1;
  const target = Math.max(0, Math.min(Number(offset) || 0, offsets.at(-1) - 1));
  let low = 0;
  let high = total - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (target < offsets[middle]) high = middle - 1;
    else if (target >= offsets[middle + 1]) low = middle + 1;
    else return middle;
  }
  return Math.max(0, Math.min(total - 1, low));
}

export function virtualRange(total, center, windowSize = 7) {
  if (total <= 0) return { start: 0, end: 0 };
  const size = Math.min(total, Math.max(1, Math.floor(windowSize)));
  const safeCenter = Math.max(0, Math.min(total - 1, Math.floor(center)));
  let start = safeCenter - Math.floor(size / 2);
  start = Math.max(0, Math.min(total - size, start));
  return { start, end: start + size };
}
