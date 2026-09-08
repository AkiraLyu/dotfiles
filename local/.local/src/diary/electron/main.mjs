import { app, BrowserWindow, dialog, ipcMain, nativeTheme, net, protocol, safeStorage, shell } from 'electron';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { AnalysisService } from './analysis-service.mjs';
import {
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
} from './diary-files.mjs';
import { AmapLocationService, buildAmapMarkerUrl, normalizeAmapApiKey } from './location-service.mjs';
import {
  applyLocationMigration,
  resetLocationMigrationSkips,
  scanLocationMigration,
  skipLocationMigration,
  undoLatestLocationMigration
} from './location-migration.mjs';
import { extractLocationMetadata } from './location-metadata.mjs';
import {
  DiaryLocationStore,
  locationDatabasePath,
  locationMatchesSource,
  normalizeSavedLocation
} from './location-store.mjs';
import { copyImageIntoDiary, IMPORTABLE_IMAGE_EXTENSIONS } from './media-import.mjs';
import {
  deleteTrashEntry,
  emptyTrashEntries,
  listTrashEntries,
  moveEntryToTrash,
  restoreTrashEntry
} from './trash-store.mjs';
import {
  captureWindowState,
  DEFAULT_WINDOW_STATE,
  MIN_WINDOW_HEIGHT,
  MIN_WINDOW_WIDTH,
  normalizeWindowState,
  sameWindowState
} from './window-state.mjs';

if (process.platform === 'linux') app.commandLine.appendSwitch('xdg-portal-required');
if (process.platform === 'win32') app.setAppUserModelId('dev.local.shiguang.diary');
protocol.registerSchemesAsPrivileged([
  { scheme: 'diary-image', privileges: { standard: true, secure: true, stream: true } },
  { scheme: 'diary-map', privileges: { standard: true, secure: true, stream: true } }
]);

const APP_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const APP_INDEX_URL = pathToFileURL(join(APP_ROOT, 'public', 'index.html')).href;
const MAX_LOCATION_MAP_SNAPSHOTS = 6;
const LOCATION_MAP_SNAPSHOT_TTL = 10 * 60 * 1000;
const BACKGROUND_TRANSPARENCY_MAX = 100;
const BACKGROUND_TRANSPARENCY_STEP = 5;
const WINDOW_TITLEBAR_CSS_HEIGHT = 68;
const WINDOWS_BACKGROUND_MATERIAL = 'acrylic';
const PASSWORD_STORES = new Set(['auto', 'kwallet', 'kwallet5', 'kwallet6', 'gnome-libsecret']);
const DEFAULT_CONFIG = Object.freeze({
  diaryRoot: null,
  zoom: 110,
  backgroundTransparency: 0,
  showNavigator: false,
  darkMode: false,
  passwordStore: 'auto',
  amapKeyEncrypted: '',
  amapKey: '',
  windowState: DEFAULT_WINDOW_STATE
});

const startupPasswordStore = readStartupPasswordStore();
if (
  process.platform === 'linux'
  && startupPasswordStore !== 'auto'
  && !app.commandLine.hasSwitch('password-store')
) {
  app.commandLine.appendSwitch('password-store', startupPasswordStore);
}

let diaryRoot = null;
let appConfig = { ...DEFAULT_CONFIG };
let configWriteChain = Promise.resolve();
let applicationQuitRequested = false;
const searchTextCache = new SearchTextCache();
const searchTextRequests = new Map();
let diaryGeneration = 0;
let trashMutationChain = Promise.resolve();
let analysisService = null;
let locationStore = null;
let locationStoreError = '';
let locationSearchController = null;
let locationMapController = null;
let locationMutationChain = Promise.resolve();
const locationMapSnapshots = new Map();

const locationService = new AmapLocationService({
  fetchImpl: (url, options) => net.fetch(url.toString(), options),
  keyProvider: () => currentAmapKey()
});

function clearLocationMapSnapshots() {
  locationMapController?.abort();
  locationMapController = null;
  locationMapSnapshots.clear();
}

