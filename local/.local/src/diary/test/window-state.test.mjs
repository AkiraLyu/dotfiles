import assert from 'node:assert/strict';
import test from 'node:test';
import {
  captureWindowState,
  DEFAULT_WINDOW_STATE,
  MIN_WINDOW_WIDTH,
  normalizeWindowState
} from '../electron/window-state.mjs';

test('window state normalization keeps valid normal dimensions and maximized state', () => {
  assert.deepEqual(normalizeWindowState({ width: 1365.7, height: 912.2, maximized: true }), {
    width: 1366,
    height: 912,
    maximized: true
  });
  assert.deepEqual(normalizeWindowState({ width: -1, height: 'bad', maximized: 'true' }), {
    width: MIN_WINDOW_WIDTH,
    height: DEFAULT_WINDOW_STATE.height,
    maximized: false
  });
  assert.deepEqual(normalizeWindowState({ width: null, height: null }), DEFAULT_WINDOW_STATE);
  assert.deepEqual(normalizeWindowState(), DEFAULT_WINDOW_STATE);
});

test('capturing a maximized window uses its normal bounds', () => {
  const state = captureWindowState({
    getNormalBounds: () => ({ x: 0, y: 0, width: 1040, height: 720 }),
    isMaximized: () => true
  });
  assert.deepEqual(state, { width: 1040, height: 720, maximized: true });
});
