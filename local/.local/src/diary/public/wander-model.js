function dateParts(dateKey) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKey || ''));
  if (!match) return null;
  return match.slice(1).map(Number);
}

export function wholeMonthDistance(dateKey, referenceKey) {
  const date = dateParts(dateKey);
  const reference = dateParts(referenceKey);
  if (!date || !reference || date[2] !== reference[2]) return null;
  return (reference[0] - date[0]) * 12 + reference[1] - date[1];
}

export function entriesAtWholeMonthIntervals(entries, referenceKey) {
  return entries.filter((entry) => {
    const distance = wholeMonthDistance(entry.date, referenceKey);
    return distance !== null && distance > 0;
  });
}

export function shuffledEntries(entries) {
  const shuffled = [...entries];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  return shuffled;
}

export function wrappedIndex(index, length) {
  if (!length) return 0;
  return ((index % length) + length) % length;
}
