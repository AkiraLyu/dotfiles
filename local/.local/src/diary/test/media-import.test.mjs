import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyImageIntoDiary, safeMediaFilename } from '../electron/media-import.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

test('media filenames are safe for Markdown links and preserve supported extensions', () => {
  for (const source of ['旅行 #1%.PNG', '<>.jpg', 'CON.png', 'lpt1.JPG']) {
    const filename = safeMediaFilename(source);
    assert.equal(extname(filename), extname(source).toLowerCase());
    assert.doesNotMatch(filename, /[<>:"/\\|?*#%\u0000-\u001f]/);
    assert.doesNotMatch(filename, /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])\./i);
  }
});

test('image imports copy the source into the dated media directory without overwriting', async () => {
  const temporary = await mkdtemp(join(root, '.media-import-test-'));
  const diaryRoot = join(temporary, 'Diary');
  const source = join(temporary, 'photo.png');
  try {
    await writeFile(source, 'first image');
    const first = await copyImageIntoDiary({
      diaryRoot,
      date: '2026-08-05',
      sourcePath: source,
      maxSize: 1024
    });
    assert.equal(first.path, '../0.media/2026-08-05/photo.png');
    assert.equal(await readFile(join(diaryRoot, '0.media', '2026-08-05', first.filename), 'utf8'), 'first image');
    assert.equal(await readFile(source, 'utf8'), 'first image');

    await writeFile(source, 'second image');
    const second = await copyImageIntoDiary({
      diaryRoot,
      date: '2026-08-05',
      sourcePath: source,
      maxSize: 1024
    });
    assert.notEqual(second.path, first.path);
    assert.equal(await readFile(join(diaryRoot, '0.media', '2026-08-05', second.filename), 'utf8'), 'second image');
    assert.equal(await readFile(join(diaryRoot, '0.media', '2026-08-05', first.filename), 'utf8'), 'first image');
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
