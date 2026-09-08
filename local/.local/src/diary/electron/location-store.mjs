import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { isValidDiaryDate as isValidDate } from './diary-files.mjs';
import { normalizeLocationKey } from './location-metadata.mjs';

export const LOCATION_DIRECTORY_NAME = '.shiguang';
export const LOCATION_DATABASE_NAME = 'locations.sqlite3';
export const LOCATION_SCHEMA_VERSION = 2;

const COORDINATE_SYSTEMS = new Set(['gcj02', 'wgs84', 'bd09']);
const PROVIDERS = new Set(['amap', 'manual', 'gps']);
const BINDING_MODES = new Set(['frontmatter', 'sqlite_only']);
const RESOLUTION_METHODS = new Set(['editor', 'migration_single', 'migration_range', 'migration_group']);

function cleanString(value, maximum) {
  if (typeof value !== 'string') return '';
  const normalized = value.normalize('NFKC').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  return [...normalized].slice(0, maximum).join('');
}

export function locationDatabasePath(diaryRoot) {
  return join(diaryRoot, LOCATION_DIRECTORY_NAME, LOCATION_DATABASE_NAME);
}

export function normalizeSavedLocation(value) {
  if (!value || typeof value !== 'object') throw new Error('地点信息无效');
  const displayName = cleanString(value.displayName, 160);
  const longitude = Number(value.longitude);
  const latitude = Number(value.latitude);
  const provider = cleanString(value.provider, 32) || 'amap';
  const coordinateSystem = cleanString(value.coordinateSystem, 16) || 'gcj02';
  if (!displayName) throw new Error('地点名称不能为空');
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) throw new Error('地点经度无效');
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) throw new Error('地点纬度无效');
  if (!PROVIDERS.has(provider)) throw new Error('地点来源无效');
  if (!COORDINATE_SYSTEMS.has(coordinateSystem)) throw new Error('地点坐标系无效');
  const adcode = cleanString(value.adcode, 12);
  return {
    provider,
    poiId: cleanString(value.poiId, 128),
    displayName,
    address: cleanString(value.address, 400),
    district: cleanString(value.district, 200),
    adcode: /^\d{6}$/.test(adcode) ? adcode : '',
    longitude,
    latitude,
    coordinateSystem
  };
}

function normalizeBinding(location, value = {}) {
  const bindingMode = BINDING_MODES.has(value.bindingMode) ? value.bindingMode : 'frontmatter';
  const resolutionMethod = RESOLUTION_METHODS.has(value.resolutionMethod) ? value.resolutionMethod : 'editor';
  const sourceLabel = cleanString(value.sourceLabel ?? location.displayName, 160);
  const sourceKey = normalizeLocationKey(value.sourceKey || sourceLabel);
  if (bindingMode === 'frontmatter' && !sourceKey) throw new Error('原始地点文字不能为空');
  return {
    sourceLabel,
    sourceKey,
    bindingMode,
    resolutionMethod,
    migrationRunId: cleanString(value.migrationRunId, 80)
  };
}

function rowToLocation(row) {
  if (!row) return null;
  return {
    provider: row.provider,
    poiId: row.poi_id || '',
    displayName: row.display_name,
    address: row.address || '',
    district: row.district || '',
    adcode: row.adcode || '',
    longitude: row.longitude,
    latitude: row.latitude,
    coordinateSystem: row.coordinate_system,
    sourceLabel: row.source_label || row.display_name,
    sourceKey: row.source_key || normalizeLocationKey(row.source_label || row.display_name),
    bindingMode: row.binding_mode || 'frontmatter',
    resolutionMethod: row.resolution_method || 'editor',
    migrationRunId: row.migration_run_id || '',
    selectedAt: row.selected_at
  };
}

function rowValues(row) {
  return [
    row.provider,
    row.poi_id || '',
    row.display_name,
    row.address || '',
    row.district || '',
    row.adcode || '',
    row.longitude,
    row.latitude,
    row.coordinate_system,
    row.source_label || row.display_name,
    row.source_key || normalizeLocationKey(row.source_label || row.display_name),
    row.binding_mode || 'frontmatter',
    row.resolution_method || 'editor',
    row.migration_run_id || '',
    row.selected_at
  ];
}

