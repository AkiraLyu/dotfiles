import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  deleteTrashEntry,
  emptyTrashEntries,
  listTrashEntries,
  moveEntryToTrash,
  parseTrashId,
  restoreTrashEntry
} from '../electron/trash-store.mjs';

const workspaceRoot = dirname(dirname(fileURLToPath(import.meta.url)));

test('trash ids accept dated Markdown files and reject path traversal', () => {
  assert.deepEqual(parseTrashId('2026-08-05.md'), {
    id: '2026-08-05.md', date: '2026-08-05', sequence: 0
  });
  assert.deepEqual(parseTrashId('2026-08-05.2.md'), {
    id: '2026-08-05.2.md', date: '2026-08-05', sequence: 2
  });
  assert.equal(parseTrashId('../2026-08-05.md'), null);
  assert.equal(parseTrashId('2026-02-30.md'), null);
});

test('deleted diaries move into the library .Trash and restore without overwriting', async () => {
  const temporary = await mkdtemp(join(workspaceRoot, '.trash-store-test-'));
  const diaryRoot = join(temporary, 'Diary');
  const date = '2026-08-05';
  const activePath = join(diaryRoot, '2026', `${date}.md`);
  try {
    await mkdir(join(diaryRoot, '2026'), { recursive: true });
    await writeFile(activePath, 'first', 'utf8');
    const first = await moveEntryToTrash(diaryRoot, date);
    assert.equal(first.id, `${date}.md`);
    assert.equal(await readFile(join(diaryRoot, '.Trash', first.id), 'utf8'), 'first');

    await writeFile(activePath, 'second', 'utf8');
    const second = await moveEntryToTrash(diaryRoot, date);
    assert.equal(second.id, `${date}.1.md`);
    assert.equal(await readFile(join(diaryRoot, '.Trash', second.id), 'utf8'), 'second');

    const listed = await listTrashEntries(diaryRoot);
    assert.deepEqual(new Set(listed.map((entry) => entry.id)), new Set([first.id, second.id]));

    await restoreTrashEntry(diaryRoot, first.id);
    assert.equal(await readFile(activePath, 'utf8'), 'first');
    await assert.rejects(() => restoreTrashEntry(diaryRoot, second.id), /该日期已有日记/);
    assert.equal(await readFile(join(diaryRoot, '.Trash', second.id), 'utf8'), 'second');

    const singleDate = '2026-08-06';
    const singlePath = join(diaryRoot, '2026', `${singleDate}.md`);
    await writeFile(singlePath, 'single', 'utf8');
    const single = await moveEntryToTrash(diaryRoot, singleDate);
    assert.deepEqual(await deleteTrashEntry(diaryRoot, single.id), {
      id: single.id, date: singleDate, deleted: true
    });
    await assert.rejects(() => readFile(join(diaryRoot, '.Trash', single.id)), { code: 'ENOENT' });
    await assert.rejects(() => deleteTrashEntry(diaryRoot, '../2026-08-06.md'), /回收文件无效/);
    await assert.rejects(() => deleteTrashEntry(diaryRoot, single.id), /回收文件不存在/);

    const invalidId = '2026-08-07.md';
    await mkdir(join(diaryRoot, '.Trash', invalidId));
    await assert.rejects(() => deleteTrashEntry(diaryRoot, invalidId), /回收文件无效/);
    await assert.rejects(() => restoreTrashEntry(diaryRoot, invalidId), /回收文件无效/);

    await writeFile(join(diaryRoot, '.Trash', 'keep.txt'), 'unmanaged', 'utf8');
    const emptied = await emptyTrashEntries(diaryRoot);
    assert.deepEqual(emptied, { deletedCount: 1, ids: [second.id] });
    assert.deepEqual(await listTrashEntries(diaryRoot), []);
    assert.equal(await readFile(join(diaryRoot, '.Trash', 'keep.txt'), 'utf8'), 'unmanaged');
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
