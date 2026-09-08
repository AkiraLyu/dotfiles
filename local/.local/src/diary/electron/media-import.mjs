import { constants } from 'node:fs';
import { copyFile, mkdir, stat } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { DIARY_IMAGE_MIME_TYPES } from './diary-files.mjs';

export const IMPORTABLE_IMAGE_EXTENSIONS = Object.freeze(
  [...DIARY_IMAGE_MIME_TYPES.keys()].map((extension) => extension.slice(1))
);

const WINDOWS_RESERVED_FILENAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

export function safeMediaFilename(filePath) {
  const original = basename(filePath);
  const extension = extname(original).toLowerCase();
  const rawStem = original.slice(0, Math.max(0, original.length - extname(original).length));
  const normalizedStem = rawStem
    .normalize('NFC')
    .replace(/[<>:"/\\|?*#%\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^\.+|\.+$/g, '')
    .trim()
    .replace(/[. ]+$/g, '')
    .slice(0, 100) || 'image';
  const stem = WINDOWS_RESERVED_FILENAME.test(normalizedStem) ? `_${normalizedStem}` : normalizedStem;
  return `${stem}${extension}`;
}

export async function copyImageIntoDiary({ diaryRoot, date, sourcePath, maxSize }) {
  const details = await stat(sourcePath);
  if (!details.isFile()) throw new Error('请选择图片文件');
  if (details.size > maxSize) throw new Error('图片不能超过 12 MB');

  const extension = extname(sourcePath).toLowerCase().slice(1);
  if (!IMPORTABLE_IMAGE_EXTENSIONS.includes(extension)) throw new Error('不支持此图片格式');

  const directory = join(diaryRoot, '0.media', date);
  await mkdir(directory, { recursive: true });
  const safeName = safeMediaFilename(sourcePath);
  const safeExtension = extname(safeName);
  const stem = safeName.slice(0, -safeExtension.length);

  for (let suffix = 0; suffix < 10000; suffix += 1) {
    const filename = suffix ? `${stem}-${suffix + 1}${safeExtension}` : safeName;
    const target = join(directory, filename);
    try {
      await copyFile(sourcePath, target, constants.COPYFILE_EXCL);
    } catch (error) {
      if (error.code === 'EEXIST') continue;
      throw error;
    }

    return {
      filename,
      alt: stem,
      path: `../0.media/${date}/${filename}`
    };
  }
  throw new Error('同名图片过多，无法导入');
}
