import { Worker } from 'node:worker_threads';

export class AnalysisService {
  constructor(diaryRoot, { onProgress = () => undefined } = {}) {
    if (typeof diaryRoot !== 'string' || !diaryRoot) throw new Error('日记目录无效');
    this.diaryRoot = diaryRoot;
    this.onProgress = onProgress;
    this.worker = null;
    this.requests = new Map();
    this.nextRequestId = 1;
    this.closed = false;
  }

  #ensureWorker() {
    if (this.closed) throw new Error('分析服务已关闭');
    if (this.worker) return this.worker;
    const worker = new Worker(new URL('./analysis-worker.mjs', import.meta.url), {
      workerData: { diaryRoot: this.diaryRoot }
    });
    worker.unref();
    worker.on('message', (message) => {
      if (message.type === 'progress') {
        try {
          this.onProgress(message.progress);
        } catch (error) {
          console.error('Failed to report analysis progress:', error);
        }
        return;
      }
      const pending = this.requests.get(message.id);
      if (!pending) return;
      this.requests.delete(message.id);
      if (message.type === 'result') pending.resolve(message.result);
      else {
        const error = new Error(message.error?.message || '分析失败');
        error.name = message.error?.name || 'Error';
        error.stack = message.error?.stack || error.stack;
        pending.reject(error);
      }
    });
    worker.on('error', (error) => this.#failAll(error));
    worker.on('exit', (code) => {
      if (this.worker === worker) this.worker = null;
      if (code !== 0 && !this.closed) this.#failAll(new Error(`分析进程异常退出 (${code})`));
    });
    this.worker = worker;
    return worker;
  }

  #failAll(error) {
    for (const request of this.requests.values()) request.reject(error);
    this.requests.clear();
  }

  request(action, payload = {}) {
    const worker = this.#ensureWorker();
    const id = this.nextRequestId;
    this.nextRequestId += 1;
    return new Promise((resolve, reject) => {
      this.requests.set(id, { resolve, reject });
      try {
        worker.postMessage({ id, action, payload });
      } catch (error) {
        this.requests.delete(id);
        reject(error);
      }
    });
  }

  insights(options = {}) {
    return this.request('insights', options);
  }

  reindex(options = {}) {
    return this.request('reindex', options);
  }

  indexDate(date) {
    return this.request('index-date', { date });
  }

  removeDate(date) {
    return this.request('remove-date', { date });
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    const worker = this.worker;
    this.worker = null;
    this.#failAll(new Error('分析服务已关闭'));
    if (worker) await worker.terminate();
  }
}