function pruneLocationMapSnapshots(now = Date.now(), { reserveSlot = false } = {}) {
  for (const [token, snapshot] of locationMapSnapshots) {
    if (now - snapshot.createdAt > LOCATION_MAP_SNAPSHOT_TTL) locationMapSnapshots.delete(token);
  }
  const maximum = reserveSlot ? MAX_LOCATION_MAP_SNAPSHOTS - 1 : MAX_LOCATION_MAP_SNAPSHOTS;
  while (locationMapSnapshots.size > maximum) {
    locationMapSnapshots.delete(locationMapSnapshots.keys().next().value);
  }
}

function coordinateIdentity(value) {
  const longitude = Number(value?.longitude);
  const latitude = Number(value?.latitude);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return '';
  return `${longitude.toFixed(6)},${latitude.toFixed(6)},${value?.coordinateSystem || 'gcj02'}`;
}

function authorizedLocationMapPoints(value) {
  if (!Array.isArray(value) || !value.length || value.length > 10) throw new Error('每张地图需要 1 至 10 个坐标点');
  const allowed = new Set((optionalLocationStore()?.list() || []).map(coordinateIdentity).filter(Boolean));
  if (!allowed.size) throw new Error('没有可显示的已确认坐标');
  return value.map((point) => {
    const identity = coordinateIdentity(point);
    if (!identity || !allowed.has(identity)) throw new Error('地图坐标与当前日记库不匹配');
    return {
      longitude: Number(point.longitude),
      latitude: Number(point.latitude),
      coordinateSystem: point.coordinateSystem || 'gcj02'
    };
  });
}

async function createLocationMapSnapshot(value) {
  const points = authorizedLocationMapPoints(value);
  locationMapController?.abort();
  const controller = new AbortController();
  locationMapController = controller;
  try {
    const snapshot = await locationService.staticMap(points, {
      width: 1024,
      height: 680,
      scale: 1,
      signal: controller.signal
    });
    pruneLocationMapSnapshots(Date.now(), { reserveSlot: true });
    const token = randomUUID();
    locationMapSnapshots.set(token, { ...snapshot, createdAt: Date.now() });
    return {
      url: `diary-map://snapshot/${token}`,
      width: snapshot.width,
      height: snapshot.height,
      pointCount: snapshot.pointCount
    };
  } finally {
    if (locationMapController === controller) locationMapController = null;
  }
}

function handleDiaryMapRequest(request) {
  try {
    const url = new URL(request.url);
    const token = decodeURIComponent(url.pathname.slice(1));
    if (url.hostname !== 'snapshot' || !/^[0-9a-f-]{36}$/i.test(token)) return new Response('', { status: 404 });
    pruneLocationMapSnapshots();
    const snapshot = locationMapSnapshots.get(token);
    if (!snapshot) return new Response('', { status: 410 });
    return new Response(snapshot.bytes, {
      status: 200,
      headers: {
        'Content-Type': snapshot.contentType,
        'Content-Length': String(snapshot.bytes.byteLength),
        'Cache-Control': 'private, max-age=600'
      }
    });
  } catch {
    return new Response('', { status: 404 });
  }
}

function broadcastAnalysisProgress(progress) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send('diary:analysis-progress', progress);
  }
}

async function replaceAnalysisService(root) {
  const previous = analysisService;
  analysisService = root ? new AnalysisService(root, { onProgress: broadcastAnalysisProgress }) : null;
  if (previous) await previous.close();
}

function requireAnalysisService() {
  const root = requireRoot();
  if (!analysisService) analysisService = new AnalysisService(root, { onProgress: broadcastAnalysisProgress });
  return analysisService;
}

function replaceLocationStore(root) {
  const previous = locationStore;
  locationStore = null;
  locationStoreError = '';
  previous?.close();
  if (!root || !existsSync(locationDatabasePath(root))) return;
  try {
    locationStore = new DiaryLocationStore(root, { create: false });
  } catch (error) {
    locationStoreError = error.message;
    console.error('Failed to open diary location database:', error);
  }
}

function optionalLocationStore() {
  const root = requireRoot();
  if (locationStore) return locationStore;
  if (!existsSync(locationDatabasePath(root))) return null;
  try {
    locationStore = new DiaryLocationStore(root, { create: false });
    locationStoreError = '';
    return locationStore;
  } catch (error) {
    locationStoreError = error.message;
    console.error('Failed to open diary location database:', error);
    return null;
  }
}

