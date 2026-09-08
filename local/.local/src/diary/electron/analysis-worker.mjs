import { parentPort, workerData } from 'node:worker_threads';
import { DiaryAnalysisStore } from './analysis-store.mjs';

const store = new DiaryAnalysisStore(workerData.diaryRoot);
let requestChain = Promise.resolve();

function serializeError(error) {
  return {
    message: error?.message || '分析失败',
    name: error?.name || 'Error',
    stack: error?.stack || ''
  };
}

async function handleRequest(message) {
  const { id, action, payload = {} } = message;
  try {
    let result;
    if (action === 'insights' || action === 'reindex') {
      const synchronization = await store.synchronize({
        force: action === 'reindex',
        onProgress(progress) {
          parentPort.postMessage({ type: 'progress', id, progress });
        }
      });
      result = {
        ...(await store.insights(payload)),
        synchronization
      };
    } else if (action === 'index-date') {
      result = await store.indexDate(payload.date, { force: true });
    } else if (action === 'remove-date') {
      await store.open();
      result = { date: payload.date, removed: store.removeDate(payload.date) };
    } else {
      throw new Error('不支持此分析操作');
    }
    parentPort.postMessage({ type: 'result', id, result });
  } catch (error) {
    parentPort.postMessage({ type: 'error', id, error: serializeError(error) });
  }
}

parentPort.on('message', (message) => {
  requestChain = requestChain.catch(() => undefined).then(() => handleRequest(message));
});

process.on('exit', () => store.close());
