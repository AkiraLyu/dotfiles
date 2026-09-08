import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { diaryEntryPath, isValidDiaryDate, listDiaryDates } from './diary-files.mjs';
import { extractLocationMetadata, normalizeLocationKey } from './location-metadata.mjs';
import { LOCATION_DATABASE_NAME, LOCATION_DIRECTORY_NAME } from './location-store.mjs';

export const ANALYSIS_DIRECTORY_NAME = '.shiguang';
export const ANALYSIS_DATABASE_NAME = 'analysis.sqlite3';
export const ANALYSIS_SCHEMA_VERSION = 2;
export const ANALYZER_VERSION = '4';

const MAX_TERM_LENGTH = 40;
const TOP_ASSOCIATION_TERMS = 30;

const DEFAULT_STOP_WORDS = new Set([
  '的', '了', '和', '与', '及', '以及', '是', '在', '有', '也', '都', '就', '又', '还', '很', '太', '更', '最',
  '把', '被', '让', '给', '对', '向', '从', '到', '为', '而', '或', '并', '但', '但是', '因为', '所以', '如果',
  '然后', '而且', '不过', '其实', '已经', '仍然', '没有', '不是', '可以', '可能', '需要', '应该', '能够',
  '一个', '一些', '一种', '这个', '那个', '这些', '那些', '这里', '那里', '这样', '那样', '什么', '怎么', '为什么',
  '我', '你', '他', '她', '它', '我们', '你们', '他们', '她们', '它们', '自己', '别人', '大家',
  '今天', '昨天', '明天', '现在', '时候', '事情', '东西', '感觉', '觉得', '真的', '一下', '一点', '一次',
  'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'to', 'of', 'in', 'on', 'for', 'with', 'this',
  'that', 'it', 'i', 'you', 'he', 'she', 'we', 'they', 'my', 'your', 'our', 'their'
]);

const wordSegmenter = new Intl.Segmenter('zh-CN', { granularity: 'word' });
const sentenceSegmenter = new Intl.Segmenter('zh-CN', { granularity: 'sentence' });

function stripLeadingFrontmatter(content) {
  return content.replace(/^---[ \t]*\n[\s\S]*?\n---[ \t]*(?:\n|$)/, '');
}

export function extractDiaryLocation(content) {
  return extractLocationMetadata(content).sourceLabel;
}

