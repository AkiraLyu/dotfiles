import test from 'node:test';
import assert from 'node:assert/strict';
import {
  entriesAtWholeMonthIntervals,
  shuffledEntries,
  wholeMonthDistance,
  wrappedIndex
} from '../public/wander-model.js';

test('selects earlier diaries with the same day at whole-month intervals', () => {
  const entries = [
    { date: '2026-07-05' },
    { date: '2025-08-05' },
    { date: '2026-07-04' },
    { date: '2026-08-05' },
    { date: '2026-09-05' }
  ];
  assert.equal(wholeMonthDistance('2025-08-05', '2026-08-05'), 12);
  assert.equal(wholeMonthDistance('2026-07-04', '2026-08-05'), null);
  assert.deepEqual(
    entriesAtWholeMonthIntervals(entries, '2026-08-05').map((entry) => entry.date),
    ['2026-07-05', '2025-08-05']
  );
});

test('shuffles a copy without mutating the diary index', () => {
  const entries = [{ date: 'a' }, { date: 'b' }, { date: 'c' }];
  const shuffled = shuffledEntries(entries);
  assert.deepEqual(entries.map((entry) => entry.date), ['a', 'b', 'c']);
  assert.notEqual(shuffled, entries);
  assert.deepEqual(new Set(shuffled), new Set(entries));
});

test('wraps carousel indexes in both directions', () => {
  assert.equal(wrappedIndex(3, 3), 0);
  assert.equal(wrappedIndex(-1, 3), 2);
  assert.equal(wrappedIndex(8, 3), 2);
  assert.equal(wrappedIndex(4, 0), 0);
});
