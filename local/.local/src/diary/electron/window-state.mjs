export const DEFAULT_WINDOW_STATE = Object.freeze({
  width: 1180,
  height: 780,
  maximized: false
});

export const MIN_WINDOW_WIDTH = 720;
export const MIN_WINDOW_HEIGHT = 560;

const MAX_WINDOW_DIMENSION = 16_384;

function normalizeDimension(value, fallback, minimum) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(MAX_WINDOW_DIMENSION, Math.max(minimum, Math.round(value)));
}

export function normalizeWindowState(value = {}) {
  return {
    width: normalizeDimension(value?.width, DEFAULT_WINDOW_STATE.width, MIN_WINDOW_WIDTH),
    height: normalizeDimension(value?.height, DEFAULT_WINDOW_STATE.height, MIN_WINDOW_HEIGHT),
    maximized: value?.maximized === true
  };
}

export function captureWindowState(window) {
  const { width, height } = window.getNormalBounds();
  return normalizeWindowState({
    width,
    height,
    maximized: window.isMaximized()
  });
}

export function sameWindowState(left, right) {
  return left?.width === right?.width
    && left?.height === right?.height
    && left?.maximized === right?.maximized;
}
