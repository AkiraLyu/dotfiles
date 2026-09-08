import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createDiaryServer } from '../server.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

async function startServer(context) {
  const temporary = await mkdtemp(join(ROOT, '.server-test-'));
  const diaryRoot = join(temporary, 'Diary');
  const server = createDiaryServer(diaryRoot);
  context.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await rm(temporary, { recursive: true, force: true, maxRetries: 5 });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const request = (path, options = {}) => new Promise((resolve, reject) => {
    const outgoing = httpRequest({
      hostname: '127.0.0.1', port: server.address().port, path,
      method: options.method, setHost: false,
      headers: { Host: `127.0.0.1:${server.address().port}`, ...options.headers }
    }, async (incoming) => {
      try {
        const chunks = [];
        for await (const chunk of incoming) chunks.push(chunk);
        resolve(new Response(Buffer.concat(chunks), {
          status: incoming.statusCode, headers: incoming.headers
        }));
      } catch (error) {
        reject(error);
      }
    });
    outgoing.on('error', reject);
    outgoing.end(options.body);
  });
  const json = async (path, options, status = 200) => {
    const response = await request(path, options);
    assert.equal(response.status, status, path);
    return response.json();
  };
  return { diaryRoot, request, json };
}

test('HTTP diary saves are readable, searchable, and reflected in the gallery', async (context) => {
  const { diaryRoot, request, json } = await startServer(context);
  assert.deepEqual((await json('/api/entries')).entries, []);
  const date = '2026-08-04';
  const content = '---\n时间: 2026-08-04 09:00\n地点: 公园\n---\n\nMorning 散步';
  await json(`/api/entries/${date}`, { method: 'PUT', body: content });
  await json('/api/entries/2025-12-31', { method: 'PUT', body: '年末记录' });
  assert.equal(await readFile(join(diaryRoot, '2026', `${date}.md`), 'utf8'), content);
  assert.equal((await json(`/api/entries/${date}`)).content, content);
  assert.deepEqual((await json('/api/entries')).entries, [{ date }, { date: '2025-12-31' }]);
  assert.deepEqual((await json('/api/search?q=MORNING')).entries, [date]);
  assert.deepEqual((await json('/api/search?q=2026-08')).entries, [date]);

  const imageSource = '../0.media/2026-08-04/photo.png';
  const updated = `傍晚 阅读\n![散步](<${imageSource}> "照片")`;
  await json(`/api/entries/${date}`, { method: 'PUT', body: updated });
  assert.deepEqual((await json('/api/search?q=MORNING')).entries, []);
  assert.deepEqual((await json(`/api/search?q=${encodeURIComponent('阅读')}`)).entries, [date]);
  assert.deepEqual((await json('/api/gallery')).entries, [
    { date, images: [{ alt: '散步', source: imageSource }] }
  ]);
  const imageBytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  await mkdir(join(diaryRoot, '0.media', date), { recursive: true });
  await writeFile(join(diaryRoot, '0.media', date, 'photo.png'), imageBytes);
  const image = await request(`/api/images/${date}?src=${encodeURIComponent(imageSource)}`);
  assert.equal(image.status, 200);
  assert.equal(image.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), imageBytes);
});

test('HTTP trash preserves versions, refuses overwrite, and deletes only managed diaries', async (context) => {
  const { diaryRoot, json } = await startServer(context);
  const path = '/api/entries/2026-08-04';
  await json(path, { method: 'PUT', body: 'first version' });
  const first = await json(path, { method: 'DELETE' });
  assert.deepEqual((await json('/api/entries')).entries, []);
  assert.deepEqual((await json('/api/search?q=first')).entries, []);
  await json(path, undefined, 404);
  await json(path, { method: 'PUT', body: 'second version' });
  await json(`/api/trash/${first.id}/restore`, { method: 'POST' }, 409);
  assert.equal((await json(path)).content, 'second version');
  const second = await json(path, { method: 'DELETE' });
  assert.notEqual(first.id, second.id);
  assert.equal((await json('/api/trash')).entries.length, 2);
  await json(`/api/trash/${first.id}/restore`, { method: 'POST' });
  assert.equal((await json(path)).content, 'first version');
  assert.deepEqual((await json('/api/search?q=first')).entries, ['2026-08-04']);
  await json(`/api/trash/${second.id}`, { method: 'DELETE' });
  assert.deepEqual((await json('/api/trash')).entries, []);
  await json(path, { method: 'DELETE' });
  await writeFile(join(diaryRoot, '.Trash', 'keep.txt'), 'unmanaged');
  await json('/api/trash', { method: 'DELETE' });
  assert.deepEqual((await json('/api/trash')).entries, []);
  assert.equal(await readFile(join(diaryRoot, '.Trash', 'keep.txt'), 'utf8'), 'unmanaged');
});

test('HTTP access rejects foreign hosts, origins, invalid dates, and paths outside the library', async (context) => {
  const { request, json } = await startServer(context);
  for (const host of ['127.0.0.1:4173', 'localhost:4173', '[::1]:4173']) {
    await json('/api/entries', { headers: { Host: host } });
  }
  for (const host of ['evil.example.com', '127.0.0.1.evil.example.com:4173', '']) {
    await json('/api/entries', { headers: { Host: host } }, 403);
  }
  for (const origin of ['http://localhost:4173', 'http://127.0.0.1:4173']) {
    await json('/api/entries', { headers: { Origin: origin } });
  }
  for (const origin of ['http://evil.example.com', 'https://127.0.0.1:4173', 'null', '']) {
    await json('/api/entries', { method: 'DELETE', headers: { Origin: origin } }, 403);
  }
  await json('/api/entries/2023-02-29', { method: 'PUT', body: 'invalid' }, 400);
  await json('/api/entries/2026-13-01', undefined, 400);
  await json('/api/entries/2026-08-04', { method: 'POST' }, 405);
  await json('/%2e%2e%2fserver.mjs', undefined, 403);
  for (const source of ['../../outside.png', './unsafe.svg', 'https://example.com/photo.png']) {
    await json(`/api/images/2026-08-04?src=${encodeURIComponent(source)}`, undefined, 400);
  }
  await json('/api/images/2026-08-04?src=./missing.png', undefined, 404);
  const page = await request('/');
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type'), /^text\/html/);
  const script = await request('/app.js');
  assert.equal(script.status, 200);
  assert.match(script.headers.get('content-type'), /^text\/javascript/);
  await json('/missing.html', undefined, 404);
});

test('HTTP insights respect the requested dates and rebuilding reflects changed diary files', async (context) => {
  const { diaryRoot, json } = await startServer(context);
  await json('/api/entries/2026-08-04', { method: 'PUT', body: '# 阅读\n阅读之后散步。' });
  await json('/api/entries/2026-08-05', { method: 'PUT', body: '# 工作\n项目复盘。' });
  const filtered = await json('/api/analysis?from=2026-08-05&to=2026-08-05');
  assert.equal(filtered.summary.entryCount, 1);
  assert.equal(filtered.topTerms.some(({ term }) => term === '阅读'), false);
  assert.equal(filtered.topTerms.some(({ term }) => term === '项目'), true);
  await writeFile(join(diaryRoot, '2026', '2026-08-05.md'), '阅读 阅读 阅读。');
  const rebuilt = await json('/api/analysis/reindex', { method: 'POST' });
  assert.equal(rebuilt.summary.entryCount, 2);
  assert.equal(rebuilt.topTerms.some(({ term }) => term === '项目'), false);
  assert.ok(rebuilt.topTerms.find(({ term }) => term === '阅读').count >= 3);
});
