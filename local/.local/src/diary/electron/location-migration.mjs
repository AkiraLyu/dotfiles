import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  DIARY_IO_CONCURRENCY,
  diaryEntryPath,
  isValidDiaryDate as isValidDate,
  listDiaryDates,
  mapWithConcurrency
} from './diary-files.mjs';
import { extractLocationMetadata, normalizeLocationKey } from './location-metadata.mjs';
import { locationMatchesSource } from './location-store.mjs';

async function readLocationEntries(diaryRoot) {
  const dates = await listDiaryDates(diaryRoot);
  const rows = await mapWithConcurrency(dates, DIARY_IO_CONCURRENCY, async (date) => {
    const content = await readFile(diaryEntryPath(diaryRoot, date), 'utf8');
    const metadata = extractLocationMetadata(content);
    return metadata.sourceKey ? { date, ...metadata } : null;
  });
  return rows.filter(Boolean);
}

function groupEntries(entries) {
  const grouped = new Map();
  for (const entry of entries) {
    if (!grouped.has(entry.sourceKey)) grouped.set(entry.sourceKey, []);
    grouped.get(entry.sourceKey).push(entry);
  }
  return [...grouped].map(([sourceKey, group]) => {
    const labels = new Map();
    for (const entry of group) labels.set(entry.sourceLabel, (labels.get(entry.sourceLabel) || 0) + 1);
    const sourceLabel = [...labels].sort((left, right) => right[1] - left[1]
      || left[0].localeCompare(right[0], 'zh-CN'))[0]?.[0] || sourceKey;
    const dates = group.map((entry) => entry.date).sort();
    return {
      sourceKey,
      sourceLabel,
      entryCount: dates.length,
      firstDate: dates[0],
      lastDate: dates.at(-1),
      dates
    };
  }).sort((left, right) => right.entryCount - left.entryCount
    || left.sourceLabel.localeCompare(right.sourceLabel, 'zh-CN'));
}

export async function scanLocationMigration(diaryRoot, { store = null, databaseError = '' } = {}) {
  const root = resolve(diaryRoot);
  const entries = await readLocationEntries(root);
  const savedByDate = new Map((store?.list() || []).map((location) => [location.date, location]));
  const excludedByDate = new Map((store?.getMigrationExclusions() || []).map((entry) => [entry.date, entry]));
  const pending = [];
  const skipped = [];
  const resolved = [];
  const conflicts = [];
  for (const entry of entries) {
    const saved = savedByDate.get(entry.date);
    if (saved) {
      if (locationMatchesSource(saved, entry)) resolved.push(entry);
      else {
        conflicts.push({
          date: entry.date,
          sourceLabel: entry.sourceLabel,
          sourceKey: entry.sourceKey,
          savedSourceLabel: saved.sourceLabel,
          savedDisplayName: saved.displayName
        });
      }
      continue;
    }
    const exclusion = excludedByDate.get(entry.date);
    if (exclusion?.sourceKey === entry.sourceKey) skipped.push(entry);
    else pending.push(entry);
  }
  return {
    summary: {
      locationEntryCount: entries.length,
      confirmedEntryCount: resolved.length,
      pendingEntryCount: pending.length,
      pendingGroupCount: new Set(pending.map((entry) => entry.sourceKey)).size,
      skippedEntryCount: skipped.length,
      conflictEntryCount: conflicts.length
    },
    groups: groupEntries(pending),
    conflicts,
    database: {
      available: Boolean(store),
      path: store?.path || join(root, '.shiguang', 'locations.sqlite3'),
      error: databaseError || ''
    },
    latestMigration: store?.latestCompletedMigration() || null
  };
}

function normalizeScope(value = {}) {
  const type = ['all', 'range', 'single'].includes(value.type) ? value.type : 'all';
  if (type === 'single') {
    if (!isValidDate(value.date)) throw new Error('请选择要迁移的日记日期');
    return { type, date: value.date };
  }
  if (type === 'range') {
    if (!isValidDate(value.startDate) || !isValidDate(value.endDate) || value.startDate > value.endDate) {
      throw new Error('迁移日期范围无效');
    }
    return { type, startDate: value.startDate, endDate: value.endDate };
  }
  return { type };
}

function inScope(entry, scope) {
  if (scope.type === 'single') return entry.date === scope.date;
  if (scope.type === 'range') return entry.date >= scope.startDate && entry.date <= scope.endDate;
  return true;
}

async function migrationTargets(diaryRoot, store, sourceKey, scope) {
  const normalizedKey = normalizeLocationKey(sourceKey);
  if (!normalizedKey) throw new Error('待迁移地点无效');
  const entries = (await readLocationEntries(diaryRoot))
    .filter((entry) => entry.sourceKey === normalizedKey && inScope(entry, scope));
  if (!entries.length) throw new Error('没有找到符合范围的旧地点记录');
  const available = entries.filter((entry) => !store.get(entry.date));
  if (!available.length) throw new Error('所选地点记录已经有坐标或存在冲突');
  return available;
}

async function verifyTargets(diaryRoot, entries) {
  for (const entry of entries) {
    const content = await readFile(join(diaryRoot, entry.date.slice(0, 4), `${entry.date}.md`), 'utf8');
    const current = extractLocationMetadata(content);
    if (current.sourceKey !== entry.sourceKey) {
      throw new Error(`${entry.date} 的地点文字在迁移期间发生变化，请重新扫描`);
    }
  }
}

function migrationBackupPath(diaryRoot) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return join(diaryRoot, '.shiguang', 'backups', `locations-before-${timestamp}-${randomUUID().slice(0, 8)}.sqlite3`);
}

export async function applyLocationMigration(diaryRoot, store, value = {}) {
  if (!store) throw new Error('地点数据库不可用');
  const root = resolve(diaryRoot);
  const scope = normalizeScope(value.scope);
  const sourceKey = normalizeLocationKey(value.sourceKey);
  const entries = await migrationTargets(root, store, sourceKey, scope);
  const backupPath = migrationBackupPath(root);
  await store.backupTo(backupPath);
  await verifyTargets(root, entries);
  const run = store.applyMigration({ entries, candidate: value.candidate, scope, backupPath });
  return { run, status: await scanLocationMigration(root, { store }) };
}

export async function skipLocationMigration(diaryRoot, store, value = {}) {
  if (!store) throw new Error('地点数据库不可用');
  const root = resolve(diaryRoot);
  const scope = normalizeScope(value.scope);
  const entries = await migrationTargets(root, store, value.sourceKey, scope);
  store.skipMigration(entries);
  return scanLocationMigration(root, { store });
}

export async function resetLocationMigrationSkips(diaryRoot, store) {
  if (!store) return scanLocationMigration(diaryRoot);
  store.resetMigrationSkips();
  return scanLocationMigration(diaryRoot, { store });
}

export async function undoLatestLocationMigration(diaryRoot, store) {
  if (!store) throw new Error('没有可撤销的地点迁移');
  const undone = store.undoLatestMigration();
  return { undone, status: await scanLocationMigration(diaryRoot, { store }) };
}