function migrationRunToObject(row) {
  if (!row) return null;
  return {
    runId: row.run_id,
    startedAt: row.started_at,
    completedAt: row.completed_at || '',
    undoneAt: row.undone_at || '',
    status: row.status,
    backupPath: row.backup_path || '',
    createdCount: Number(row.created_count) || 0,
    aliasCount: Number(row.alias_count) || 0
  };
}

function tableColumns(database, table) {
  return new Set(database.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name));
}

function ensureColumns(database, table, columns) {
  const existing = tableColumns(database, table);
  for (const [name, definition] of columns) {
    if (!existing.has(name)) database.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
  }
}

function backfillBindings(database, table, identityColumn) {
  const rows = database.prepare(`
    SELECT ${identityColumn} AS identity, display_name, source_label, source_key
    FROM ${table}
    WHERE source_label = '' OR source_key = ''
  `).all();
  const update = database.prepare(`UPDATE ${table} SET source_label = ?, source_key = ? WHERE ${identityColumn} = ?`);
  for (const row of rows) {
    const sourceLabel = cleanString(row.source_label || row.display_name, 160);
    update.run(sourceLabel, normalizeLocationKey(row.source_key || sourceLabel), row.identity);
  }
}

const LOCATION_COLUMNS = `
  provider, poi_id, display_name, address, district, adcode,
  longitude, latitude, coordinate_system, source_label, source_key,
  binding_mode, resolution_method, migration_run_id, selected_at
`;

export function locationMatchesSource(location, metadata) {
  if (!location) return false;
  if (location.bindingMode === 'sqlite_only') return !metadata?.sourceKey;
  return Boolean(metadata?.sourceKey) && normalizeLocationKey(location.sourceKey) === metadata.sourceKey;
}

export class DiaryLocationStore {
  constructor(diaryRoot, { create = true } = {}) {
    if (typeof diaryRoot !== 'string' || !diaryRoot) throw new TypeError('diaryRoot is required');
    this.path = locationDatabasePath(diaryRoot);
    if (!create && !existsSync(this.path)) {
      const error = new Error('地点数据库不存在');
      error.code = 'ENOENT';
      throw error;
    }
    if (create) mkdirSync(dirname(this.path), { recursive: true });
    this.database = new DatabaseSync(this.path);
    try {
      this.#initialize();
      this.#prepareStatements();
    } catch (error) {
      this.database.close();
      throw error;
    }
  }

