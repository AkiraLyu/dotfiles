import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { extractImages } from '../public/markdown-images.js';

const DIARY_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DIARY_YEAR_PATTERN = /^\d{4}$/;
export const DIARY_IO_CONCURRENCY = 12;
export const MAX_DIARY_CONTENT_BYTES = 2 * 1024 * 1024;
export const MAX_DIARY_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_SEARCH_CACHE_BYTES = 64 * 1024 * 1024;

export const DIARY_IMAGE_MIME_TYPES = new Map([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.webp', 'image/webp'],
  ['.avif', 'image/avif']
]);

export function isValidDiaryDate(value) {
  const date = String(value || '');
  const match = DIARY_DATE_PATTERN.exec(date);
  if (!match) return false;
  const [, year, month, day] = match;
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime())
    && parsed.getUTCFullYear() === Number(year)
    && parsed.getUTCMonth() + 1 === Number(month)
    && parsed.getUTCDate() === Number(day);
}

export function diaryEntryPath(diaryRoot, date) {
  if (typeof diaryRoot !== 'string' || !diaryRoot) throw new TypeError('日记目录无效');
  const dateKey = String(date || '');
  if (!isValidDiaryDate(dateKey)) throw new Error('日期无效');
  return join(diaryRoot, dateKey.slice(0, 4), `${dateKey}.md`);
}

export async function listDiaryDates(diaryRoot, { create = false, descending = false } = {}) {
  if (typeof diaryRoot !== 'string' || !diaryRoot) throw new TypeError('日记目录无效');
  if (create) await mkdir(diaryRoot, { recursive: true });

  let years;
  try {
    years = await readdir(diaryRoot, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT' && !create) return [];
    throw error;
  }

  const groups = await Promise.all(years
    .filter((entry) => entry.isDirectory() && DIARY_YEAR_PATTERN.test(entry.name))
    .map(async (year) => {
      let entries;
      try {
        entries = await readdir(join(diaryRoot, year.name), { withFileTypes: true });
      } catch (error) {
        if (error.code === 'ENOENT') return [];
        throw error;
      }
      return entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
        .map((entry) => entry.name.slice(0, -3))
        .filter((date) => date.startsWith(`${year.name}-`) && isValidDiaryDate(date));
    }));
  return groups.flat().sort((left, right) => (
    descending ? right.localeCompare(left) : left.localeCompare(right)
  ));
}

export async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  }
  const workerCount = Math.min(items.length, Math.max(1, Math.trunc(limit) || 1));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

export async function listDiaryImageEntries(diaryRoot, dates) {
  const entries = await mapWithConcurrency(dates, DIARY_IO_CONCURRENCY, async (date) => {
    try {
      const images = extractImages(await readFile(diaryEntryPath(diaryRoot, date), 'utf8'));
      return images.length ? { date, images } : null;
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  });
  return entries.filter(Boolean);
}

export function resolveDiaryImagePath(diaryRoot, date, source) {
  if (!isValidDiaryDate(date) || typeof source !== 'string' || !source || /^[a-z]+:/i.test(source)) return null;
  try {
    const root = resolve(diaryRoot);
    const relative = decodeURIComponent(source.split('#')[0].split('?')[0]);
    const target = resolve(dirname(diaryEntryPath(root, date)), relative);
    if (target !== root && !target.startsWith(`${root}${sep}`)) return null;
    const mimeType = DIARY_IMAGE_MIME_TYPES.get(extname(target).toLowerCase());
    return mimeType ? { target, mimeType } : null;
  } catch {
    return null;
  }
}

export async function writeFileAtomically(target, content, encoding = 'utf8') {
  const directory = dirname(target);
  const temporary = join(directory, `.${process.pid}.${randomUUID()}.tmp`);
  await mkdir(directory, { recursive: true });
  try {
    await writeFile(temporary, content, encoding);
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

export class SearchTextCache {
  constructor(maximumBytes = MAX_SEARCH_CACHE_BYTES) {
    if (!Number.isSafeInteger(maximumBytes) || maximumBytes <= 0) throw new TypeError('缓存大小无效');
    this.maximumBytes = maximumBytes;
    this.entries = new Map();
    this.byteSize = 0;
  }

  get(key) {
    const cached = this.entries.get(key);
    if (!cached) return null;
    this.entries.delete(key);
    this.entries.set(key, cached);
    return cached.text;
  }

  set(key, text) {
    const normalized = String(text);
    this.delete(key);
    const size = Buffer.byteLength(normalized, 'utf8');
    if (size > this.maximumBytes) return false;
    while (this.byteSize + size > this.maximumBytes && this.entries.size) {
      this.delete(this.entries.keys().next().value);
    }
    this.entries.set(key, { text: normalized, size });
    this.byteSize += size;
    return true;
  }

  delete(key) {
    const cached = this.entries.get(key);
    if (!cached) return false;
    this.byteSize -= cached.size;
    return this.entries.delete(key);
  }

  clear() {
    this.entries.clear();
    this.byteSize = 0;
  }

  prune(availableKeys) {
    const available = availableKeys instanceof Set ? availableKeys : new Set(availableKeys);
    for (const key of this.entries.keys()) {
      if (!available.has(key)) this.delete(key);
    }
  }
}
