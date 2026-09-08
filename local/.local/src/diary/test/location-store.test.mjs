import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  DiaryLocationStore,
  LOCATION_DATABASE_NAME,
  LOCATION_DIRECTORY_NAME,
  LOCATION_SCHEMA_VERSION,
  locationDatabasePath,
  normalizeSavedLocation
} from '../electron/location-store.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const location = {
  provider: 'amap',
  poiId: 'B000A',
  displayName: '天安门广场',
  address: '东长安街',
  district: '北京市东城区',
  adcode: '110101',
  longitude: 116.397,
  latitude: 39.908,
  coordinateSystem: 'gcj02'
};

async function withStore(run) {
  const root = await mkdtemp(join(ROOT, '.location-store-test-'));
  const store = new DiaryLocationStore(root);
  try {
    await run(store, root);
  } finally {
    store.close();
    await rm(root, { recursive: true, force: true });
  }
}

test('location store persists one normalized coordinate record per diary date', async () => {
  await withStore(async (store, root) => {
    const saved = store.save('2026-08-10', location);
    assert.match(saved.selectedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.deepEqual(store.get('2026-08-10'), saved);
    assert.deepEqual(store.list(), [{ date: '2026-08-10', ...saved }]);
    assert.deepEqual(store.latest(), saved);
    await access(join(root, LOCATION_DIRECTORY_NAME, LOCATION_DATABASE_NAME));

    const replacement = store.save('2026-08-10', {
      ...location,
      poiId: 'B000B',
      displayName: '故宫博物院',
      longitude: 116.403
    });
    assert.equal(store.list().length, 1);
    assert.equal(store.get('2026-08-10').displayName, replacement.displayName);
    assert.equal(store.remove('2026-08-10'), true);
    assert.equal(store.get('2026-08-10'), null);
  });
});

test('location coordinates follow diary entries through trash and restore', async () => {
  await withStore(async (store) => {
    store.save('2026-08-10', location);
    assert.equal(store.moveToTrash('2026-08-10', '2026-08-10.2.md'), true);
    assert.equal(store.get('2026-08-10'), null);
    assert.equal(store.restoreFromTrash('2026-08-10.2.md', '2026-08-10'), true);
    assert.equal(store.get('2026-08-10').poiId, 'B000A');
    assert.equal(store.restoreFromTrash('missing.md', '2026-08-10'), false);
    assert.equal(store.moveToTrash('2026-08-10', '2026-08-10.3.md'), true);
    assert.equal(store.removeTrashEntries(['2026-08-10.3.md', '2026-08-10.3.md']), 1);
    assert.equal(store.restoreFromTrash('2026-08-10.3.md', '2026-08-10'), false);
  });
});

test('location normalization rejects malformed names, coordinates, and coordinate systems', () => {
  assert.throws(() => normalizeSavedLocation({ ...location, displayName: '' }), /名称不能为空/);
  assert.throws(() => normalizeSavedLocation({ ...location, longitude: 181 }), /经度无效/);
  assert.throws(() => normalizeSavedLocation({ ...location, latitude: -91 }), /纬度无效/);
  assert.throws(() => normalizeSavedLocation({ ...location, coordinateSystem: 'unknown' }), /坐标系无效/);
});

test('version 1 location databases upgrade in place and preserve existing coordinates', async () => {
  const root = await mkdtemp(join(ROOT, '.location-store-test-'));
  const databasePath = locationDatabasePath(root);
  await mkdir(dirname(databasePath), { recursive: true });
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`
    CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    INSERT INTO metadata(key, value) VALUES ('schema_version', '1');
    CREATE TABLE entry_locations (
      entry_date TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      poi_id TEXT NOT NULL DEFAULT '',
      display_name TEXT NOT NULL,
      address TEXT NOT NULL DEFAULT '',
      district TEXT NOT NULL DEFAULT '',
      adcode TEXT NOT NULL DEFAULT '',
      longitude REAL NOT NULL,
      latitude REAL NOT NULL,
      coordinate_system TEXT NOT NULL,
      selected_at TEXT NOT NULL
    );
    INSERT INTO entry_locations VALUES (
      '2020-01-01', 'amap', 'legacy-poi', '旧地点', '旧地址', '旧行政区',
      '110101', 116.397, 39.908, 'gcj02', '2020-01-01T12:00:00.000Z'
    );
  `);
  legacy.close();

  const upgraded = new DiaryLocationStore(root, { create: false });
  try {
    const saved = upgraded.get('2020-01-01');
    assert.equal(saved.displayName, '旧地点');
    assert.equal(saved.sourceLabel, '旧地点');
    assert.equal(saved.sourceKey, '旧地点');
    assert.equal(saved.bindingMode, 'frontmatter');
    assert.equal(saved.resolutionMethod, 'editor');
    assert.equal(
      upgraded.database.prepare("SELECT value FROM metadata WHERE key = 'schema_version'").get().value,
      String(LOCATION_SCHEMA_VERSION)
    );
  } finally {
    upgraded.close();
    await rm(root, { recursive: true, force: true });
  }
});
