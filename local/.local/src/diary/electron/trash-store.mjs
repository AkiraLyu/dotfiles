import { constants } from 'node:fs';
import { copyFile, lstat, mkdir, readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { diaryEntryPath, isValidDiaryDate as isValidDate } from './diary-files.mjs';

export const TRASH_DIRECTORY_NAME = '.Trash';
export const TRASH_FILE_PATTERN = /^(\d{4}-\d{2}-\d{2})(?:\.(\d+))?\.md$/;

export function parseTrashId(id) {
  if (typeof id !== 'string') return null;
  const match = TRASH_FILE_PATTERN.exec(id);
  if (!match || !isValidDate(match[1])) return null;
  return { id, date: match[1], sequence: Number(match[2] || 0) };
}

function trashDirectory(diaryRoot) {
  return join(diaryRoot, TRASH_DIRECTORY_NAME);
}

async function requireRegularFile(target, message) {
  const details = await lstat(target);
  if (!details.isFile()) {
    const error = new Error(message);
    error.code = 'EINVAL';
    throw error;
  }
}

async function moveFileWithoutOverwrite(source, target) {
  await copyFile(source, target, constants.COPYFILE_EXCL);
  try {
    await unlink(source);
  } catch (error) {
    try {
      await unlink(target);
    } catch (rollbackError) {
      if (rollbackError.code !== 'ENOENT') error.rollbackError = rollbackError;
    }
    throw error;
  }
}

export async function moveEntryToTrash(diaryRoot, date) {
  const source = diaryEntryPath(diaryRoot, date);
  const directory = trashDirectory(diaryRoot);
  await requireRegularFile(source, '日记文件无效');
  await mkdir(directory, { recursive: true });
  for (let sequence = 0; ; sequence += 1) {
    const id = sequence ? `${date}.${sequence}.md` : `${date}.md`;
    try {
      await moveFileWithoutOverwrite(source, join(directory, id));
      return { id, date, deleted: true, recoverable: true };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
  }
}

export async function listTrashEntries(diaryRoot) {
  let files;
  try {
    files = await readdir(trashDirectory(diaryRoot), { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }

  const entries = await Promise.all(files.flatMap((file) => {
    const parsed = file.isFile() ? parseTrashId(file.name) : null;
    if (!parsed) return [];
    return [lstat(join(trashDirectory(diaryRoot), parsed.id))
      .then((details) => (details.isFile() ? {
        ...parsed,
        deletedAt: new Date(details.ctimeMs).toISOString()
      } : null))
      .catch((error) => {
        if (error.code === 'ENOENT') return null;
        throw error;
      })];
  }));
  return entries.filter(Boolean).sort((left, right) => (
    right.deletedAt.localeCompare(left.deletedAt)
    || right.sequence - left.sequence
    || right.date.localeCompare(left.date)
  ));
}

export async function emptyTrashEntries(diaryRoot) {
  const directory = trashDirectory(diaryRoot);
  let files;
  try {
    files = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return { deletedCount: 0, ids: [] };
    throw error;
  }

  const ids = files.flatMap((file) => (
    file.isFile() && parseTrashId(file.name) ? [file.name] : []
  ));
  let deletedCount = 0;
  for (const id of ids) {
    try {
      await deleteTrashEntry(diaryRoot, id);
      deletedCount += 1;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return { deletedCount, ids };
}

export async function deleteTrashEntry(diaryRoot, id) {
  const parsed = parseTrashId(id);
  if (!parsed) throw new Error('回收文件无效');
  const target = join(trashDirectory(diaryRoot), parsed.id);
  try {
    await requireRegularFile(target, '回收文件无效');
    await unlink(target);
  } catch (error) {
    if (error.code === 'ENOENT') {
      const missing = new Error('回收文件不存在');
      missing.code = 'ENOENT';
      throw missing;
    }
    throw error;
  }
  return { id: parsed.id, date: parsed.date, deleted: true };
}

export async function restoreTrashEntry(diaryRoot, id) {
  const parsed = parseTrashId(id);
  if (!parsed) throw new Error('回收文件无效');
  const source = join(trashDirectory(diaryRoot), parsed.id);
  const target = diaryEntryPath(diaryRoot, parsed.date);
  await requireRegularFile(source, '回收文件无效');
  await mkdir(join(diaryRoot, parsed.date.slice(0, 4)), { recursive: true });
  try {
    await moveFileWithoutOverwrite(source, target);
  } catch (error) {
    if (!['EEXIST', 'EISDIR', 'ENOTEMPTY'].includes(error.code)) throw error;
    const conflict = new Error('该日期已有日记，无法恢复');
    conflict.status = 409;
    throw conflict;
  }
  return { id: parsed.id, date: parsed.date, restored: true };
}
