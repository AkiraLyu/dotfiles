import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AnalysisService } from './electron/analysis-service.mjs';
import {
  DIARY_IMAGE_MIME_TYPES,
  DIARY_IO_CONCURRENCY,
  MAX_DIARY_CONTENT_BYTES,
  MAX_DIARY_IMAGE_BYTES,
  SearchTextCache,
  diaryEntryPath,
  isValidDiaryDate as isValidDate,
  listDiaryDates,
  listDiaryImageEntries,
  mapWithConcurrency,
  resolveDiaryImagePath,
  writeFileAtomically
} from './electron/diary-files.mjs';
import {
  deleteTrashEntry,
  emptyTrashEntries,
  listTrashEntries,
  moveEntryToTrash,
  restoreTrashEntry
} from './electron/trash-store.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PUBLIC_ROOT = join(ROOT, 'public');
const PORT = Number.parseInt(process.env.PORT || '4173', 10);
const HOST = process.env.HOST || '127.0.0.1';
const ALLOWED_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]', HOST.toLowerCase()]);

function requestHostname(value) {
  if (typeof value !== 'string') return '';
  const header = value.trim().toLowerCase();
  if (header.startsWith('[')) return /\[[^\]]*\]/.exec(header)?.[0] || '';
  return header.split(':', 1)[0];
}

function isAllowedHostHeader(value) {
  return ALLOWED_HOSTNAMES.has(requestHostname(value));
}

function isAllowedOrigin(value) {
  if (value === undefined) return true;
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' && isAllowedHostHeader(url.host);
  } catch {
    return false;
  }
}

const MIME_TYPES = {
  ...Object.fromEntries(DIARY_IMAGE_MIME_TYPES),
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json; charset=utf-8'
};

function sendJson(response, status, data) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  response.end(JSON.stringify(data));
}

function sendError(response, status, message) {
  sendJson(response, status, { error: message });
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_DIARY_CONTENT_BYTES) {
      const error = new Error('日记内容不能超过 2 MB');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function safeStaticPath(pathname) {
  const decoded = decodeURIComponent(pathname);
  const target = resolve(PUBLIC_ROOT, `.${decoded === '/' ? '/index.html' : decoded}`);
  if (target !== PUBLIC_ROOT && !target.startsWith(`${PUBLIC_ROOT}${sep}`)) return null;
  return target;
}

async function serveStatic(response, pathname) {
  const filePath = safeStaticPath(pathname);
  if (!filePath) {
    sendError(response, 403, '禁止访问');
    return;
  }

  try {
    const content = await readFile(filePath);
    response.writeHead(200, {
      'Content-Type': MIME_TYPES[extname(filePath)] || 'application/octet-stream',
      'Cache-Control': extname(filePath) === '.html' ? 'no-cache' : 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff'
    });
    response.end(content);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'EISDIR') {
      sendError(response, 404, '页面不存在');
    } else {
      throw error;
    }
  }
}