function requireLocationStore() {
  const root = requireRoot();
  if (locationStore) return locationStore;
  try {
    locationStore = new DiaryLocationStore(root);
    locationStoreError = '';
  } catch (error) {
    locationStoreError = error.message;
    throw error;
  }
  return locationStore;
}

function queueLocationMutation(task) {
  const request = locationMutationChain.catch(() => undefined).then(task);
  locationMutationChain = request.catch(() => undefined);
  return request;
}

function analysisOptions(value = {}) {
  return {
    startDate: typeof value?.startDate === 'string' ? value.startDate : '',
    endDate: typeof value?.endDate === 'string' ? value.endDate : '',
    termLimit: Number(value?.termLimit) || 40
  };
}

function refreshAnalysisDate(date) {
  if (!analysisService) return;
  void analysisService.indexDate(date).catch((error) => console.error('Failed to update analysis index:', error));
}

function removeAnalysisDate(date) {
  if (!analysisService) return;
  void analysisService.removeDate(date).catch((error) => console.error('Failed to update analysis index:', error));
}

function queueTrashMutation(task) {
  const request = trashMutationChain.catch(() => undefined).then(task);
  trashMutationChain = request.catch(() => undefined);
  return request;
}

function removeTrashLocations(root, ids) {
  if (diaryRoot !== root) return;
  try {
    optionalLocationStore()?.removeTrashEntries(ids);
  } catch (error) {
    console.error('Failed to clear trashed diary locations:', error);
  }
}

function resetSearchCache() {
  diaryGeneration += 1;
  searchTextCache.clear();
  searchTextRequests.clear();
}

function configPath() {
  return join(app.getPath('userData'), 'config.json');
}

function normalizePasswordStore(value) {
  return PASSWORD_STORES.has(value) ? value : 'auto';
}

function readStartupPasswordStore() {
  if (process.platform !== 'linux') return 'auto';
  const commandLineValue = app.commandLine.getSwitchValue('password-store');
  if (PASSWORD_STORES.has(commandLineValue) && commandLineValue !== 'auto') return commandLineValue;
  try {
    const config = JSON.parse(readFileSync(configPath(), 'utf8'));
    return normalizePasswordStore(config.passwordStore);
  } catch {
    return 'auto';
  }
}

function normalizeBackgroundTransparency(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return 0;
  return Math.min(
    BACKGROUND_TRANSPARENCY_MAX,
    Math.max(0, Math.round(numericValue / BACKGROUND_TRANSPARENCY_STEP) * BACKGROUND_TRANSPARENCY_STEP)
  );
}

function normalizeConfig(value = {}) {
  const zoom = Number(value.zoom);
  let amapKey = '';
  try {
    if (typeof value.amapKey === 'string' && value.amapKey.trim()) {
      amapKey = normalizeAmapApiKey(value.amapKey);
    }
  } catch {}
  const encryptedKey = typeof value.amapKeyEncrypted === 'string'
    && value.amapKeyEncrypted.length <= 16_384
    && /^[A-Za-z0-9_-]*$/.test(value.amapKeyEncrypted)
    ? value.amapKeyEncrypted
    : '';
  return {
    diaryRoot: typeof value.diaryRoot === 'string' && value.diaryRoot ? value.diaryRoot : null,
    zoom: Number.isFinite(zoom) ? Math.min(150, Math.max(80, Math.round(zoom / 5) * 5)) : 110,
    backgroundTransparency: normalizeBackgroundTransparency(value.backgroundTransparency),
    showNavigator: typeof value.showNavigator === 'boolean' ? value.showNavigator : false,
    darkMode: typeof value.darkMode === 'boolean' ? value.darkMode : false,
    passwordStore: process.platform === 'linux' ? normalizePasswordStore(value.passwordStore) : 'auto',
    amapKeyEncrypted: encryptedKey,
    amapKey: encryptedKey ? '' : amapKey,
    windowState: normalizeWindowState(value.windowState)
  };
}

function windowControlsOverlayOptions() {
  return {
    color: '#00000000',
    symbolColor: appConfig.darkMode ? '#ebe3ec' : '#242228',
    height: Math.round(WINDOW_TITLEBAR_CSS_HEIGHT * appConfig.zoom / 100)
  };
}

function windowsBackgroundMaterial() {
  return appConfig.backgroundTransparency > 0 ? WINDOWS_BACKGROUND_MATERIAL : 'none';
}

