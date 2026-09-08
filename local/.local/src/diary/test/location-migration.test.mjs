import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  applyLocationMigration,
  resetLocationMigrationSkips,
  scanLocationMigration,
  skipLocationMigration,
  undoLatestLocationMigration
} from '../electron/location-migration.mjs';
import {
  DiaryLocationStore,
  locationDatabasePath,
  locationMatchesSource
} from '../electron/location-store.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const homeCandidate = {
  provider: 'amap',
  poiId: 'home-poi',
  displayName: '翠湖花园',
  address: '翠湖路 8 号',
  district: '云南省昆明市五华区',
  adcode: '530102',
  longitude: 102.701,
  latitude: 25.051,
  coordinateSystem: 'gcj02'
};

function diaryContent(date, location, body = '旧日记正文。') {
  return `---\n时间: ${date} 12:00\n天气: \n地点: ${location}\n---\n\n${body}\n`;
}

async function writeDiary(root, date, location, body) {
  const target = join(root, date.slice(0, 4), `${date}.md`);
  await mkdir(dirname(target), { recursive: true });
  const content = diaryContent(date, location, body);
  await writeFile(target, content, 'utf8');
  return { target, content };
}

async function withDiary(run) {
  const root = await mkdtemp(join(ROOT, '.location-migration-test-'));
  let store;
  try {
    await run(root, () => {
      store ||= new DiaryLocationStore(root);
      return store;
    });
  } finally {
    store?.close();
    await rm(root, { recursive: true, force: true });
  }
}

test('read-only legacy scan groups locations without creating a SQLite database', async () => {
  await withDiary(async (root) => {
    await writeDiary(root, '2022-01-01', '家');
    await writeDiary(root, '2022-02-01', '"家"');
    await writeDiary(root, '2022-03-01', '公司');
    await writeDiary(root, '2022-04-01', '');

    const status = await scanLocationMigration(root);
    assert.deepEqual(status.summary, {
      locationEntryCount: 3,
      confirmedEntryCount: 0,
      pendingEntryCount: 3,
      pendingGroupCount: 2,
      skippedEntryCount: 0,
      conflictEntryCount: 0
    });
    assert.deepEqual(status.groups.map((group) => [group.sourceLabel, group.entryCount]), [
      ['家', 2],
      ['公司', 1]
    ]);
    assert.equal(status.database.available, false);
    await assert.rejects(access(locationDatabasePath(root)), { code: 'ENOENT' });
  });
});

test('group migration preserves Markdown bytes, separates source labels, backs up, and is undoable', async () => {
  await withDiary(async (root, getStore) => {
    const first = await writeDiary(root, '2022-01-01', '家', '一字不能改。');
    const second = await writeDiary(root, '2023-01-01', '家', '包括 Frontmatter。');
    await writeDiary(root, '2023-02-01', '公司');
    const store = getStore();

    const result = await applyLocationMigration(root, store, {
      sourceKey: '家',
      candidate: homeCandidate,
      scope: { type: 'all' }
    });

    assert.equal(result.run.createdCount, 2);
    assert.equal(result.run.aliasCount, 1);
    assert.equal(result.status.summary.confirmedEntryCount, 2);
    assert.equal(await readFile(first.target, 'utf8'), first.content);
    assert.equal(await readFile(second.target, 'utf8'), second.content);
    assert.equal((await stat(result.run.backupPath)).isFile(), true);
    const backup = new DatabaseSync(result.run.backupPath, { readOnly: true });
    try {
      assert.equal(backup.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
      assert.equal(backup.prepare('SELECT COUNT(*) AS count FROM entry_locations').get().count, 0);
    } finally {
      backup.close();
    }

    const saved = store.get('2022-01-01');
    assert.equal(saved.sourceLabel, '家');
    assert.equal(saved.sourceKey, '家');
    assert.equal(saved.displayName, '翠湖花园');
    assert.equal(saved.resolutionMethod, 'migration_group');
    assert.equal(saved.migrationRunId, result.run.runId);
    assert.equal(locationMatchesSource(saved, { sourceKey: '家' }), true);

    const undone = await undoLatestLocationMigration(root, store);
    assert.equal(undone.undone.removedCount, 2);
    assert.equal(undone.undone.removedAliasCount, 1);
    assert.equal(store.get('2022-01-01'), null);
    assert.equal(store.get('2023-01-01'), null);
    assert.equal(undone.status.summary.pendingEntryCount, 3);
    assert.equal(await readFile(first.target, 'utf8'), first.content);
  });
});

test('date-range and single scopes, skip reset, and stacked undo affect only selected records', async () => {
  await withDiary(async (root, getStore) => {
    for (const date of ['2024-01-01', '2024-02-01', '2024-03-01']) {
      await writeDiary(root, date, '办公室');
    }
    await writeDiary(root, '2024-04-01', '公园');
    const store = getStore();

    const range = await applyLocationMigration(root, store, {
      sourceKey: '办公室',
      candidate: { ...homeCandidate, poiId: 'office-a', displayName: 'A 座' },
      scope: { type: 'range', startDate: '2024-01-01', endDate: '2024-02-28' }
    });
    assert.equal(range.run.createdCount, 2);
    assert.equal(store.get('2024-03-01'), null);
    assert.equal(range.status.groups.find((group) => group.sourceLabel === '办公室')?.entryCount, 1);

    let status = await skipLocationMigration(root, store, {
      sourceKey: '公园',
      scope: { type: 'all' }
    });
    assert.equal(status.summary.skippedEntryCount, 1);
    status = await resetLocationMigrationSkips(root, store);
    assert.equal(status.summary.skippedEntryCount, 0);
    assert.equal(status.groups.some((group) => group.sourceLabel === '公园'), true);

    const single = await applyLocationMigration(root, store, {
      sourceKey: '办公室',
      candidate: { ...homeCandidate, poiId: 'office-b', displayName: 'B 座' },
      scope: { type: 'single', date: '2024-03-01' }
    });
    assert.equal(single.run.createdCount, 1);
    assert.equal(store.get('2024-03-01').displayName, 'B 座');

    const undoSingle = await undoLatestLocationMigration(root, store);
    assert.equal(undoSingle.undone.runId, single.run.runId);
    assert.equal(store.get('2024-03-01'), null);
    assert.equal(store.get('2024-01-01').displayName, 'A 座');

    const undoRange = await undoLatestLocationMigration(root, store);
    assert.equal(undoRange.undone.runId, range.run.runId);
    assert.equal(store.get('2024-01-01'), null);
    assert.equal(store.get('2024-02-01'), null);
  });
});

test('stale coordinate bindings are reported as conflicts and never overwritten by migration', async () => {
  await withDiary(async (root, getStore) => {
    await writeDiary(root, '2025-01-01', '新地点');
    const store = getStore();
    store.save('2025-01-01', homeCandidate, { sourceLabel: '旧地点', sourceKey: '旧地点' });

    const status = await scanLocationMigration(root, { store });
    assert.equal(status.summary.conflictEntryCount, 1);
    assert.equal(status.summary.pendingEntryCount, 0);
    await assert.rejects(applyLocationMigration(root, store, {
      sourceKey: '新地点',
      candidate: homeCandidate,
      scope: { type: 'all' }
    }), /已经有坐标或存在冲突/);
    assert.equal(store.get('2025-01-01').sourceLabel, '旧地点');
  });
});