export function createDiaryServer(diaryRoot = join(ROOT, 'Diary')) {
  const searchTextCache = new SearchTextCache();
  let trashMutationChain = Promise.resolve();
  const analysisService = new AnalysisService(diaryRoot);

  function queueTrashMutation(task) {
    const result = trashMutationChain.then(task);
    trashMutationChain = result.catch(() => undefined);
    return result;
  }

  async function listEntries() {
    const dates = await listDiaryDates(diaryRoot, { create: true, descending: true });
    searchTextCache.prune(dates);
    return dates;
  }

  async function searchEntries(query) {
    const needle = query.trim().toLocaleLowerCase('zh-CN').slice(0, 200);
    if (!needle) return listEntries();
    const entries = await listEntries();
    const matches = await mapWithConcurrency(entries, DIARY_IO_CONCURRENCY, async (date) => {
      try {
        let searchable = searchTextCache.get(date);
        if (!searchable) {
          const content = await readFile(diaryEntryPath(diaryRoot, date), 'utf8');
          searchable = `${date}\n${content}`.toLocaleLowerCase('zh-CN');
          searchTextCache.set(date, searchable);
        }
        return searchable.includes(needle) ? date : null;
      } catch (error) {
        if (error.code === 'ENOENT') return null;
        throw error;
      }
    });
    return matches.filter(Boolean);
  }

  async function handleApi(request, response, url) {
    if (
      (url.pathname === '/api/analysis' && request.method === 'GET')
      || (url.pathname === '/api/analysis/reindex' && request.method === 'POST')
    ) {
      const options = {
        startDate: url.searchParams.get('from') || '',
        endDate: url.searchParams.get('to') || '',
        termLimit: Number(url.searchParams.get('terms')) || 40
      };
      const insights = request.method === 'POST'
        ? await analysisService.reindex(options)
        : await analysisService.insights(options);
      sendJson(response, 200, insights);
      return true;
    }

    const imageMatch = /^\/api\/images\/(\d{4}-\d{2}-\d{2})$/.exec(url.pathname);
    if (imageMatch && request.method === 'GET') {
      const image = resolveDiaryImagePath(diaryRoot, imageMatch[1], url.searchParams.get('src') || '');
      if (!image) {
        sendError(response, 400, '图片路径无效');
        return true;
      }
      try {
        const content = await readFile(image.target);
        if (content.length > MAX_DIARY_IMAGE_BYTES) {
          sendError(response, 413, '图片不能超过 12 MB');
          return true;
        }
        response.writeHead(200, {
          'Content-Type': image.mimeType,
          'Cache-Control': 'private, max-age=300',
          'X-Content-Type-Options': 'nosniff'
        });
        response.end(content);
      } catch (error) {
        if (error.code === 'ENOENT') sendError(response, 404, '图片不存在');
        else throw error;
      }
      return true;
    }

    if (url.pathname === '/api/search' && request.method === 'GET') {
      sendJson(response, 200, { entries: await searchEntries(url.searchParams.get('q') || '') });
      return true;
    }

    if (url.pathname === '/api/gallery' && request.method === 'GET') {
      sendJson(response, 200, { entries: await listDiaryImageEntries(diaryRoot, await listEntries()) });
      return true;
    }

    if (url.pathname === '/api/entries' && request.method === 'GET') {
      const dates = await listEntries();
      sendJson(response, 200, { entries: dates.map((date) => ({ date })) });
      return true;
    }

    if (url.pathname === '/api/trash' && request.method === 'GET') {
      sendJson(response, 200, { entries: await listTrashEntries(diaryRoot) });
      return true;
    }

    if (url.pathname === '/api/trash' && request.method === 'DELETE') {
      sendJson(response, 200, await queueTrashMutation(() => emptyTrashEntries(diaryRoot)));
      return true;
    }

    const deleteTrashMatch = /^\/api\/trash\/([^/]+)$/.exec(url.pathname);
    if (deleteTrashMatch && request.method === 'DELETE') {
      const id = decodeURIComponent(deleteTrashMatch[1]);
      try {
        const result = await queueTrashMutation(() => deleteTrashEntry(diaryRoot, id));
        sendJson(response, 200, result);
      } catch (error) {
        if (error.code === 'ENOENT') sendError(response, 404, error.message);
        else throw error;
      }
      return true;
    }

    const restoreMatch = /^\/api\/trash\/([^/]+)\/restore$/.exec(url.pathname);
    if (restoreMatch && request.method === 'POST') {
      const id = decodeURIComponent(restoreMatch[1]);
      try {
        const result = await queueTrashMutation(() => restoreTrashEntry(diaryRoot, id));
        sendJson(response, 200, result);
      } catch (error) {
        if (error.code === 'ENOENT') sendError(response, 404, '回收文件不存在');
        else if (error.status === 409) sendError(response, 409, error.message);
        else throw error;
      }
      return true;
    }

    const match = /^\/api\/entries\/(\d{4}-\d{2}-\d{2})$/.exec(url.pathname);
    if (!match) return false;
    const date = match[1];
    if (!isValidDate(date)) {
      sendError(response, 400, '日期无效');
      return true;
    }
    const filePath = diaryEntryPath(diaryRoot, date);

    if (request.method === 'GET') {
      try {
        const content = await readFile(filePath, 'utf8');
        searchTextCache.set(date, `${date}\n${content}`.toLocaleLowerCase('zh-CN'));
        sendJson(response, 200, { date, content });
      } catch (error) {
        if (error.code === 'ENOENT') sendError(response, 404, '日记不存在');
        else throw error;
      }
      return true;
    }

    if (request.method === 'PUT') {
      const content = await readBody(request);
      await writeFileAtomically(filePath, content);
      searchTextCache.set(date, `${date}\n${content}`.toLocaleLowerCase('zh-CN'));
      sendJson(response, 200, { date, saved: true });
      return true;
    }

    if (request.method === 'DELETE') {
      try {
        const result = await queueTrashMutation(() => moveEntryToTrash(diaryRoot, date));
        searchTextCache.delete(date);
        sendJson(response, 200, result);
      } catch (error) {
        if (error.code === 'ENOENT') sendError(response, 404, '日记不存在');
        else throw error;
      }
      return true;
    }

    sendError(response, 405, '不支持此请求方式');
    return true;
  }

  const server = createServer(async (request, response) => {
    try {
      if (!isAllowedHostHeader(request.headers.host) || !isAllowedOrigin(request.headers.origin)) {
        sendError(response, 403, '禁止访问');
        return;
      }
      const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
      if (url.pathname.startsWith('/api/')) {
        const handled = await handleApi(request, response, url);
        if (!handled) sendError(response, 404, '接口不存在');
        return;
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        sendError(response, 405, '不支持此请求方式');
        return;
      }
      await serveStatic(response, url.pathname);
    } catch (error) {
      console.error(error);
      if (!response.headersSent) {
        if (error.status) sendError(response, error.status, error.message || '请求失败');
        else sendError(response, 500, '服务器内部错误');
      } else {
        response.end();
      }
    }
  });

  server.on('close', () => {
    void analysisService.close();
  });

  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  createDiaryServer().listen(PORT, HOST, () => {
    console.log(`Daylight Diary is running at http://${HOST}:${PORT}`);
  });
}