function applyWindowsWindowAppearance(window) {
  if (process.platform !== 'win32' || !window || window.isDestroyed()) return;
  window.setTitleBarOverlay(windowControlsOverlayOptions());
  window.setBackgroundMaterial(windowsBackgroundMaterial());
}

function environmentAmapKey() {
  return typeof process.env.SHIGUANG_AMAP_KEY === 'string'
    ? process.env.SHIGUANG_AMAP_KEY.trim()
    : '';
}

function keyringStatus() {
  const backend = process.platform === 'linux' ? safeStorage.getSelectedStorageBackend() : 'system';
  const encryptionAvailable = safeStorage.isEncryptionAvailable();
  return {
    backend,
    encryptionAvailable: encryptionAvailable && !['basic_text', 'unknown'].includes(backend)
  };
}

function requireKeyring() {
  const status = keyringStatus();
  if (!status.encryptionAvailable) {
    const suffix = process.platform === 'linux' ? `（当前后端：${status.backend}）` : '';
    throw new Error(`系统密钥服务不可用${suffix}，请检查密钥环设置并重启应用`);
  }
  return status;
}

function encryptAmapKey(value) {
  requireKeyring();
  return safeStorage.encryptString(normalizeAmapApiKey(value)).toString('base64url');
}

function storedAmapKey() {
  if (!appConfig.amapKeyEncrypted) return '';
  requireKeyring();
  try {
    return safeStorage.decryptString(Buffer.from(appConfig.amapKeyEncrypted, 'base64url'));
  } catch {
    throw new Error('无法通过当前密钥环解密高德 Key，请清除后重新配置');
  }
}

function currentAmapKey() {
  return environmentAmapKey() || storedAmapKey();
}

function publicConfig() {
  const environmentKey = environmentAmapKey();
  const storage = keyringStatus();
  return {
    directoryPath: diaryRoot,
    zoom: appConfig.zoom,
    backgroundTransparency: appConfig.backgroundTransparency,
    showNavigator: appConfig.showNavigator,
    darkMode: appConfig.darkMode,
    passwordStore: appConfig.passwordStore,
    passwordStoreRequiresRestart: process.platform === 'linux' && appConfig.passwordStore !== startupPasswordStore,
    passwordStoreSupported: process.platform === 'linux',
    keyringBackend: storage.backend,
    keyringAvailable: storage.encryptionAvailable,
    amapKeyConfigured: Boolean(environmentKey || appConfig.amapKeyEncrypted),
    amapKeySource: environmentKey
      ? 'environment'
      : appConfig.amapKeyEncrypted
        ? 'settings'
        : appConfig.amapKey
          ? 'legacy'
          : 'none',
    amapKeyMigrationPending: Boolean(appConfig.amapKey)
  };
}

async function loadConfig() {
  try {
    appConfig = normalizeConfig(JSON.parse(await readFile(configPath(), 'utf8')));
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('Failed to read config:', error);
    appConfig = { ...DEFAULT_CONFIG };
  }
  diaryRoot = appConfig.diaryRoot;
}

async function migratePlaintextAmapKey() {
  if (!appConfig.amapKey) return;
  try {
    appConfig.amapKeyEncrypted = encryptAmapKey(appConfig.amapKey);
    appConfig.amapKey = '';
    await saveConfig();
  } catch (error) {
    console.warn('Plaintext AMap Key migration is waiting for a system keyring:', error.message);
  }
}

function saveConfig() {
  const snapshot = `${JSON.stringify(appConfig, null, 2)}\n`;
  configWriteChain = configWriteChain.catch(() => undefined)
    .then(() => writeFileAtomically(configPath(), snapshot));
  return configWriteChain;
}

function updateWindowState(window) {
  const nextState = captureWindowState(window);
  if (sameWindowState(appConfig.windowState, nextState)) return false;
  appConfig.windowState = nextState;
  return true;
}