  #initialize() {
    this.database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA busy_timeout = 5000;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
    const currentVersion = Number(this.database.prepare("SELECT value FROM metadata WHERE key = 'schema_version'").get()?.value || 0);
    if (currentVersion > LOCATION_SCHEMA_VERSION) throw new Error('地点数据库来自更新版本，当前应用无法读取');
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS entry_locations (
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
        source_label TEXT NOT NULL DEFAULT '',
        source_key TEXT NOT NULL DEFAULT '',
        binding_mode TEXT NOT NULL DEFAULT 'frontmatter',
        resolution_method TEXT NOT NULL DEFAULT 'editor',
        migration_run_id TEXT NOT NULL DEFAULT '',
        selected_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS trashed_entry_locations (
        trash_id TEXT PRIMARY KEY,
        original_date TEXT NOT NULL,
        provider TEXT NOT NULL,
        poi_id TEXT NOT NULL DEFAULT '',
        display_name TEXT NOT NULL,
        address TEXT NOT NULL DEFAULT '',
        district TEXT NOT NULL DEFAULT '',
        adcode TEXT NOT NULL DEFAULT '',
        longitude REAL NOT NULL,
        latitude REAL NOT NULL,
        coordinate_system TEXT NOT NULL,
        source_label TEXT NOT NULL DEFAULT '',
        source_key TEXT NOT NULL DEFAULT '',
        binding_mode TEXT NOT NULL DEFAULT 'frontmatter',
        resolution_method TEXT NOT NULL DEFAULT 'editor',
        migration_run_id TEXT NOT NULL DEFAULT '',
        selected_at TEXT NOT NULL
      );
    `);
    const bindingColumns = [
      ['source_label', "TEXT NOT NULL DEFAULT ''"],
      ['source_key', "TEXT NOT NULL DEFAULT ''"],
      ['binding_mode', "TEXT NOT NULL DEFAULT 'frontmatter'"],
      ['resolution_method', "TEXT NOT NULL DEFAULT 'editor'"],
      ['migration_run_id', "TEXT NOT NULL DEFAULT ''"]
    ];
    ensureColumns(this.database, 'entry_locations', bindingColumns);
    ensureColumns(this.database, 'trashed_entry_locations', bindingColumns);
    this.database.exec(`
      CREATE INDEX IF NOT EXISTS entry_locations_selected_at ON entry_locations(selected_at DESC);
      CREATE INDEX IF NOT EXISTS entry_locations_source_key ON entry_locations(source_key, entry_date);
      CREATE TABLE IF NOT EXISTS migration_runs (
        run_id TEXT PRIMARY KEY,
        started_at TEXT NOT NULL,
        completed_at TEXT NOT NULL DEFAULT '',
        undone_at TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL,
        backup_path TEXT NOT NULL DEFAULT '',
        created_count INTEGER NOT NULL DEFAULT 0,
        alias_count INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS location_aliases (
        alias_id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_label TEXT NOT NULL,
        source_key TEXT NOT NULL,
        valid_from TEXT NOT NULL DEFAULT '',
        valid_to TEXT NOT NULL DEFAULT '',
        provider TEXT NOT NULL,
        poi_id TEXT NOT NULL DEFAULT '',
        display_name TEXT NOT NULL,
        address TEXT NOT NULL DEFAULT '',
        district TEXT NOT NULL DEFAULT '',
        adcode TEXT NOT NULL DEFAULT '',
        longitude REAL NOT NULL,
        latitude REAL NOT NULL,
        coordinate_system TEXT NOT NULL,
        migration_run_id TEXT NOT NULL,
        confirmed_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS location_aliases_source_key ON location_aliases(source_key, valid_from, valid_to);
      CREATE TABLE IF NOT EXISTS migration_exclusions (
        entry_date TEXT PRIMARY KEY,
        source_label TEXT NOT NULL,
        source_key TEXT NOT NULL,
        skipped_at TEXT NOT NULL
      );
    `);
    this.database.exec('BEGIN IMMEDIATE');
    try {
      backfillBindings(this.database, 'entry_locations', 'entry_date');
      backfillBindings(this.database, 'trashed_entry_locations', 'trash_id');
      this.database.prepare(`
        INSERT INTO metadata(key, value) VALUES('schema_version', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `).run(String(LOCATION_SCHEMA_VERSION));
      this.database.exec(`PRAGMA user_version = ${LOCATION_SCHEMA_VERSION}`);
      this.database.exec('COMMIT');
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  #prepareStatements() {
    this.getStatement = this.database.prepare(`SELECT ${LOCATION_COLUMNS} FROM entry_locations WHERE entry_date = ?`);
    this.listStatement = this.database.prepare(`SELECT entry_date, ${LOCATION_COLUMNS} FROM entry_locations ORDER BY entry_date`);
    this.latestStatement = this.database.prepare(`SELECT ${LOCATION_COLUMNS} FROM entry_locations ORDER BY selected_at DESC LIMIT 1`);
    this.upsertStatement = this.database.prepare(`
      INSERT INTO entry_locations(entry_date, ${LOCATION_COLUMNS})
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(entry_date) DO UPDATE SET
        provider = excluded.provider,
        poi_id = excluded.poi_id,
        display_name = excluded.display_name,
        address = excluded.address,
        district = excluded.district,
        adcode = excluded.adcode,
        longitude = excluded.longitude,
        latitude = excluded.latitude,
        coordinate_system = excluded.coordinate_system,
        source_label = excluded.source_label,
        source_key = excluded.source_key,
        binding_mode = excluded.binding_mode,
        resolution_method = excluded.resolution_method,
        migration_run_id = excluded.migration_run_id,
        selected_at = excluded.selected_at
    `);
    this.removeStatement = this.database.prepare('DELETE FROM entry_locations WHERE entry_date = ?');
  }

  get(date) {
    if (!isValidDate(date)) throw new Error('日期无效');
    return rowToLocation(this.getStatement.get(date));
  }

  list() {
    return this.listStatement.all().map((row) => ({ date: row.entry_date, ...rowToLocation(row) }));
  }

  latest() {
    return rowToLocation(this.latestStatement.get());
  }

  save(date, value, options = {}) {
    if (!isValidDate(date)) throw new Error('日期无效');
    const location = normalizeSavedLocation(value);
    const binding = normalizeBinding(location, options);
    const selectedAt = new Date().toISOString();
    this.upsertStatement.run(
      date,
      location.provider,
      location.poiId,
      location.displayName,
      location.address,
      location.district,
      location.adcode,
      location.longitude,
      location.latitude,
      location.coordinateSystem,
      binding.sourceLabel,
      binding.sourceKey,
      binding.bindingMode,
      binding.resolutionMethod,
      binding.migrationRunId,
      selectedAt
    );
    this.database.prepare('DELETE FROM migration_exclusions WHERE entry_date = ?').run(date);
    return { ...location, ...binding, selectedAt };
  }

  remove(date) {
    if (!isValidDate(date)) throw new Error('日期无效');
    return this.removeStatement.run(date).changes > 0;
  }

  moveToTrash(date, trashId) {
    if (!isValidDate(date) || typeof trashId !== 'string' || !trashId) throw new Error('回收地点信息无效');
    this.database.exec('BEGIN IMMEDIATE');
    try {
      this.database.prepare(`
        INSERT OR REPLACE INTO trashed_entry_locations(trash_id, original_date, ${LOCATION_COLUMNS})
        SELECT ?, entry_date, ${LOCATION_COLUMNS}
        FROM entry_locations WHERE entry_date = ?
      `).run(trashId, date);
      const removed = this.removeStatement.run(date).changes > 0;
      this.database.exec('COMMIT');
      return removed;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  restoreFromTrash(trashId, date) {
    if (!isValidDate(date) || typeof trashId !== 'string' || !trashId) throw new Error('恢复地点信息无效');
    const row = this.database.prepare(`SELECT ${LOCATION_COLUMNS} FROM trashed_entry_locations WHERE trash_id = ?`).get(trashId);
    if (!row) return false;
    this.database.exec('BEGIN IMMEDIATE');
    try {
      this.upsertStatement.run(date, ...rowValues(row));
      this.database.prepare('DELETE FROM trashed_entry_locations WHERE trash_id = ?').run(trashId);
      this.database.exec('COMMIT');
      return true;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  removeTrashEntries(ids) {
    if (!Array.isArray(ids)) throw new TypeError('回收地点列表无效');
    const uniqueIds = [...new Set(ids.filter((id) => typeof id === 'string' && id))];
    if (!uniqueIds.length) return 0;
    const remove = this.database.prepare('DELETE FROM trashed_entry_locations WHERE trash_id = ?');
    this.database.exec('BEGIN IMMEDIATE');
    try {
      let removed = 0;
      for (const id of uniqueIds) removed += remove.run(id).changes;
      this.database.exec('COMMIT');
      return removed;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  getMigrationExclusions() {
    return this.database.prepare(`
      SELECT entry_date AS date, source_label AS sourceLabel, source_key AS sourceKey, skipped_at AS skippedAt
      FROM migration_exclusions ORDER BY entry_date
    `).all();
  }

  skipMigration(entries) {
    if (!Array.isArray(entries) || !entries.length) throw new Error('没有可跳过的地点记录');
    const skippedAt = new Date().toISOString();
    const upsert = this.database.prepare(`
      INSERT INTO migration_exclusions(entry_date, source_label, source_key, skipped_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(entry_date) DO UPDATE SET
        source_label = excluded.source_label,
        source_key = excluded.source_key,
        skipped_at = excluded.skipped_at
    `);
    this.database.exec('BEGIN IMMEDIATE');
    try {
      for (const entry of entries) {
        if (!isValidDate(entry.date) || !normalizeLocationKey(entry.sourceKey)) throw new Error('待跳过地点记录无效');
        upsert.run(entry.date, cleanString(entry.sourceLabel, 160), normalizeLocationKey(entry.sourceKey), skippedAt);
      }
      this.database.exec('COMMIT');
      return entries.length;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  resetMigrationSkips() {
    return this.database.prepare('DELETE FROM migration_exclusions').run().changes;
  }

  async backupTo(target) {
    if (typeof target !== 'string' || !target) throw new Error('地点数据库备份路径无效');
    if (existsSync(target)) throw new Error('地点数据库备份已存在');
    mkdirSync(dirname(target), { recursive: true });
    const temporary = `${target}.${process.pid}.${randomUUID().slice(0, 8)}.tmp`;
    try {
      this.database.prepare('VACUUM INTO ?').run(temporary);
      renameSync(temporary, target);
    } catch (error) {
      rmSync(temporary, { force: true });
      throw error;
    }
    return target;
  }

  applyMigration({ entries, candidate, scope, backupPath }) {
    if (!Array.isArray(entries) || !entries.length) throw new Error('没有可迁移的地点记录');
    const location = normalizeSavedLocation(candidate);
    const runId = randomUUID();
    const startedAt = new Date().toISOString();
    const resolutionMethod = scope?.type === 'single'
      ? 'migration_single'
      : scope?.type === 'range'
        ? 'migration_range'
        : 'migration_group';
    const insertLocation = this.database.prepare(`
      INSERT INTO entry_locations(entry_date, ${LOCATION_COLUMNS})
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    this.database.exec('BEGIN IMMEDIATE');
    try {
      this.database.prepare(`
        INSERT INTO migration_runs(run_id, started_at, status, backup_path)
        VALUES (?, ?, 'running', ?)
      `).run(runId, startedAt, cleanString(backupPath, 1000));
      for (const entry of entries) {
        if (!isValidDate(entry.date)) throw new Error('待迁移日期无效');
        const binding = normalizeBinding(location, {
          sourceLabel: entry.sourceLabel,
          sourceKey: entry.sourceKey,
          bindingMode: 'frontmatter',
          resolutionMethod,
          migrationRunId: runId
        });
        insertLocation.run(
          entry.date,
          location.provider,
          location.poiId,
          location.displayName,
          location.address,
          location.district,
          location.adcode,
          location.longitude,
          location.latitude,
          location.coordinateSystem,
          binding.sourceLabel,
          binding.sourceKey,
          binding.bindingMode,
          binding.resolutionMethod,
          binding.migrationRunId,
          startedAt
        );
        this.database.prepare('DELETE FROM migration_exclusions WHERE entry_date = ?').run(entry.date);
      }
      let aliasCount = 0;
      if (scope?.type !== 'single') {
        const first = entries[0];
        this.database.prepare(`
          INSERT INTO location_aliases(
            source_label, source_key, valid_from, valid_to, provider, poi_id, display_name,
            address, district, adcode, longitude, latitude, coordinate_system,
            migration_run_id, confirmed_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          cleanString(first.sourceLabel, 160),
          normalizeLocationKey(first.sourceKey),
          scope?.type === 'range' ? scope.startDate : '',
          scope?.type === 'range' ? scope.endDate : '',
          location.provider,
          location.poiId,
          location.displayName,
          location.address,
          location.district,
          location.adcode,
          location.longitude,
          location.latitude,
          location.coordinateSystem,
          runId,
          startedAt
        );
        aliasCount = 1;
      }
      this.database.prepare(`
        UPDATE migration_runs
        SET completed_at = ?, status = 'completed', created_count = ?, alias_count = ?
        WHERE run_id = ?
      `).run(startedAt, entries.length, aliasCount, runId);
      this.database.exec('COMMIT');
      return {
        runId,
        startedAt,
        completedAt: startedAt,
        status: 'completed',
        backupPath,
        createdCount: entries.length,
        aliasCount
      };
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  latestCompletedMigration() {
    return migrationRunToObject(this.database.prepare(`
      SELECT * FROM migration_runs WHERE status = 'completed'
      ORDER BY completed_at DESC, started_at DESC, rowid DESC LIMIT 1
    `).get());
  }

  undoLatestMigration() {
    const run = this.latestCompletedMigration();
    if (!run) throw new Error('没有可撤销的地点迁移');
    const undoneAt = new Date().toISOString();
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const active = this.database.prepare('DELETE FROM entry_locations WHERE migration_run_id = ?').run(run.runId).changes;
      const trashed = this.database.prepare('DELETE FROM trashed_entry_locations WHERE migration_run_id = ?').run(run.runId).changes;
      const aliases = this.database.prepare('DELETE FROM location_aliases WHERE migration_run_id = ?').run(run.runId).changes;
      this.database.prepare(`UPDATE migration_runs SET status = 'undone', undone_at = ? WHERE run_id = ?`)
        .run(undoneAt, run.runId);
      this.database.exec('COMMIT');
      return { ...run, status: 'undone', undoneAt, removedCount: active + trashed, removedAliasCount: aliases };
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  close() {
    if (!this.database) return;
    this.database.close();
    this.database = null;
  }
}
