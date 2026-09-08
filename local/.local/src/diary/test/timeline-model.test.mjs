import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMonthOffsets,
  findMonthIndexAtOffset,
  groupEntriesByMonth,
  virtualRange
} from '../public/timeline-model.js';

test('groups a large timeline by month without changing entry order', () => {
  const entries = [];
  for (let year = 2035; year >= 2022; year -= 1) {
    for (let month = 12; month >= 1; month -= 1) {
      for (let day = 28; day >= 1; day -= 1) {
        entries.push({ date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` });
      }
    }
  }
  const groups = groupEntriesByMonth(entries);
  assert.equal(groups.length, 168);
  assert.deepEqual(groups.flatMap((group) => group.entries), entries);
});

test('keeps only a small month window around the active position', () => {
  for (const [total, center, size] of [[168, 84, 5], [168, 0, 5], [168, 167, 5], [2, 0, 5]]) {
    const { start, end } = virtualRange(total, center, size);
    assert.equal(end - start, Math.min(total, size));
    assert.ok(start >= 0 && end <= total);
    assert.ok(start <= center && center < end);
  }
  assert.deepEqual(virtualRange(0, 0, 5), { start: 0, end: 0 });
});

test('maps large scroll offsets back to their month', () => {
  const groups = groupEntriesByMonth([
    { date: '2026-03-01' },
    { date: '2026-02-01' },
    { date: '2026-01-01' }
  ]);
  const offsets = buildMonthOffsets(groups, new Map([['2026-03', 300], ['2026-02', 500], ['2026-01', 400]]));
  assert.deepEqual(offsets, [0, 300, 800, 1200]);
  assert.equal(findMonthIndexAtOffset(offsets, 0), 0);
  assert.equal(findMonthIndexAtOffset(offsets, 799), 1);
  assert.equal(findMonthIndexAtOffset(offsets, 1199), 2);
});
