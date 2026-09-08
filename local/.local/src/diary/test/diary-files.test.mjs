import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  SearchTextCache,
  diaryEntryPath,
  isValidDiaryDate,
  listDiaryDates,
  listDiaryImageEntries,
  mapWithConcurrency,
  resolveDiaryImagePath,
  writeFileAtomically
} from '../electron/diary-files.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

test('shared diary rules validate dates and list only fixed year/date paths', async () => {
  const temporary = await mkdtemp(join(ROOT, '.diary-files-test-'));
  const diaryRoot = join(temporary, 'Diary');
  try {
    assert.equal(isValidDiaryDate('2024-02-29'), true);
    for (const date of ['2023-02-29', '2026-13-01', '../2026-01-01', 'not-a-date']) {
      assert.equal(isValidDiaryDate(date), false);
      assert.throws(() => diaryEntryPath(diaryRoot, date), /日期无效/);
    }
    assert.deepEqual(await listDiaryDates(diaryRoot), []);

    await writeFileAtomically(diaryEntryPath(diaryRoot, '2026-08-04'), 'first');
    await writeFileAtomically(diaryEntryPath(diaryRoot, '2025-12-31'), 'second');
    await writeFile(join(diaryRoot, '2026', 'not-a-date.md'), 'ignored');
    await writeFile(join(diaryRoot, '2026', '2025-12-30.md'), 'wrong year');
    assert.deepEqual(await listDiaryDates(diaryRoot), ['2025-12-31', '2026-08-04']);
    assert.deepEqual(
      await listDiaryDates(diaryRoot, { descending: true }),
      ['2026-08-04', '2025-12-31']
    );

    await writeFileAtomically(diaryEntryPath(diaryRoot, '2026-08-04'), 'replaced');
    assert.equal(await readFile(diaryEntryPath(diaryRoot, '2026-08-04'), 'utf8'), 'replaced');
    assert.deepEqual((await readdir(join(diaryRoot, '2026'))).sort(), [
      '2025-12-30.md', '2026-08-04.md', 'not-a-date.md'
    ]);
    await writeFileAtomically(diaryEntryPath(diaryRoot, '2025-12-31'), '![封面](<../0.media/photo.webp> "图")');
    assert.deepEqual(await listDiaryImageEntries(diaryRoot, ['2026-08-04', '2026-08-05', '2025-12-31']), [
      { date: '2025-12-31', images: [{ alt: '封面', source: '../0.media/photo.webp' }] }
    ]);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test('image paths stay inside the diary and reject unsupported formats', () => {
  const diaryRoot = join(ROOT, 'Diary');
  assert.match(
    resolveDiaryImagePath(diaryRoot, '2026-08-04', '../0.media/2026-08-04/photo.webp').target,
    /0\.media[\\/]2026-08-04[\\/]photo\.webp$/
  );
  assert.equal(resolveDiaryImagePath(diaryRoot, '2026-08-04', '../../outside.png'), null);
  assert.equal(resolveDiaryImagePath(diaryRoot, '2026-08-04', './vector.svg'), null);
  assert.equal(resolveDiaryImagePath(diaryRoot, '2026-08-04', 'C:\\outside.png'), null);
});

test('diary reads run concurrently within their limit and preserve result order', async () => {
  let active = 0;
  let peak = 0;
  const values = await mapWithConcurrency([3, 1, 2], 2, async (value) => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, value));
    active -= 1;
    return value * 2;
  });
  assert.deepEqual(values, [6, 2, 4]);
  assert.equal(peak, 2);
});

test('the search cache bounds retained text and drops removed diaries', () => {
  const cache = new SearchTextCache(10);
  cache.set('a', '12345');
  cache.set('b', '67890');
  assert.equal(cache.get('a'), '12345');
  cache.set('c', 'xx');
  assert.equal(cache.get('b'), null);
  assert.equal(cache.get('a'), '12345');
  cache.prune(['c']);
  assert.equal(cache.get('a'), null);
  assert.equal(cache.get('c'), 'xx');
});