function attachWindowStatePersistence(window) {
  let saveTimer = null;
  let closePending = false;
  let closeAllowed = false;

  const reportSaveFailure = (error) => {
    console.error('Failed to persist window state:', error);
  };
  const scheduleSave = () => {
    if (closePending || !updateWindowState(window)) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      void saveConfig().catch(reportSaveFailure);
    }, 250);
  };

  window.on('resize', scheduleSave);
  window.on('maximize', scheduleSave);
  window.on('unmaximize', scheduleSave);
  window.on('close', (event) => {
    if (closeAllowed) return;
    event.preventDefault();
    if (closePending) return;
    closePending = true;
    updateWindowState(window);
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    void saveConfig()
      .catch(reportSaveFailure)
      .finally(() => {
        closeAllowed = true;
        if (!window.isDestroyed()) window.close();
        if (applicationQuitRequested && process.platform === 'darwin') app.quit();
      });
  });
  window.once('closed', () => {
    if (saveTimer) clearTimeout(saveTimer);
  });
}

function requireRoot() {
  if (!diaryRoot) throw new Error('请先选择日记目录');
  return diaryRoot;
}

function entryPath(date) {
  return diaryEntryPath(requireRoot(), date);
}

function imagePath(date, source) {
  const image = resolveDiaryImagePath(requireRoot(), date, source);
  if (!image) throw new Error('图片路径无效或格式不受支持');
  return image;
}

async function handleDiaryImageRequest(request) {
  try {
    const url = new URL(request.url);
    if (url.hostname !== 'local' || Number(url.searchParams.get('generation')) !== diaryGeneration) {
      return new Response('', { status: 410 });
    }
    const date = decodeURIComponent(url.pathname.slice(1));
    const source = url.searchParams.get('source') || '';
    const { target, mimeType } = imagePath(date, source);
    const details = await stat(target);
    if (!details.isFile() || details.size > MAX_DIARY_IMAGE_BYTES) return new Response('', { status: 413 });
    const response = await net.fetch(pathToFileURL(target).href);
    const headers = new Headers(response.headers);
    headers.set('Content-Type', mimeType);
    headers.set('Content-Length', String(details.size));
    headers.set('Cache-Control', 'private, max-age=300');
    return new Response(response.body, { status: response.status, headers });
  } catch {
    return new Response('', { status: 404 });
  }
}

function sameSavedLocation(left, right) {
  if (!left || !right) return false;
  return left.provider === right.provider
    && left.poiId === right.poiId
    && left.displayName === right.displayName
    && left.longitude === right.longitude
    && left.latitude === right.latitude
    && left.coordinateSystem === right.coordinateSystem;
}

async function listDates() {
  return listDiaryDates(requireRoot(), { create: true, descending: true });
}

async function listEntries() {
  const dates = await listDates();
  searchTextCache.prune(dates);
  const locations = new Map((optionalLocationStore()?.list() || []).map((location) => [location.date, location]));
  return dates.map((date) => ({ date, savedLocation: locations.get(date) || null }));
}

async function searchableEntry(date) {
  const cached = searchTextCache.get(date);
  if (cached) return cached;
  const generation = diaryGeneration;
  const requestKey = `${generation}\u0000${date}`;
  if (!searchTextRequests.has(requestKey)) {
    const target = entryPath(date);
    const request = (async () => {
      try {
        const content = await readFile(target, 'utf8');
        const searchable = `${date}\n${content}`.toLocaleLowerCase('zh-CN');
        if (generation === diaryGeneration) searchTextCache.set(date, searchable);
        return searchable;
      } catch (error) {
        if (error.code === 'ENOENT') return null;
        throw error;
      } finally {
        searchTextRequests.delete(requestKey);
      }
    })();
    searchTextRequests.set(requestKey, request);
  }
  return searchTextRequests.get(requestKey);
}