export function cleanMarkdownForAnalysis(content) {
  let text = String(content || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  text = stripLeadingFrontmatter(text)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?^ {0,3}\1[ \t]*$/gm, ' ')
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .replace(/\\\[[\s\S]*?\\\]/g, ' ')
    .replace(/!\[([^\]]*)\]\((?:<[^>]+>|[^\s)]+)(?:\s+["'][^"']*["'])?\)/g, ' $1 ')
    .replace(/\[([^\]]+)\]\((?:<[^>]+>|[^\s)]+)(?:\s+["'][^"']*["'])?\)/g, ' $1 ')
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, ' $1 ')
    .replace(/`[^`\n]*`/g, ' ')
    .replace(/\$[^$\n]+\$/g, ' ')
    .replace(/<https?:\/\/[^>]+>/gi, ' ')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/^\s{0,3}(?:#{1,6}|>|[-+*]|\d+[.)])\s+/gm, '')
    .replace(/[|*_~]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n');
  return text.trim();
}

function normalizeTerm(value) {
  return value.normalize('NFKC').toLocaleLowerCase('zh-CN').trim();
}

function isUsefulTerm(term) {
  const characters = [...term];
  if (!characters.length || characters.length > MAX_TERM_LENGTH) return false;
  if (DEFAULT_STOP_WORDS.has(term)) return false;
  if (/^[\p{Number}\s.,:%+\-/]+$/u.test(term)) return false;
  if (!/[\p{Letter}\p{Script=Han}]/u.test(term)) return false;
  if (/^[a-z]$/i.test(term)) return false;
  return true;
}

export function analyzeDiaryContent(content) {
  const text = cleanMarkdownForAnalysis(content);
  const termCounts = new Map();
  let wordCount = 0;
  let singleHanRun = [];

  function addTerm(term) {
    if (isUsefulTerm(term)) termCounts.set(term, (termCounts.get(term) || 0) + 1);
  }

  function flushSingleHanRun() {
    if (singleHanRun.length === 1) {
      addTerm(singleHanRun[0]);
    } else if (singleHanRun.length >= 2) {
      const compound = singleHanRun.join('');
      if ([...compound].length <= 6) addTerm(compound);
      else {
        for (let index = 0; index < singleHanRun.length - 1; index += 1) {
          addTerm(`${singleHanRun[index]}${singleHanRun[index + 1]}`);
        }
      }
    }
    singleHanRun = [];
  }

  for (const segment of wordSegmenter.segment(text)) {
    if (!segment.isWordLike) {
      flushSingleHanRun();
      continue;
    }
    const term = normalizeTerm(segment.segment);
    if (!term) continue;
    wordCount += 1;
    if (/^\p{Script=Han}$/u.test(term) && !DEFAULT_STOP_WORDS.has(term)) {
      singleHanRun.push(term);
    } else {
      flushSingleHanRun();
      addTerm(term);
    }
  }
  flushSingleHanRun();

  let sentenceCount = 0;
  for (const segment of sentenceSegmenter.segment(text)) {
    if (segment.segment.trim()) sentenceCount += 1;
  }

  const paragraphCount = text ? text.split(/\n+/).filter((line) => line.trim()).length : 0;
  const characterCount = [...text.replace(/\s/gu, '')].length;
  return {
    characterCount,
    paragraphCount,
    sentenceCount,
    termCounts,
    uniqueTermCount: termCounts.size,
    wordCount
  };
}

function contentHash(content) {
  return createHash('sha256').update(content).digest('hex');
}

function dateRange(startDate, endDate, column = 'date') {
  if (startDate && !isValidDiaryDate(startDate)) throw new Error('开始日期无效');
  if (endDate && !isValidDiaryDate(endDate)) throw new Error('结束日期无效');
  if (startDate && endDate && startDate > endDate) throw new Error('开始日期不能晚于结束日期');
  const clauses = [];
  const values = [];
  if (startDate) {
    clauses.push(`${column} >= ?`);
    values.push(startDate);
  }
  if (endDate) {
    clauses.push(`${column} <= ?`);
    values.push(endDate);
  }
  return { sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', values };
}

function numberValue(value) {
  return Number(value || 0);
}

function dayNumber(date) {
  return Math.trunc(new Date(`${date}T00:00:00Z`).getTime() / 86_400_000);
}

function streakSummary(dates) {
  if (!dates.length) return { longest: 0, current: 0 };
  let longest = 1;
  let running = 1;
  for (let index = 1; index < dates.length; index += 1) {
    running = dayNumber(dates[index]) - dayNumber(dates[index - 1]) === 1 ? running + 1 : 1;
    longest = Math.max(longest, running);
  }
  const latest = dates.at(-1);
  const today = new Date();
  const todayKey = [today.getFullYear(), today.getMonth() + 1, today.getDate()]
    .map((part, index) => index ? String(part).padStart(2, '0') : String(part))
    .join('-');
  const latestDistance = dayNumber(todayKey) - dayNumber(latest);
  let current = latestDistance >= 0 && latestDistance <= 1 ? 1 : 0;
  for (let index = dates.length - 1; current && index > 0; index -= 1) {
    if (dayNumber(dates[index]) - dayNumber(dates[index - 1]) !== 1) break;
    current += 1;
  }
  return { longest, current };
}

function inclusiveDays(startDate, endDate) {
  if (!startDate || !endDate) return 0;
  return dayNumber(endDate) - dayNumber(startDate) + 1;
}

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(Number(value || 0) * factor) / factor;
}

function readConfirmedLocations(diaryRoot, startDate, endDate) {
  const databasePath = join(diaryRoot, LOCATION_DIRECTORY_NAME, LOCATION_DATABASE_NAME);
  if (!existsSync(databasePath)) return { available: false, path: databasePath, rows: [] };
  let database;
  try {
    database = new DatabaseSync(databasePath, { readOnly: true });
    const columns = new Set(database.prepare('PRAGMA table_info(entry_locations)').all().map((row) => row.name));
    const sourceKeyColumn = columns.has('source_key') ? 'source_key' : 'display_name';
    const range = dateRange(startDate, endDate, 'entry_date');
    const rows = database.prepare(`
      SELECT
        entry_date AS date,
        display_name AS name,
        ${sourceKeyColumn} AS sourceKey,
        address,
        district,
        adcode,
        longitude,
        latitude,
        coordinate_system AS coordinateSystem
      FROM entry_locations ${range.sql}
      ORDER BY entry_date
    `).all(...range.values);
    return { available: true, path: databasePath, rows };
  } catch (error) {
    console.warn('Failed to read location coordinates for insights:', error.message);
    return { available: false, path: databasePath, rows: [] };
  } finally {
    database?.close();
  }
}

function locationInsights({ database, diaryRoot, startDate, endDate, entryCount }) {
  const range = dateRange(startDate, endDate, 'date');
  const rows = database.prepare(`
    SELECT date, location_name AS name
    FROM document_locations ${range.sql}
    ORDER BY date
  `).all(...range.values);
  const locationsByDate = new Map(rows.map((row) => [row.date, row.name]));
  const counts = new Map();
  for (const row of rows) counts.set(row.name, (counts.get(row.name) || 0) + 1);

  const confirmed = readConfirmedLocations(diaryRoot, startDate, endDate);
  const confirmedRows = confirmed.rows.filter((row) => (
    normalizeLocationKey(locationsByDate.get(row.date)) === normalizeLocationKey(row.sourceKey)
  ));
  const confirmedCounts = new Map();
  const districtCounts = new Map();
  const coordinateGroups = new Map();
  for (const row of confirmedRows) {
    const name = locationsByDate.get(row.date);
    confirmedCounts.set(name, (confirmedCounts.get(name) || 0) + 1);
    const district = normalizeLocationKey(row.district);
    if (district) districtCounts.set(district, (districtCounts.get(district) || 0) + 1);
    const longitude = Number(row.longitude);
    const latitude = Number(row.latitude);
    if (
      row.coordinateSystem !== 'gcj02'
      || !Number.isFinite(longitude)
      || longitude < -180
      || longitude > 180
      || !Number.isFinite(latitude)
      || latitude < -90
      || latitude > 90
    ) continue;
    const identity = `${longitude.toFixed(6)},${latitude.toFixed(6)}`;
    if (!coordinateGroups.has(identity)) {
      coordinateGroups.set(identity, {
        longitude,
        latitude,
        coordinateSystem: 'gcj02',
        canonicalNames: new Map(),
        sourceNames: new Set(),
        addresses: new Map(),
        districts: new Map(),
        dates: []
      });
    }
    const group = coordinateGroups.get(identity);
    group.canonicalNames.set(row.name, (group.canonicalNames.get(row.name) || 0) + 1);
    group.sourceNames.add(name);
    if (row.address) group.addresses.set(row.address, (group.addresses.get(row.address) || 0) + 1);
    if (row.district) group.districts.set(row.district, (group.districts.get(row.district) || 0) + 1);
    group.dates.push(row.date);
  }

  const mostFrequent = (counts, fallback = '') => [...counts]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], 'zh-CN'))[0]?.[0] || fallback;
  const mapPoints = [...coordinateGroups.values()].map((group) => {
    const dates = group.dates.sort();
    return {
      name: mostFrequent(group.canonicalNames, [...group.sourceNames][0] || '日记地点'),
      sourceNames: [...group.sourceNames].sort((left, right) => left.localeCompare(right, 'zh-CN')),
      address: mostFrequent(group.addresses),
      district: mostFrequent(group.districts),
      longitude: group.longitude,
      latitude: group.latitude,
      coordinateSystem: group.coordinateSystem,
      entryCount: dates.length,
      firstDate: dates[0],
      lastDate: dates.at(-1)
    };
  }).sort((left, right) => right.entryCount - left.entryCount
    || left.name.localeCompare(right.name, 'zh-CN')
    || left.longitude - right.longitude
    || left.latitude - right.latitude);

  const topLocations = [...counts]
    .map(([name, count]) => ({
      name,
      entryCount: count,
      geocodedEntryCount: confirmedCounts.get(name) || 0
    }))
    .sort((left, right) => right.entryCount - left.entryCount
      || right.geocodedEntryCount - left.geocodedEntryCount
      || left.name.localeCompare(right.name, 'zh-CN'))
    .slice(0, 16);
  const districts = [...districtCounts]
    .map(([name, count]) => ({ name, entryCount: count }))
    .sort((left, right) => right.entryCount - left.entryCount || left.name.localeCompare(right.name, 'zh-CN'))
    .slice(0, 12);
  const locationEntryCount = rows.length;
  const geocodedEntryCount = confirmedRows.length;
  return {
    summary: {
      locationEntryCount,
      uniqueLocationCount: counts.size,
      geocodedEntryCount,
      unresolvedEntryCount: Math.max(0, locationEntryCount - geocodedEntryCount),
      mappableEntryCount: mapPoints.reduce((total, point) => total + point.entryCount, 0),
      uniqueCoordinateCount: mapPoints.length,
      uniqueDistrictCount: districtCounts.size,
      coverageRate: entryCount ? round(locationEntryCount / entryCount, 3) : 0,
      geocodedRate: locationEntryCount ? round(geocodedEntryCount / locationEntryCount, 3) : 0
    },
    topLocations,
    districts,
    mapPoints,
    coordinateDatabase: {
      available: confirmed.available,
      path: confirmed.path
    }
  };
}

export class DiaryAnalysisStore {
  constructor(diaryRoot) {
    if (typeof diaryRoot !== 'string' || !diaryRoot) throw new Error('日记目录无效');
    this.diaryRoot = resolve(diaryRoot);
    this.analysisDirectory = join(this.diaryRoot, ANALYSIS_DIRECTORY_NAME);
    this.databasePath = join(this.analysisDirectory, ANALYSIS_DATABASE_NAME);
    this.database = null;
  }

  async open() {
    if (this.database) return this.database;
    await mkdir(this.analysisDirectory, { recursive: true });
    const database = new DatabaseSync(this.databasePath);
    database.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA busy_timeout = 5000;
    `);
    const currentVersion = numberValue(database.prepare('PRAGMA user_version').get()?.user_version);
    if (currentVersion > ANALYSIS_SCHEMA_VERSION) {
      database.close();
      throw new Error('分析数据库来自更新版本，当前应用无法读取');
    }
    database.exec(`
      CREATE TABLE IF NOT EXISTS metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS documents (
        date TEXT PRIMARY KEY,
        mtime_ms INTEGER NOT NULL,
        size_bytes INTEGER NOT NULL,
        content_hash TEXT NOT NULL,
        character_count INTEGER NOT NULL,
        word_count INTEGER NOT NULL,
        paragraph_count INTEGER NOT NULL,
        sentence_count INTEGER NOT NULL,
        unique_term_count INTEGER NOT NULL,
        analyzer_version TEXT NOT NULL,
        indexed_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS terms (
        date TEXT NOT NULL REFERENCES documents(date) ON DELETE CASCADE,
        term TEXT NOT NULL,
        count INTEGER NOT NULL CHECK (count > 0),
        PRIMARY KEY (date, term)
      );
      CREATE TABLE IF NOT EXISTS document_locations (
        date TEXT PRIMARY KEY REFERENCES documents(date) ON DELETE CASCADE,
        location_name TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS terms_by_term ON terms(term, date);
      CREATE INDEX IF NOT EXISTS document_locations_by_name ON document_locations(location_name, date);
      PRAGMA user_version = ${ANALYSIS_SCHEMA_VERSION};
    `);
    const analyzerVersion = database.prepare('SELECT value FROM metadata WHERE key = ?').get('analyzer_version')?.value;
    if (analyzerVersion !== ANALYZER_VERSION) {
      database.exec('BEGIN IMMEDIATE; DELETE FROM documents; COMMIT;');
      database.prepare(`
        INSERT INTO metadata(key, value) VALUES('analyzer_version', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `).run(ANALYZER_VERSION);
    }
    this.database = database;
    return database;
  }

  async indexDate(date, { force = false } = {}) {
    const database = await this.open();
    const target = diaryEntryPath(this.diaryRoot, date);
    let details;
    try {
      details = await stat(target);
    } catch (error) {
      if (error.code === 'ENOENT') {
        this.removeDate(date);
        return { date, removed: true };
      }
      throw error;
    }
    if (!details.isFile()) {
      this.removeDate(date);
      return { date, removed: true };
    }
    const mtimeMs = Math.round(details.mtimeMs);
    const existing = database.prepare(`
      SELECT mtime_ms AS mtimeMs, size_bytes AS sizeBytes, content_hash AS contentHash, analyzer_version AS analyzerVersion
      FROM documents WHERE date = ?
    `).get(date);
    if (!force && existing
      && numberValue(existing.mtimeMs) === mtimeMs
      && numberValue(existing.sizeBytes) === details.size
      && existing.analyzerVersion === ANALYZER_VERSION) {
      return { date, skipped: true };
    }

    const content = await readFile(target, 'utf8');
    const hash = contentHash(content);
    if (!force && existing?.contentHash === hash && existing.analyzerVersion === ANALYZER_VERSION) {
      database.prepare('UPDATE documents SET mtime_ms = ?, size_bytes = ? WHERE date = ?')
        .run(mtimeMs, details.size, date);
      return { date, skipped: true };
    }

    const analysis = analyzeDiaryContent(content);
    const locationName = extractDiaryLocation(content);
    const indexedAt = new Date().toISOString();
    const upsertDocument = database.prepare(`
      INSERT INTO documents(
        date, mtime_ms, size_bytes, content_hash, character_count, word_count,
        paragraph_count, sentence_count, unique_term_count, analyzer_version, indexed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(date) DO UPDATE SET
        mtime_ms = excluded.mtime_ms,
        size_bytes = excluded.size_bytes,
        content_hash = excluded.content_hash,
        character_count = excluded.character_count,
        word_count = excluded.word_count,
        paragraph_count = excluded.paragraph_count,
        sentence_count = excluded.sentence_count,
        unique_term_count = excluded.unique_term_count,
        analyzer_version = excluded.analyzer_version,
        indexed_at = excluded.indexed_at
    `);
    const insertTerm = database.prepare('INSERT INTO terms(date, term, count) VALUES (?, ?, ?)');
    database.exec('BEGIN IMMEDIATE;');
    try {
      upsertDocument.run(
        date,
        mtimeMs,
        details.size,
        hash,
        analysis.characterCount,
        analysis.wordCount,
        analysis.paragraphCount,
        analysis.sentenceCount,
        analysis.uniqueTermCount,
        ANALYZER_VERSION,
        indexedAt
      );
      database.prepare('DELETE FROM terms WHERE date = ?').run(date);
      for (const [term, count] of analysis.termCounts) insertTerm.run(date, term, count);
      database.prepare('DELETE FROM document_locations WHERE date = ?').run(date);
      if (locationName) {
        database.prepare('INSERT INTO document_locations(date, location_name) VALUES (?, ?)')
          .run(date, locationName);
      }
      database.exec('COMMIT;');
    } catch (error) {
      database.exec('ROLLBACK;');
      throw error;
    }
    return { date, indexed: true };
  }

  async synchronize({ force = false, onProgress = () => undefined } = {}) {
    const database = await this.open();
    const dates = await listDiaryDates(this.diaryRoot);
    const available = new Set(dates);
    const indexedDates = database.prepare('SELECT date FROM documents').all().map((row) => row.date);
    let removed = 0;
    database.exec('BEGIN IMMEDIATE;');
    try {
      const remove = database.prepare('DELETE FROM documents WHERE date = ?');
      for (const date of indexedDates) {
        if (!available.has(date)) {
          remove.run(date);
          removed += 1;
        }
      }
      database.exec('COMMIT;');
    } catch (error) {
      database.exec('ROLLBACK;');
      throw error;
    }

    let changed = 0;
    onProgress({ phase: 'index', completed: 0, total: dates.length, changed, removed });
    for (let index = 0; index < dates.length; index += 1) {
      const result = await this.indexDate(dates[index], { force });
      if (result.indexed) changed += 1;
      if ((index + 1) % 10 === 0 || index + 1 === dates.length) {
        onProgress({ phase: 'index', completed: index + 1, total: dates.length, changed, removed });
      }
    }
    const synchronizedAt = new Date().toISOString();
    database.prepare(`
      INSERT INTO metadata(key, value) VALUES('last_synchronized_at', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(synchronizedAt);
    return { total: dates.length, changed, removed, synchronizedAt };
  }

  removeDate(date) {
    if (!isValidDiaryDate(date)) throw new Error('日期无效');
    if (!this.database) return false;
    return this.database.prepare('DELETE FROM documents WHERE date = ?').run(date).changes > 0;
  }

  async insights({ startDate = '', endDate = '', termLimit = 40 } = {}) {
    const database = await this.open();
    const range = dateRange(startDate, endDate);
    const summaryRow = database.prepare(`
      SELECT
        COUNT(*) AS entryCount,
        COALESCE(SUM(character_count), 0) AS characterCount,
        COALESCE(SUM(word_count), 0) AS wordCount,
        COALESCE(SUM(paragraph_count), 0) AS paragraphCount,
        COALESCE(SUM(sentence_count), 0) AS sentenceCount,
        MIN(date) AS firstDate,
        MAX(date) AS lastDate
      FROM documents ${range.sql}
    `).get(...range.values);
    const dates = database.prepare(`SELECT date, word_count AS wordCount FROM documents ${range.sql} ORDER BY date`)
      .all(...range.values);
    const entryCount = numberValue(summaryRow.entryCount);
    const characterCount = numberValue(summaryRow.characterCount);
    const wordCount = numberValue(summaryRow.wordCount);
    const calendarDays = inclusiveDays(
      startDate || summaryRow.firstDate,
      endDate || summaryRow.lastDate
    );
    const streaks = streakSummary(dates.map((row) => row.date));

    const monthly = database.prepare(`
      SELECT
        substr(date, 1, 7) AS month,
        COUNT(*) AS entryCount,
        SUM(character_count) AS characterCount,
        SUM(word_count) AS wordCount
      FROM documents ${range.sql}
      GROUP BY month
      ORDER BY month
    `).all(...range.values).map((row) => ({
      month: row.month,
      entryCount: numberValue(row.entryCount),
      characterCount: numberValue(row.characterCount),
      wordCount: numberValue(row.wordCount)
    }));

    const termRange = dateRange(startDate, endDate, 'terms.date');
    const safeTermLimit = Math.min(100, Math.max(10, Math.trunc(Number(termLimit) || 40)));
    const topTerms = database.prepare(`
      SELECT term, SUM(count) AS count, COUNT(*) AS documentCount
      FROM terms ${termRange.sql}
      GROUP BY term
      HAVING length(term) > 1 OR SUM(count) >= 3 OR COUNT(*) >= 2
      ORDER BY count DESC, documentCount DESC, term ASC
      LIMIT ?
    `).all(...termRange.values, safeTermLimit).map((row) => ({
      term: row.term,
      count: numberValue(row.count),
      documentCount: numberValue(row.documentCount),
      documentRatio: entryCount ? round(numberValue(row.documentCount) / entryCount, 3) : 0
    }));

    const weekdays = Array.from({ length: 7 }, (_, index) => ({ index, entryCount: 0, wordCount: 0 }));
    for (const row of dates) {
      const sundayFirst = new Date(`${row.date}T00:00:00Z`).getUTCDay();
      const mondayFirst = (sundayFirst + 6) % 7;
      weekdays[mondayFirst].entryCount += 1;
      weekdays[mondayFirst].wordCount += numberValue(row.wordCount);
    }

    const associations = this.#associations({
      database,
      startDate,
      endDate,
      entryCount,
      topTerms
    });
    const locations = locationInsights({
      database,
      diaryRoot: this.diaryRoot,
      startDate,
      endDate,
      entryCount
    });
    const indexedEntries = numberValue(database.prepare('SELECT COUNT(*) AS count FROM documents').get().count);
    const synchronizedAt = database.prepare("SELECT value FROM metadata WHERE key = 'last_synchronized_at'").get()?.value || null;

    return {
      database: {
        analyzerVersion: ANALYZER_VERSION,
        path: this.databasePath,
        schemaVersion: ANALYSIS_SCHEMA_VERSION
      },
      indexedEntries,
      synchronizedAt,
      range: {
        requestedStart: startDate || null,
        requestedEnd: endDate || null,
        firstDate: summaryRow.firstDate || null,
        lastDate: summaryRow.lastDate || null
      },
      summary: {
        entryCount,
        activeDays: entryCount,
        calendarDays,
        coverageRate: calendarDays ? round(entryCount / calendarDays, 3) : 0,
        characterCount,
        wordCount,
        paragraphCount: numberValue(summaryRow.paragraphCount),
        sentenceCount: numberValue(summaryRow.sentenceCount),
        averageWordsPerEntry: entryCount ? round(wordCount / entryCount) : 0,
        longestStreak: streaks.longest,
        currentStreak: streaks.current
      },
      monthly,
      weekdays,
      locations,
      topTerms,
      associations
    };
  }

  #associations({ database, startDate, endDate, entryCount, topTerms }) {
    if (entryCount < 8 || topTerms.length < 2) return [];
    const candidates = topTerms.slice(0, TOP_ASSOCIATION_TERMS).map((item) => item.term);
    const placeholders = candidates.map(() => '?').join(', ');
    const range = dateRange(startDate, endDate, 'date');
    const clauses = [`term IN (${placeholders})`];
    if (range.sql) clauses.push(range.sql.slice(6));
    const rows = database.prepare(`
      SELECT date, term FROM terms
      WHERE ${clauses.join(' AND ')}
      ORDER BY date, term
    `).all(...candidates, ...range.values);
    const termsByDate = new Map();
    for (const row of rows) {
      if (!termsByDate.has(row.date)) termsByDate.set(row.date, []);
      termsByDate.get(row.date).push(row.term);
    }
    const documentCounts = new Map(topTerms.map((item) => [item.term, item.documentCount]));
    const pairCounts = new Map();
    for (const terms of termsByDate.values()) {
      for (let left = 0; left < terms.length; left += 1) {
        for (let right = left + 1; right < terms.length; right += 1) {
          const key = `${terms[left]}\u0000${terms[right]}`;
          pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
        }
      }
    }
    const minimumSupport = Math.max(3, Math.ceil(entryCount * 0.05));
    return [...pairCounts]
      .map(([key, supportDays]) => {
        const [left, right] = key.split('\u0000');
        const leftDays = documentCounts.get(left) || 0;
        const rightDays = documentCounts.get(right) || 0;
        return {
          left,
          right,
          supportDays,
          support: round(supportDays / entryCount, 3),
          confidenceLeft: leftDays ? round(supportDays / leftDays, 3) : 0,
          confidenceRight: rightDays ? round(supportDays / rightDays, 3) : 0,
          lift: leftDays && rightDays ? round((supportDays * entryCount) / (leftDays * rightDays), 3) : 0
        };
      })
      .filter((item) => item.supportDays >= minimumSupport && item.lift >= 1.2)
      .sort((left, right) => right.lift - left.lift || right.supportDays - left.supportDays
        || left.left.localeCompare(right.left, 'zh-CN'))
      .slice(0, 12);
  }

  close() {
    if (!this.database) return;
    try {
      this.database.exec('PRAGMA wal_checkpoint(TRUNCATE);');
    } finally {
      this.database.close();
      this.database = null;
    }
  }
}
