import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCalendarMonth,
  buildCalendarYear,
  calendarDateKey
} from '../public/calendar-model.js';

test('builds a Monday-first month with recorded dates', () => {
  const month = buildCalendarMonth(2024, 3, new Set(['2024-04-01', '2024-04-30']));
  assert.equal(month.cells[0].date, '2024-04-01');
  assert.equal(month.cells.findLast((cell) => cell)?.date, '2024-04-30');
  assert.equal(month.count, 2);
  assert.equal(month.cells.filter(Boolean).length, 30);
});

test('includes leap day and pads generated date keys', () => {
  const month = buildCalendarMonth(2024, 1, new Set(['2024-02-29']));
  assert.equal(calendarDateKey(2024, 1, 3), '2024-02-03');
  assert.equal(month.cells.findLast((cell) => cell)?.date, '2024-02-29');
  assert.equal(month.cells.find((cell) => cell?.date === '2024-02-29').recorded, true);
});

test('builds all twelve months and aligns Sunday to the final column', () => {
  const months = buildCalendarYear(2026);
  assert.equal(months.length, 12);
  const february = months[1];
  const firstDayIndex = february.cells.findIndex(Boolean);
  assert.equal(firstDayIndex, 6);
  assert.equal(february.cells[firstDayIndex].date, '2026-02-01');
});