function createWindow() {
  const configuredZoomFactor = appConfig.zoom / 100;
  const isWindows = process.platform === 'win32';
  const initialWindowState = normalizeWindowState(appConfig.windowState);
  const window = new BrowserWindow({
    width: initialWindowState.width,
    height: initialWindowState.height,
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    transparent: true,
    frame: !isWindows,
    backgroundColor: '#00000000',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : isWindows ? 'hidden' : 'default',
    ...(isWindows ? {
      titleBarOverlay: windowControlsOverlayOptions(),
      backgroundMaterial: windowsBackgroundMaterial()
    } : {}),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: join(APP_ROOT, 'electron', 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      zoomFactor: configuredZoomFactor
    }
  });
  attachWindowStatePersistence(window);

  const applyConfiguredZoom = () => window.webContents.setZoomFactor(appConfig.zoom / 100);
  window.webContents.on('did-finish-load', applyConfiguredZoom);
  window.once('ready-to-show', () => {
    applyConfiguredZoom();
    if (initialWindowState.maximized) window.maximize();
    window.show();
  });
  window.loadFile(join(APP_ROOT, 'public', 'index.html'));
  window.webContents.on('will-navigate', (event, url) => {
    if (url !== APP_INDEX_URL) event.preventDefault();
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
}

ipcMain.handle('diary:choose-directory', async (event) => {
  const owner = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(owner, {
    title: '选择或创建 Diary 日记目录',
    buttonLabel: '使用此目录',
    defaultPath: diaryRoot || undefined,
    properties: ['openDirectory', 'createDirectory', 'promptToCreate']
  });
  if (result.canceled || !result.filePaths[0]) return { canceled: true };
  const selectedRoot = result.filePaths[0];
  const created = Boolean(await mkdir(selectedRoot, { recursive: true }));
  diaryRoot = selectedRoot;
  resetSearchCache();
  clearLocationMapSnapshots();
  await replaceAnalysisService(diaryRoot);
  replaceLocationStore(diaryRoot);
  appConfig.diaryRoot = diaryRoot;
  await saveConfig();
  return { canceled: false, created, path: diaryRoot };
});

ipcMain.handle('diary:get-status', () => ({ selected: Boolean(diaryRoot), path: diaryRoot }));

ipcMain.handle('diary:get-config', () => publicConfig());

ipcMain.handle('diary:update-config', async (event, patch) => {
  if (patch && Object.hasOwn(patch, 'zoom')) {
    const zoom = Number(patch.zoom);
    if (!Number.isFinite(zoom)) throw new Error('缩放比例无效');
    appConfig.zoom = Math.min(150, Math.max(80, Math.round(zoom / 5) * 5));
    const window = BrowserWindow.fromWebContents(event.sender);
    window?.webContents.setZoomFactor(appConfig.zoom / 100);
    applyWindowsWindowAppearance(window);
  }
  if (patch && Object.hasOwn(patch, 'backgroundTransparency')) {
    const backgroundTransparency = Number(patch.backgroundTransparency);
    if (!Number.isFinite(backgroundTransparency)) throw new Error('背景透明度无效');
    appConfig.backgroundTransparency = normalizeBackgroundTransparency(backgroundTransparency);
    applyWindowsWindowAppearance(BrowserWindow.fromWebContents(event.sender));
  }
  if (patch && Object.hasOwn(patch, 'showNavigator')) {
    appConfig.showNavigator = Boolean(patch.showNavigator);
  }
  if (patch && Object.hasOwn(patch, 'darkMode')) {
    appConfig.darkMode = Boolean(patch.darkMode);
    nativeTheme.themeSource = appConfig.darkMode ? 'dark' : 'light';
    applyWindowsWindowAppearance(BrowserWindow.fromWebContents(event.sender));
  }
  if (patch && Object.hasOwn(patch, 'passwordStore')) {
    const passwordStore = normalizePasswordStore(patch.passwordStore);
    if (passwordStore !== patch.passwordStore) throw new Error('系统密钥环选项无效');
    if (passwordStore !== appConfig.passwordStore && appConfig.amapKeyEncrypted) {
      throw new Error('切换系统密钥环前，请先清除已保存的高德 Key');
    }
    appConfig.passwordStore = passwordStore;
  }
  if (patch && Object.hasOwn(patch, 'amapKey')) {
    const value = typeof patch.amapKey === 'string' ? patch.amapKey.trim() : '';
    if (!value) {
      appConfig.amapKeyEncrypted = '';
      appConfig.amapKey = '';
    } else {
      if (appConfig.passwordStore !== startupPasswordStore) {
        throw new Error('系统密钥环设置需要重启应用后才能生效');
      }
      appConfig.amapKeyEncrypted = encryptAmapKey(value);
      appConfig.amapKey = '';
    }
  }
  await saveConfig();
  return publicConfig();
});

ipcMain.handle('diary:list', async () => ({ path: requireRoot(), entries: await listEntries() }));

ipcMain.handle('diary:list-images', async () => listDiaryImageEntries(requireRoot(), await listDates()));

ipcMain.handle('diary:list-trash', async () => listTrashEntries(requireRoot()));

ipcMain.handle('diary:empty-trash', async () => {
  const root = requireRoot();
  return queueTrashMutation(async () => {
    const result = await emptyTrashEntries(root);
    removeTrashLocations(root, result.ids);
    return result;
  });
});

ipcMain.handle('diary:delete-trash', async (_event, id) => {
  const root = requireRoot();
  return queueTrashMutation(async () => {
    const result = await deleteTrashEntry(root, id);
    removeTrashLocations(root, [result.id]);
    return result;
  });
});

ipcMain.handle('diary:analysis-insights', async (_event, options) => (
  requireAnalysisService().insights(analysisOptions(options))
));

ipcMain.handle('diary:analysis-reindex', async (_event, options) => (
  requireAnalysisService().reindex(analysisOptions(options))
));

ipcMain.handle('diary:import-image', async (event, date) => {
  if (!isValidDate(date)) throw new Error('日期无效');
  const owner = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(owner, {
    title: '选择要插入的图片',
    buttonLabel: '复制并插入',
    properties: ['openFile'],
    filters: [{ name: '图片', extensions: [...IMPORTABLE_IMAGE_EXTENSIONS] }]
  });
  if (result.canceled || !result.filePaths[0]) return { canceled: true };
  const imported = await copyImageIntoDiary({
    diaryRoot: requireRoot(),
    date,
    sourcePath: result.filePaths[0],
    maxSize: MAX_DIARY_IMAGE_BYTES
  });
  return { canceled: false, ...imported };
});

ipcMain.handle('diary:read', async (_event, date) => {
  const content = await readFile(entryPath(date), 'utf8');
  searchTextCache.set(date, `${date}\n${content}`.toLocaleLowerCase('zh-CN'));
  const savedLocation = optionalLocationStore()?.get(date) || null;
  const locationMetadata = extractLocationMetadata(content);
  return {
    date,
    content,
    savedLocation: locationMatchesSource(savedLocation, locationMetadata) ? savedLocation : null
  };
});

ipcMain.handle('diary:read-image', async (_event, date, source) => {
  const { target } = imagePath(date, source);
  const details = await stat(target);
  if (!details.isFile() || details.size > MAX_DIARY_IMAGE_BYTES) throw new Error('图片不能超过 12 MB');
  return `diary-image://local/${date}?source=${encodeURIComponent(source)}&generation=${diaryGeneration}&version=${Math.trunc(details.mtimeMs)}`;
});

ipcMain.handle('diary:write', async (_event, date, content, savedLocation) => {
  if (typeof content !== 'string') throw new Error('日记内容无效');
  if (Buffer.byteLength(content, 'utf8') > MAX_DIARY_CONTENT_BYTES) throw new Error('日记内容不能超过 2 MB');
  const preparedLocation = savedLocation === undefined || savedLocation === null
    ? savedLocation
    : normalizeSavedLocation(savedLocation);
  const locationMetadata = extractLocationMetadata(content);
  if (preparedLocation && !locationMetadata.sourceKey) throw new Error('请先填写地点文字再保存坐标');
  const target = entryPath(date);
  await writeFileAtomically(target, content);
  const existingStore = optionalLocationStore();
  let persistedLocation = existingStore?.get(date) || null;
  if (preparedLocation === null) {
    existingStore?.remove(date);
    persistedLocation = null;
  } else if (preparedLocation !== undefined) {
    if (!sameSavedLocation(persistedLocation, preparedLocation)
      || !locationMatchesSource(persistedLocation, locationMetadata)) {
      persistedLocation = requireLocationStore().save(date, preparedLocation, {
        sourceLabel: locationMetadata.sourceLabel,
        sourceKey: locationMetadata.sourceKey,
        bindingMode: 'frontmatter',
        resolutionMethod: 'editor'
      });
    }
  }
  searchTextCache.set(date, `${date}\n${content}`.toLocaleLowerCase('zh-CN'));
  refreshAnalysisDate(date);
  return { saved: true, savedLocation: persistedLocation };
});

ipcMain.handle('diary:delete', async (_event, date) => {
  if (!isValidDate(date)) throw new Error('日期无效');
  const root = requireRoot();
  const result = await queueTrashMutation(() => moveEntryToTrash(root, date));
  try {
    optionalLocationStore()?.moveToTrash(date, result.id);
  } catch (error) {
    console.error('Failed to move diary location to trash:', error);
    try { optionalLocationStore()?.remove(date); } catch {}
  }
  searchTextCache.delete(date);
  removeAnalysisDate(date);
  return result;
});

ipcMain.handle('diary:restore-trash', async (_event, id) => {
  const root = requireRoot();
  const result = await queueTrashMutation(() => restoreTrashEntry(root, id));
  try {
    optionalLocationStore()?.restoreFromTrash(id, result.date);
  } catch (error) {
    console.error('Failed to restore diary location:', error);
  }
  refreshAnalysisDate(result.date);
  return result;
});

ipcMain.handle('diary:location-search', async (_event, request) => {
  locationSearchController?.abort();
  const controller = new AbortController();
  locationSearchController = controller;
  try {
    const migrationRequest = request && typeof request === 'object';
    const query = migrationRequest ? request.query : request;
    const city = migrationRequest ? request.city : optionalLocationStore()?.latest()?.adcode || '';
    return await locationService.search(query, {
      city,
      cityLimit: migrationRequest && request.cityLimit === true,
      signal: controller.signal
    });
  } finally {
    if (locationSearchController === controller) locationSearchController = null;
  }
});

ipcMain.handle('diary:location-open', async (_event, date) => {
  const location = optionalLocationStore()?.get(date) || null;
  if (!location) throw new Error('这篇日记还没有可打开的坐标');
  const content = await readFile(entryPath(date), 'utf8');
  if (!locationMatchesSource(location, extractLocationMetadata(content))) {
    throw new Error('地点文字已变化，请重新搜索并确认坐标');
  }
  await shell.openExternal(buildAmapMarkerUrl(location));
  return true;
});

ipcMain.handle('diary:location-preview', async (_event, value) => {
  await shell.openExternal(buildAmapMarkerUrl(normalizeSavedLocation(value)));
  return true;
});

ipcMain.handle('diary:location-map-create', async (_event, points) => createLocationMapSnapshot(points));

ipcMain.handle('diary:location-map-cancel', () => {
  clearLocationMapSnapshots();
  return true;
});

ipcMain.handle('diary:location-migration-status', async () => scanLocationMigration(requireRoot(), {
  store: optionalLocationStore(),
  databaseError: locationStoreError
}));

ipcMain.handle('diary:location-migration-apply', async (_event, value) => queueLocationMutation(async () => (
  applyLocationMigration(requireRoot(), requireLocationStore(), value)
)));

ipcMain.handle('diary:location-migration-skip', async (_event, value) => queueLocationMutation(async () => (
  skipLocationMigration(requireRoot(), requireLocationStore(), value)
)));

ipcMain.handle('diary:location-migration-reset-skips', async () => queueLocationMutation(async () => (
  resetLocationMigrationSkips(requireRoot(), optionalLocationStore())
)));

ipcMain.handle('diary:location-migration-undo', async () => queueLocationMutation(async () => (
  undoLatestLocationMigration(requireRoot(), optionalLocationStore())
)));

ipcMain.handle('diary:search', async (_event, query) => {
  const needle = String(query || '').trim().toLocaleLowerCase('zh-CN').slice(0, 200);
  const dates = await listDates();
  if (!needle) return dates;
  const matches = await mapWithConcurrency(dates, DIARY_IO_CONCURRENCY, async (date) => {
    const searchable = await searchableEntry(date);
    return searchable?.includes(needle) ? date : null;
  });
  return matches.filter(Boolean);
});

ipcMain.handle('diary:open-directory', async () => {
  const error = await shell.openPath(requireRoot());
  if (error) throw new Error(error);
  return true;
});

app.whenReady().then(async () => {
  await loadConfig();
  await migratePlaintextAmapKey();
  await replaceAnalysisService(diaryRoot);
  replaceLocationStore(diaryRoot);
  nativeTheme.themeSource = appConfig.darkMode ? 'dark' : 'light';
  protocol.handle('diary-image', handleDiaryImageRequest);
  protocol.handle('diary-map', handleDiaryMapRequest);
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  applicationQuitRequested = true;
  locationSearchController?.abort();
  clearLocationMapSnapshots();
  locationStore?.close();
  locationStore = null;
  void analysisService?.close();
});
