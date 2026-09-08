import {
  buildMonthOffsets,
  findMonthIndexAtOffset,
  groupEntriesByMonth,
  virtualRange
} from './timeline-model.js';
import { buildCalendarYear } from './calendar-model.js';
import { extractImages, removeImages } from './markdown-images.js';
import { markdownContinuationEdit, prefixMarkdownLines } from './markdown-editor.js';
import {
  entriesAtWholeMonthIntervals,
  shuffledEntries,
  wholeMonthDistance,
  wrappedIndex
} from './wander-model.js';

const SAVE_DELAY = 600;
const VIRTUAL_MONTH_WINDOW = 5;
const CONTENT_LOAD_CONCURRENCY = 6;
const LOCATION_MAP_PAGE_SIZE = 10;
const LOCATION_MAP_MARKERS = 'ABCDEFGHIJ';
const BACKGROUND_TRANSPARENCY_MAX = 100;
const BACKGROUND_TRANSPARENCY_STEP = 5;
const desktop = window.diaryAPI || null;

const state = {
  directorySelected: false,
  directoryPath: '',
  entries: [],
  entryByDate: new Map(),
  visibleEntries: [],
  timelineGroups: [],
  timelineLayoutKey: '',
  monthOffsets: [0],
  measuredMonthHeights: new Map(),
  virtualStart: 0,
  virtualEnd: 0,
  virtualScrollFrame: 0,
  suppressVirtualScroll: false,
  timelineFocusDate: null,
  query: '',
  activeView: 'diary',
  calendarYear: new Date().getFullYear(),
  wanderDecks: { random: [], today: [] },
  wanderIndices: { random: 0, today: 0 },
  wanderRevision: 0,
  wanderPreparedRevision: -1,
  wanderPreparedDay: '',
  wanderAnimating: new Set(),
  wanderAnimationTokens: { random: 0, today: 0 },
  analysis: null,
  analysisLoading: false,
  analysisProgress: null,
  analysisStartDate: '',
  analysisEndDate: '',
  trashEntries: [],
  restoringTrashId: null,
  deletingTrashId: null,
  emptyingTrash: false,
  pendingTrashDelete: null,
  viewRequest: 0,
  galleryIndexLoaded: false,
  galleryLoadPromise: null,
  galleryRequest: 0,
  zoom: 110,
  backgroundTransparency: 0,
  darkMode: false,
  showNavigator: false,
  editingDate: null,
  composeDate: null,
  finishingCompose: false,
  importingImage: false,
  draft: null,
  pendingDeleteDate: null,
  deleting: false,
  previewDate: null,
  previewIndex: 0,
  previewZoom: 1,
  previewRequest: 0,
  dirty: false,
  saveTimer: null,
  saveChain: Promise.resolve(),
  searchRequest: 0,
  locationCandidates: [],
  locationActiveIndex: -1,
  locationSearchRequest: 0,
  locationSearching: false,
  locationMigration: null,
  locationMigrationLoading: false,
  locationMigrationMutating: false,
  locationMigrationSourceKey: '',
  locationMigrationCandidates: [],
  locationMigrationSelectedIndex: -1,
  locationMigrationSearching: false,
  locationMigrationSearchRequest: 0,
  locationMigrationQuery: '',
  locationMigrationCity: '',
  locationMigrationScope: 'all',
  locationMigrationDate: '',
  locationMigrationStartDate: '',
  locationMigrationEndDate: '',
  locationMigrationError: '',
  locationMapPage: 0,
  locationMapUrl: '',
  locationMapLoading: false,
  locationMapError: '',
  locationMapRequest: 0,
  amapKeyConfigured: false,
  amapKeySource: 'none',
  amapKeyMigrationPending: false,
  passwordStore: 'auto',
  passwordStoreRequiresRestart: false,
  passwordStoreSupported: false,
  keyringBackend: 'unknown',
  keyringAvailable: false
};

const elements = {
  sidebar: document.querySelector('#sidebar'),
  closeSidebarButton: document.querySelector('#closeSidebarButton'),
  menuButton: document.querySelector('#menuButton'),
  scrim: document.querySelector('#scrim'),
  welcomeChooseButton: document.querySelector('#welcomeChooseButton'),
  newButton: document.querySelector('#newButton'),
  searchInput: document.querySelector('#searchInput'),
  searchShortcut: document.querySelector('#searchShortcut'),
  viewTitle: document.querySelector('#viewTitle'),
  entryCount: document.querySelector('#entryCount'),
  yearJumpButton: document.querySelector('#yearJumpButton'),
  galleryButton: document.querySelector('#galleryButton'),
  calendarButton: document.querySelector('#calendarButton'),
  wanderButton: document.querySelector('#wanderButton'),
  analysisButton: document.querySelector('#analysisButton'),
  trashButton: document.querySelector('#trashButton'),
  yearDialog: document.querySelector('#yearDialog'),
  yearDialogList: document.querySelector('#yearDialogList'),
  closeYearButton: document.querySelector('#closeYearButton'),
  saveStatus: document.querySelector('#saveStatus'),
  welcomeView: document.querySelector('#welcomeView'),
  timelineView: document.querySelector('#timelineView'),
  calendarView: document.querySelector('#calendarView'),
  wanderView: document.querySelector('#wanderView'),
  analysisView: document.querySelector('#analysisView'),
  trashView: document.querySelector('#trashView'),
  noResultsView: document.querySelector('#noResultsView'),
  noResultsTitle: document.querySelector('#noResultsTitle'),
  noResultsText: document.querySelector('#noResultsText'),
  dateDialog: document.querySelector('#dateDialog'),
  dateForm: document.querySelector('#dateForm'),
  dateInput: document.querySelector('#dateInput'),
  cancelDateButton: document.querySelector('#cancelDateButton'),
  composeDialog: document.querySelector('#composeDialog'),
  composeForm: document.querySelector('#composeForm'),
  composeDateText: document.querySelector('#composeDateText'),
  composeWeatherInput: document.querySelector('#composeWeatherInput'),
  composeLocationInput: document.querySelector('#composeLocationInput'),
  composeLocationSuggestions: document.querySelector('#composeLocationSuggestions'),
  composeLocationMapButton: document.querySelector('#composeLocationMapButton'),
  locationMigrationDialog: document.querySelector('#locationMigrationDialog'),
  locationMigrationView: document.querySelector('#locationMigrationView'),
  closeLocationMigrationButton: document.querySelector('#closeLocationMigrationButton'),
  locationMapDialog: document.querySelector('#locationMapDialog'),
  locationMapView: document.querySelector('#locationMapView'),
  closeLocationMapButton: document.querySelector('#closeLocationMapButton'),
  composeEditor: document.querySelector('#composeEditor'),
  composeToolbar: document.querySelector('#composeToolbar'),
  importImageButton: document.querySelector('#importImageButton'),
  composeSaveStatus: document.querySelector('#composeSaveStatus'),
  closeComposeButton: document.querySelector('#closeComposeButton'),
  appShell: document.querySelector('.app-shell'),
  navigatorButton: document.querySelector('#navigatorButton'),
  closeNavigatorButton: document.querySelector('#closeNavigatorButton'),
  quickNav: document.querySelector('#quickNav'),
  quickNavList: document.querySelector('#quickNavList'),
  settingsButton: document.querySelector('#settingsButton'),
  sidebarSettingsButton: document.querySelector('#sidebarSettingsButton'),
  settingsDialog: document.querySelector('#settingsDialog'),
  closeSettingsButton: document.querySelector('#closeSettingsButton'),
  zoomInput: document.querySelector('#zoomInput'),
  zoomOutput: document.querySelector('#zoomOutput'),
  zoomOutButton: document.querySelector('#zoomOutButton'),
  zoomInButton: document.querySelector('#zoomInButton'),
  backgroundTransparencyInput: document.querySelector('#backgroundTransparencyInput'),
  backgroundTransparencyOutput: document.querySelector('#backgroundTransparencyOutput'),
  backgroundTransparencyDownButton: document.querySelector('#backgroundTransparencyDownButton'),
  backgroundTransparencyUpButton: document.querySelector('#backgroundTransparencyUpButton'),
  darkModeToggle: document.querySelector('#darkModeToggle'),
  themeColorMeta: document.querySelector('#themeColorMeta'),
  navigatorToggle: document.querySelector('#navigatorToggle'),
  passwordStoreField: document.querySelector('#passwordStoreField'),
  passwordStoreSelect: document.querySelector('#passwordStoreSelect'),
  passwordStoreStatus: document.querySelector('#passwordStoreStatus'),
  amapKeyInput: document.querySelector('#amapKeyInput'),
  amapKeyStatus: document.querySelector('#amapKeyStatus'),
  saveAmapKeyButton: document.querySelector('#saveAmapKeyButton'),
  clearAmapKeyButton: document.querySelector('#clearAmapKeyButton'),
  settingsDirectoryPath: document.querySelector('#settingsDirectoryPath'),
  settingsOpenFolderButton: document.querySelector('#settingsOpenFolderButton'),
  settingsChooseFolderButton: document.querySelector('#settingsChooseFolderButton'),
  imageDialog: document.querySelector('#imageDialog'),
  imagePreview: document.querySelector('#imagePreview'),
  imageCounter: document.querySelector('#imageCounter'),
  imageZoomText: document.querySelector('#imageZoomText'),
  imageStage: document.querySelector('#imageStage'),
  imageCanvas: document.querySelector('#imageCanvas'),
  resetImageZoomButton: document.querySelector('#resetImageZoomButton'),
  previousImageButton: document.querySelector('#previousImageButton'),
  nextImageButton: document.querySelector('#nextImageButton'),
  closeImageButton: document.querySelector('#closeImageButton'),
  deleteDialog: document.querySelector('#deleteDialog'),
  deleteForm: document.querySelector('#deleteForm'),
  deleteDateText: document.querySelector('#deleteDateText'),
  cancelDeleteButton: document.querySelector('#cancelDeleteButton'),
  trashDeleteDialog: document.querySelector('#trashDeleteDialog'),
  trashDeleteForm: document.querySelector('#trashDeleteForm'),
  trashDeleteTitle: document.querySelector('#trashDeleteTitle'),
  trashDeleteSubject: document.querySelector('#trashDeleteSubject'),
  cancelTrashDeleteButton: document.querySelector('#cancelTrashDeleteButton'),
  snackbar: document.querySelector('#snackbar')
};

const dateFormatters = {
  weekday: new Intl.DateTimeFormat('zh-CN', { weekday: 'long' }),
  month: new Intl.DateTimeFormat('zh-CN', { month: 'short' }),
  full: new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }),
  deletedAt: new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  })
};

function dateFromKey(key) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}

function todayKey(now = new Date()) {
  return [now.getFullYear(), now.getMonth() + 1, now.getDate()]
    .map((part, index) => index === 0 ? String(part) : String(part).padStart(2, '0'))
    .join('-');
}

function creationTimestamp() {
  const now = new Date();
  const time = [now.getHours(), now.getMinutes()].map((part) => String(part).padStart(2, '0')).join(':');
  return `${todayKey(now)} ${time}`;
}

function createTemplate() {
  return `---\n时间: ${creationTimestamp()}\n天气:\n地点:\n---\n\n`;
}

function parseEntry(date, content) {
  const normalized = String(content || '').replace(/\r\n/g, '\n');
  const fields = { 时间: '', 天气: '', 地点: '' };
  let body = normalized;
  if (normalized.startsWith('---\n')) {
    const closing = normalized.indexOf('\n---', 4);
    if (closing !== -1) {
      for (const line of normalized.slice(4, closing).split('\n')) {
        const colon = line.indexOf(':');
        if (colon === -1) continue;
        const key = line.slice(0, colon).trim();
        if (Object.hasOwn(fields, key)) fields[key] = line.slice(colon + 1).trim();
      }
      body = normalized.slice(closing + 4).replace(/^\n+/, '');
    }
  }
  return { date, content: normalized, fields, body, images: extractImages(body) };
}

function normalizeEntry(entry) {
  if (entry.content !== undefined) {
    return { ...parseEntry(entry.date, entry.content), savedLocation: entry.savedLocation || null };
  }
  return {
    date: entry.date,
    content: undefined,
    fields: { 时间: '', 天气: '', 地点: '' },
    body: '',
    images: [],
    savedLocation: entry.savedLocation || null
  };
}

function rebuildEntryIndex() {
  state.entryByDate = new Map(state.entries.map((entry) => [entry.date, entry]));
}

function entryForDate(date) {
  return state.entryByDate.get(date);
}

function cleanValue(value) {
  return String(value || '').replace(/[\r\n]+/g, ' ').trim();
}

function normalizeLocationText(value) {
  return cleanValue(value).normalize('NFKC').replace(/\s+/g, ' ');
}

function savedLocationMatchesText(savedLocation, value) {
  if (!savedLocation) return false;
  const expected = savedLocation.sourceKey || savedLocation.sourceLabel || savedLocation.displayName;
  return normalizeLocationText(expected) === normalizeLocationText(value);
}

function serializeDraft(draft) {
  const line = (key, value) => `${key}:${value ? ` ${cleanValue(value)}` : ''}`;
  return `---\n${line('时间', draft.fields.时间)}\n${line('天气', draft.fields.天气)}\n${line('地点', draft.fields.地点)}\n---\n\n${draft.body.replace(/\r\n/g, '\n')}`;
}

async function fetchJson(path, options = {}) {
  const response = await fetch(path, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `请求失败 (${response.status})`);
  return data;
}

const dataSource = desktop || {
  async getConfig() {
    return {
      directoryPath: 'Diary', zoom: 110, backgroundTransparency: 0, showNavigator: false, darkMode: false
    };
  },
  async updateConfig(patch) {
    if (patch.zoom) document.documentElement.style.zoom = String(Number(patch.zoom) / 100);
    return {
      zoom: patch.zoom || state.zoom,
      backgroundTransparency: patch.backgroundTransparency ?? state.backgroundTransparency,
      showNavigator: patch.showNavigator ?? state.showNavigator,
      darkMode: patch.darkMode ?? state.darkMode
    };
  },
  async getStatus() {
    return { selected: true, path: 'Diary' };
  },
  async chooseDirectory() {
    throw new Error('目录选择仅在桌面应用中可用');
  },
  async listEntries() {
    const data = await fetchJson('/api/entries');
    return { path: 'Diary', entries: data.entries };
  },
  async listImages() {
    const data = await fetchJson('/api/gallery');
    return data.entries;
  },
  async listTrash() {
    const data = await fetchJson('/api/trash');
    return data.entries;
  },
  async emptyTrash() {
    return fetchJson('/api/trash', { method: 'DELETE' });
  },
  async deleteTrash(id) {
    return fetchJson(`/api/trash/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },
  async getAnalysisInsights(options = {}) {
    const query = new URLSearchParams();
    if (options.startDate) query.set('from', options.startDate);
    if (options.endDate) query.set('to', options.endDate);
    if (options.termLimit) query.set('terms', String(options.termLimit));
    return fetchJson(`/api/analysis?${query}`);
  },
  async reindexAnalysis(options = {}) {
    const query = new URLSearchParams();
    if (options.startDate) query.set('from', options.startDate);
    if (options.endDate) query.set('to', options.endDate);
    if (options.termLimit) query.set('terms', String(options.termLimit));
    return fetchJson(`/api/analysis/reindex?${query}`, { method: 'POST' });
  },
  async importImage() {
    throw new Error('图片导入仅在桌面应用中可用');
  },
  async readEntry(date) {
    return fetchJson(`/api/entries/${date}`);
  },
  async readImage(date, source) {
    return `/api/images/${date}?src=${encodeURIComponent(source)}`;
  },
  async writeEntry(date, content) {
    return fetchJson(`/api/entries/${date}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
      body: content
    });
  },
  async deleteEntry(date) {
    return fetchJson(`/api/entries/${date}`, { method: 'DELETE' });
  },
  async restoreTrash(id) {
    return fetchJson(`/api/trash/${encodeURIComponent(id)}/restore`, { method: 'POST' });
  },
  async searchEntries(query) {
    const data = await fetchJson(`/api/search?q=${encodeURIComponent(query)}`);
    return data.entries;
  },
  async searchLocations() {
    throw new Error('高德地点搜索仅在桌面应用中可用');
  },
  async openEntryLocation() {
    throw new Error('地图查看仅在桌面应用中可用');
  },
  async previewLocation() {
    throw new Error('地图预览仅在桌面应用中可用');
  },
  async createLocationMap() {
    throw new Error('地点地图仅在桌面应用中可用');
  },
  async cancelLocationMap() {
    return true;
  },
  async getLocationMigrationStatus() {
    throw new Error('旧地点迁移仅在桌面应用中可用');
  },
  async applyLocationMigration() {
    throw new Error('旧地点迁移仅在桌面应用中可用');
  },
  async skipLocationMigration() {
    throw new Error('旧地点迁移仅在桌面应用中可用');
  },
  async resetLocationMigrationSkips() {
    throw new Error('旧地点迁移仅在桌面应用中可用');
  },
  async undoLocationMigration() {
    throw new Error('旧地点迁移仅在桌面应用中可用');
  },
  async openDirectory() {
    throw new Error('请在桌面应用中使用此功能');
  }
};

let snackbarTimer;
function friendlyErrorMessage(error, fallback = '操作失败') {
  const message = String(error?.message || fallback).trim();
  return message.replace(/^Error invoking remote method '[^']+': Error:\s*/, '') || fallback;
}

function showSnackbar(message) {
  clearTimeout(snackbarTimer);
  elements.snackbar.textContent = message;
  elements.snackbar.classList.add('show');
  snackbarTimer = setTimeout(() => elements.snackbar.classList.remove('show'), 2600);
}

function setSaveStatus(status, text) {
  elements.saveStatus.className = `save-status ${status}`;
  elements.saveStatus.querySelector('b').textContent = text;
  elements.composeSaveStatus.textContent = text;
  elements.composeSaveStatus.parentElement.className = status;
}

function entriesForActiveView() {
  return state.activeView === 'gallery'
    ? state.entries.filter((entry) => entry.images?.length)
    : state.entries;
}

function updateViewChrome() {
  const galleryActive = state.activeView === 'gallery';
  const calendarActive = state.activeView === 'calendar';
  const wanderActive = state.activeView === 'wander';
  const analysisActive = state.activeView === 'analysis';
  const trashActive = state.activeView === 'trash';
  elements.viewTitle.textContent = trashActive ? '回收' : analysisActive ? '洞察' : wanderActive ? '漫步' : calendarActive ? '日历' : galleryActive ? '图库' : '时光轴';
  elements.galleryButton.setAttribute('aria-pressed', String(galleryActive));
  elements.galleryButton.title = galleryActive ? '返回时光轴' : '打开图库';
  elements.calendarButton.setAttribute('aria-pressed', String(calendarActive));
  elements.calendarButton.title = calendarActive ? '返回时光轴' : '打开日历';
  elements.wanderButton.setAttribute('aria-pressed', String(wanderActive));
  elements.wanderButton.title = wanderActive ? '返回时光轴' : '打开漫步';
  elements.analysisButton.setAttribute('aria-pressed', String(analysisActive));
  elements.analysisButton.title = analysisActive ? '返回时光轴' : '打开洞察';
  elements.trashButton.setAttribute('aria-pressed', String(trashActive));
  elements.trashButton.title = trashActive ? '返回时光轴' : '打开回收';
  elements.searchInput.placeholder = trashActive
    ? '回收页面中不可搜索'
    : analysisActive
    ? '洞察页面中不可搜索'
    : wanderActive
    ? '漫步时光中不可搜索'
    : calendarActive ? '日历视图中不可搜索' : galleryActive ? '搜索图片' : '搜索日记';
  elements.searchInput.disabled = !state.directorySelected || calendarActive || wanderActive || analysisActive || trashActive;
  elements.timelineView.setAttribute('aria-label', galleryActive ? '图片时间轴' : '日记时间轴');
  elements.noResultsTitle.textContent = galleryActive
    ? (state.query ? '没有找到图片' : '图库中还没有图片')
    : '没有找到日记';
  elements.noResultsText.textContent = galleryActive
    ? (state.query ? '换一个关键词，或清除搜索内容。' : '在日记中添加 Markdown 图片后，它们会按日期显示在这里。')
    : '换一个关键词，或创建一篇新的记录。';
}

function showSelectedState() {
  elements.newButton.disabled = false;
  elements.galleryButton.disabled = false;
  elements.calendarButton.disabled = false;
  elements.wanderButton.disabled = false;
  elements.analysisButton.disabled = false;
  elements.trashButton.disabled = false;
  elements.yearJumpButton.disabled = entriesForActiveView().length === 0;
  elements.settingsDirectoryPath.textContent = state.directoryPath;
  elements.settingsDirectoryPath.title = state.directoryPath;
  elements.settingsOpenFolderButton.disabled = !desktop;
  elements.welcomeView.classList.add('hidden');
  updateViewChrome();
  applyNavigatorVisibility();
}

function showWelcomeState() {
  state.directorySelected = false;
  state.activeView = 'diary';
  updateViewChrome();
  elements.welcomeView.classList.remove('hidden');
  elements.timelineView.classList.add('hidden');
  elements.calendarView.classList.add('hidden');
  elements.wanderView.classList.add('hidden');
  elements.analysisView.classList.add('hidden');
  elements.trashView.classList.add('hidden');
  elements.noResultsView.classList.add('hidden');
  elements.newButton.disabled = true;
  elements.searchInput.disabled = true;
  elements.yearJumpButton.disabled = true;
  elements.galleryButton.disabled = true;
  elements.calendarButton.disabled = true;
  elements.wanderButton.disabled = true;
  elements.analysisButton.disabled = true;
  elements.trashButton.disabled = true;
  elements.settingsDirectoryPath.textContent = '尚未选择';
  elements.settingsOpenFolderButton.disabled = true;
  applyNavigatorVisibility();
}

function closeSidebar() {
  elements.sidebar.classList.remove('open');
  elements.scrim.classList.remove('show');
}

function openSidebar() {
  elements.sidebar.classList.add('open');
  elements.scrim.classList.add('show');
}

function applyNavigatorVisibility() {
  const available = state.directorySelected && !['calendar', 'wander', 'analysis', 'trash'].includes(state.activeView);
  const visible = available && state.showNavigator;
  elements.appShell.classList.toggle('navigator-hidden', !visible);
  elements.quickNav.inert = !visible;
  elements.quickNav.setAttribute('aria-hidden', String(!visible));
  elements.navigatorToggle.checked = state.showNavigator;
  elements.navigatorButton.disabled = !available;
  elements.navigatorButton.setAttribute('aria-pressed', String(visible));
}

async function setNavigatorVisibility(visible) {
  state.showNavigator = Boolean(visible);
  applyNavigatorVisibility();
  try {
    await dataSource.updateConfig({ showNavigator: state.showNavigator });
  } catch (error) {
    showSnackbar(`设置保存失败：${error.message}`);
  }
}

function applyDarkMode() {
  document.documentElement.dataset.theme = state.darkMode ? 'dark' : 'light';
  elements.darkModeToggle.checked = state.darkMode;
  elements.themeColorMeta.content = state.darkMode ? '#141217' : '#f8f7fb';
}

async function setDarkMode(enabled) {
  state.darkMode = Boolean(enabled);
  applyDarkMode();
  try {
    await dataSource.updateConfig({ darkMode: state.darkMode });
  } catch (error) {
    showSnackbar(`深色模式设置保存失败：${error.message}`);
  }
}

function updateZoomDisplay(value) {
  const zoom = Math.min(150, Math.max(80, Math.round(Number(value) / 5) * 5));
  state.zoom = zoom;
  elements.zoomInput.value = String(zoom);
  elements.zoomOutput.textContent = `${zoom}%`;
  return zoom;
}

function normalizeBackgroundTransparency(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return 0;
  return Math.min(
    BACKGROUND_TRANSPARENCY_MAX,
    Math.max(0, Math.round(numericValue / BACKGROUND_TRANSPARENCY_STEP) * BACKGROUND_TRANSPARENCY_STEP)
  );
}

function updateBackgroundTransparencyDisplay(value) {
  const transparency = normalizeBackgroundTransparency(value);
  state.backgroundTransparency = transparency;
  elements.backgroundTransparencyInput.value = String(transparency);
  elements.backgroundTransparencyOutput.textContent = `${transparency}%`;
  document.documentElement.style.setProperty('--window-background-opacity', `${100 - transparency}%`);
  return transparency;
}

let zoomTimer;
let backgroundTransparencyTimer;
let timelineResizeTimer;
function scheduleZoom(value) {
  const zoom = updateZoomDisplay(value);
  clearTimeout(zoomTimer);
  zoomTimer = setTimeout(async () => {
    try {
      await dataSource.updateConfig({ zoom });
    } catch (error) {
      showSnackbar(`缩放设置保存失败：${error.message}`);
    }
  }, 100);
}

function scheduleBackgroundTransparency(value) {
  const backgroundTransparency = updateBackgroundTransparencyDisplay(value);
  clearTimeout(backgroundTransparencyTimer);
  backgroundTransparencyTimer = setTimeout(async () => {
    try {
      await dataSource.updateConfig({ backgroundTransparency });
    } catch (error) {
      showSnackbar(`背景透明度设置保存失败：${error.message}`);
    }
  }, 100);
}

function applyAmapConfig(config = {}) {
  state.amapKeyConfigured = config.amapKeyConfigured === true;
  state.amapKeySource = ['environment', 'settings', 'legacy'].includes(config.amapKeySource)
    ? config.amapKeySource
    : 'none';
  state.amapKeyMigrationPending = config.amapKeyMigrationPending === true;
  state.passwordStore = typeof config.passwordStore === 'string' ? config.passwordStore : 'auto';
  state.passwordStoreRequiresRestart = config.passwordStoreRequiresRestart === true;
  state.passwordStoreSupported = config.passwordStoreSupported === true;
  state.keyringBackend = typeof config.keyringBackend === 'string' ? config.keyringBackend : 'unknown';
  state.keyringAvailable = config.keyringAvailable === true;
}

function passwordStoreLabel(value) {
  return {
    auto: '自动检测',
    kwallet: 'KWallet',
    kwallet5: 'KWallet 5',
    kwallet6: 'KWallet 6',
    'gnome-libsecret': 'GNOME Libsecret',
    gnome_libsecret: 'GNOME Libsecret',
    basic_text: '基础文本（不安全）',
    unknown: '未知'
  }[value] || value;
}

function renderAmapKeySettings() {
  const fromEnvironment = state.amapKeySource === 'environment';
  const fromSettings = ['settings', 'legacy'].includes(state.amapKeySource);
  const keyringReady = state.keyringAvailable && !state.passwordStoreRequiresRestart;
  elements.passwordStoreField.classList.toggle('hidden', Boolean(desktop) && !state.passwordStoreSupported);
  elements.passwordStoreSelect.value = state.passwordStore;
  elements.passwordStoreSelect.disabled = !desktop || !state.passwordStoreSupported;
  elements.amapKeyInput.value = '';
  elements.amapKeyInput.disabled = !desktop || fromEnvironment || !keyringReady;
  elements.saveAmapKeyButton.disabled = !desktop || fromEnvironment || !keyringReady;
  elements.clearAmapKeyButton.disabled = !desktop || !fromSettings;
  if (!desktop) {
    elements.passwordStoreStatus.textContent = '仅桌面应用使用系统密钥环';
  } else if (!state.passwordStoreSupported) {
    elements.passwordStoreStatus.textContent = '当前系统使用平台默认密钥服务';
  } else if (state.passwordStoreRequiresRestart) {
    elements.passwordStoreStatus.textContent = state.passwordStore === 'auto'
      ? '已选择自动检测，重启后不再强制指定密钥环'
      : `已选择 ${passwordStoreLabel(state.passwordStore)}，重启后将传递 --password-store=${state.passwordStore}`;
  } else {
    elements.passwordStoreStatus.textContent = `当前后端：${passwordStoreLabel(state.keyringBackend)}`;
  }
  if (!desktop) {
    elements.amapKeyStatus.textContent = '仅桌面应用支持高德地点搜索';
    elements.amapKeyInput.placeholder = '桌面应用中配置';
  } else if (fromEnvironment) {
    elements.amapKeyStatus.textContent = '正在使用 SHIGUANG_AMAP_KEY 环境变量';
    elements.amapKeyInput.placeholder = '由环境变量管理';
  } else if (state.passwordStoreRequiresRestart) {
    elements.amapKeyStatus.textContent = '密钥环设置等待重启，暂不能保存 Key';
    elements.amapKeyInput.placeholder = '重启应用后配置';
  } else if (!state.keyringAvailable) {
    elements.amapKeyStatus.textContent = `系统密钥服务不可用（当前：${passwordStoreLabel(state.keyringBackend)}）`;
    elements.amapKeyInput.placeholder = '请先选择可用密钥环并重启';
  } else if (state.amapKeyMigrationPending) {
    elements.amapKeyStatus.textContent = '发现旧版未加密 Key，等待迁移到系统密钥环';
    elements.amapKeyInput.placeholder = '可清除后重新配置';
  } else if (fromSettings) {
    elements.amapKeyStatus.textContent = `Key 已通过 ${passwordStoreLabel(state.keyringBackend)} 加密保存`;
    elements.amapKeyInput.placeholder = '已配置；输入新 Key 可替换';
  } else {
    elements.amapKeyStatus.textContent = '尚未配置，地点搜索不可用';
    elements.amapKeyInput.placeholder = '输入高德 Web 服务 Key';
  }
}

async function setPasswordStore(value) {
  elements.passwordStoreSelect.disabled = true;
  try {
    const config = await dataSource.updateConfig({ passwordStore: value });
    applyAmapConfig(config);
    renderAmapKeySettings();
    showSnackbar(state.passwordStoreRequiresRestart ? '密钥环设置已保存，请重启应用' : '密钥环设置已保存');
  } catch (error) {
    renderAmapKeySettings();
    showSnackbar(`密钥环设置失败：${error.message}`);
  }
}

async function saveAmapKey() {
  const key = elements.amapKeyInput.value.trim();
  if (!key) {
    showSnackbar('请输入高德 Web 服务 Key');
    elements.amapKeyInput.focus();
    return;
  }
  elements.saveAmapKeyButton.disabled = true;
  try {
    const config = await dataSource.updateConfig({ amapKey: key });
    applyAmapConfig(config);
    renderAmapKeySettings();
    showSnackbar('高德地点搜索已启用');
  } catch (error) {
    showSnackbar(`Key 保存失败：${error.message}`);
  } finally {
    renderAmapKeySettings();
  }
}

async function clearAmapKey() {
  elements.clearAmapKeyButton.disabled = true;
  try {
    const config = await dataSource.updateConfig({ amapKey: '' });
    applyAmapConfig(config);
    renderAmapKeySettings();
    showSnackbar('已清除高德 Web 服务 Key');
  } catch (error) {
    showSnackbar(`Key 清除失败：${error.message}`);
  } finally {
    renderAmapKeySettings();
  }
}

function openSettings() {
  elements.settingsDirectoryPath.textContent = state.directoryPath || '尚未选择';
  elements.settingsDirectoryPath.title = state.directoryPath || '';
  elements.settingsOpenFolderButton.disabled = !desktop || !state.directorySelected;
  updateZoomDisplay(state.zoom);
  updateBackgroundTransparencyDisplay(state.backgroundTransparency);
  applyDarkMode();
  applyNavigatorVisibility();
  renderAmapKeySettings();
  if (!elements.settingsDialog.open) elements.settingsDialog.showModal();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function renderMath(source, displayMode = false) {
  try {
    if (window.katex) {
      const rendered = window.katex.renderToString(source.trim(), {
        displayMode,
        throwOnError: false,
        strict: 'ignore',
        trust: false,
        output: 'htmlAndMathml'
      });
      return displayMode ? `<div class="math-block">${rendered}</div>` : `<span class="math-inline">${rendered}</span>`;
    }
  } catch {
    // Fall through to readable source when KaTeX cannot parse the expression.
  }
  const fallback = `<code class="math-fallback">${escapeHtml(source)}</code>`;
  return displayMode ? `<div class="math-block">${fallback}</div>` : fallback;
}

function renderInline(value) {
  const tokens = [];
  const protect = (html) => {
    const token = `\u0000TOKEN${tokens.length}\u0000`;
    tokens.push(html);
    return token;
  };
  let raw = String(value)
    .replace(/`([^`]+)`/g, (_, code) => protect(`<code>${escapeHtml(code)}</code>`))
    .replace(/\\\((.+?)\\\)/g, (_, formula) => protect(renderMath(formula, false)))
    .replace(/(^|[^\\])\$([^$\n]+?)\$/g, (_, prefix, formula) => `${prefix}${protect(renderMath(formula, false))}`);
  let output = escapeHtml(raw);
  output = output
    .replace(/\[([^\]]+)]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>');
  tokens.forEach((token, index) => {
    output = output.replace(`\u0000TOKEN${index}\u0000`, token);
  });
  return output;
}

function markdownToHtml(markdown) {
  const lines = removeImages(markdown).replace(/\r\n/g, '\n').split('\n');
  const html = [];
  let paragraph = [];
  let listType = null;
  let codeLines = [];
  let inCode = false;
  let mathBlock = null;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    html.push(`<p>${paragraph.map(renderInline).join('<br>')}</p>`);
    paragraph = [];
  };
  const closeList = () => {
    if (!listType) return;
    html.push(`</${listType}>`);
    listType = null;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (mathBlock) {
      if (trimmed.endsWith(mathBlock.closing)) {
        mathBlock.lines.push(line.slice(0, line.lastIndexOf(mathBlock.closing)));
        html.push(renderMath(mathBlock.lines.join('\n'), true));
        mathBlock = null;
      } else {
        mathBlock.lines.push(line);
      }
      continue;
    }

    if (line.startsWith('```')) {
      flushParagraph();
      closeList();
      if (inCode) {
        html.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
        codeLines = [];
      }
      inCode = !inCode;
      continue;
    }
    const mathOpening = trimmed.startsWith('$$') ? { opening: '$$', closing: '$$' }
      : trimmed.startsWith('\\[') ? { opening: '\\[', closing: '\\]' }
        : null;
    if (mathOpening) {
      flushParagraph();
      closeList();
      const content = trimmed.slice(mathOpening.opening.length);
      if (content.endsWith(mathOpening.closing)) {
        html.push(renderMath(content.slice(0, -mathOpening.closing.length), true));
      } else {
        mathBlock = { closing: mathOpening.closing, lines: [content] };
      }
      continue;
    }
    if (inCode) {
      codeLines.push(line);
      continue;
    }
    const heading = /^(#{1,4})\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph();
      closeList();
      html.push(`<h${heading[1].length}>${renderInline(heading[2])}</h${heading[1].length}>`);
      continue;
    }
    if (/^\s*(---|\*\*\*)\s*$/.test(line)) {
      flushParagraph();
      closeList();
      html.push('<hr>');
      continue;
    }
    const quote = /^>\s?(.*)$/.exec(line);
    if (quote) {
      flushParagraph();
      closeList();
      html.push(`<blockquote>${renderInline(quote[1])}</blockquote>`);
      continue;
    }
    const unordered = /^\s*[-*+]\s+(.+)$/.exec(line);
    const ordered = /^\s*\d+[.)]\s+(.+)$/.exec(line);
    if (unordered || ordered) {
      flushParagraph();
      const nextType = unordered ? 'ul' : 'ol';
      if (listType !== nextType) {
        closeList();
        listType = nextType;
        html.push(`<${listType}>`);
      }
      html.push(`<li>${renderInline((unordered || ordered)[1])}</li>`);
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      closeList();
      continue;
    }
    closeList();
    paragraph.push(line);
  }
  if (mathBlock) html.push(renderMath(mathBlock.lines.join('\n'), true));
  if (inCode) html.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
  flushParagraph();
  closeList();
  return html.join('\n');
}

function metadataHtml(entry) {
  const parts = [];
  if (entry.fields.时间) {
    parts.push(`<span><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/></svg>${escapeHtml(entry.fields.时间)}</span>`);
  }
  if (entry.fields.天气) {
    parts.push(`<span><svg viewBox="0 0 24 24"><circle cx="8" cy="9" r="3.5"/><path d="M12 14h6a3 3 0 0 0 0-6 4.5 4.5 0 0 0-8 1.5"/></svg>${escapeHtml(entry.fields.天气)}</span>`);
  }
  if (entry.fields.地点) {
    const content = `<svg viewBox="0 0 24 24"><path d="M18 10c0 4.5-6 10-6 10S6 14.5 6 10a6 6 0 1 1 12 0Z"/><circle cx="12" cy="10" r="2"/></svg>${escapeHtml(entry.fields.地点)}`;
    parts.push(entry.savedLocation
      ? `<button class="metadata-location" type="button" data-location-date="${entry.date}" title="在高德地图中查看">${content}</button>`
      : `<span>${content}</span>`);
  }
  return parts.join('');
}

async function openSavedLocation(date) {
  try {
    if (state.draft?.date === date) await flushSave();
    await dataSource.openEntryLocation(date);
  } catch (error) {
    showSnackbar(`无法打开地图：${error.message}`);
  }
}

function editorHtml(entry) {
  const draft = state.draft;
  return `
    <div class="bubble-header">
      <div class="bubble-heading"><strong>${dateFormatters.weekday.format(dateFromKey(entry.date))} · 编辑中</strong></div>
    </div>
    <div class="editor-meta">
      <label><span>天气</span><input data-field="天气" value="${escapeHtml(draft.fields.天气)}" placeholder="今天的天气"></label>
      <label><span>地点</span><input data-field="地点" value="${escapeHtml(draft.fields.地点)}" placeholder="此刻在哪里"></label>
    </div>
    <textarea class="bubble-editor" data-role="editor" spellcheck="true" placeholder="写下此刻……">${escapeHtml(draft.body)}</textarea>
    <div class="editor-footer"><small>内容会自动保存</small><button type="button" data-action="done" data-date="${entry.date}">完成</button></div>`;
}

function imageThumbnailHtml(entry, image, index, className = 'bubble-thumbnail', showOverflow = true) {
  return `
    <button class="${className}" type="button" data-action="image" data-date="${entry.date}" data-image-index="${index}" aria-label="查看图片：${escapeHtml(image.alt)}">
      <span class="thumbnail-placeholder">载入图片</span>
      ${showOverflow && index === 2 && entry.images.length > 3 ? `<span class="image-more">+${entry.images.length - 3}</span>` : ''}
    </button>`;
}

function galleryHtml(entry) {
  if (!entry.images?.length) return '';
  const items = entry.images.slice(0, 3).map((image, index) => imageThumbnailHtml(entry, image, index)).join('');
  return `<div class="bubble-images" data-gallery-date="${entry.date}">${items}</div>`;
}

function viewerHtml(entry) {
  const content = entry.content === undefined
    ? '<p class="bubble-empty bubble-loading">载入中…</p>'
    : entry.body.trim()
      ? markdownToHtml(entry.body)
      : '<p class="bubble-empty">这一天还没有写下正文。</p>';
  return `
    <div class="bubble-header">
      <div class="bubble-heading">
        <strong>${dateFormatters.weekday.format(dateFromKey(entry.date))}</strong>
        <div class="bubble-meta">${metadataHtml(entry)}</div>
      </div>
      <div class="bubble-actions">
        <button class="bubble-action danger-action" type="button" data-action="delete" data-date="${entry.date}" aria-label="删除这篇日记" title="删除">
          <svg viewBox="0 0 24 24"><path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg>
        </button>
        <button class="bubble-action" type="button" data-action="edit" data-date="${entry.date}" aria-label="编辑这篇日记" title="编辑">
          <svg viewBox="0 0 24 24"><path d="m4 20 4-1 11-11a2.1 2.1 0 0 0-3-3L5 16l-1 4Z"/></svg>
        </button>
      </div>
    </div>
    <div class="bubble-body">${content}</div>
    ${galleryHtml(entry)}`;
}

function renderQuickNavigator() {
  const entries = entriesForActiveView();
  const galleryActive = state.activeView === 'gallery';
  const imageCount = galleryActive
    ? entries.reduce((total, entry) => total + entry.images.length, 0)
    : 0;
  elements.entryCount.textContent = galleryActive ? `${imageCount} 张` : `${entries.length} 篇`;
  elements.yearJumpButton.disabled = entries.length === 0;
  elements.yearDialogList.replaceChildren();
  elements.quickNavList.replaceChildren();
  const groups = new Map();
  for (const entry of entries) {
    const year = entry.date.slice(0, 4);
    const month = entry.date.slice(0, 7);
    const weight = galleryActive ? entry.images.length : 1;
    if (!groups.has(year)) groups.set(year, new Map());
    groups.get(year).set(month, (groups.get(year).get(month) || 0) + weight);
  }
  const fragment = document.createDocumentFragment();
  const yearFragment = document.createDocumentFragment();
  for (const [year, months] of groups) {
    const yearCount = [...months.values()].reduce((total, count) => total + count, 0);
    const yearButton = document.createElement('button');
    yearButton.type = 'button';
    yearButton.className = 'year-choice';
    yearButton.dataset.jumpYear = year;
    yearButton.innerHTML = `<span>${year}</span><span>${yearCount}</span>`;
    yearFragment.append(yearButton);

    const yearLabel = document.createElement('div');
    yearLabel.className = 'quick-year';
    yearLabel.textContent = year;
    fragment.append(yearLabel);
    for (const [month, count] of months) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'quick-month';
      button.dataset.jump = month;
      button.innerHTML = `<span>${Number(month.slice(5))} 月</span><span>${count}</span>`;
      fragment.append(button);
    }
  }
  elements.yearDialogList.append(yearFragment);
  elements.quickNavList.append(fragment);
}

const calendarWeekdays = ['一', '二', '三', '四', '五', '六', '日'];

function defaultCalendarYear() {
  const currentYear = new Date().getFullYear();
  if (state.entries.some((entry) => entry.date.startsWith(`${currentYear}-`))) return currentYear;
  return Number(state.entries[0]?.date.slice(0, 4)) || currentYear;
}

function renderCalendarYearChoices() {
  const counts = new Map();
  for (const entry of state.entries) {
    const year = entry.date.slice(0, 4);
    counts.set(year, (counts.get(year) || 0) + 1);
  }
  const fragment = document.createDocumentFragment();
  for (const [year, count] of counts) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'year-choice';
    button.dataset.jumpYear = year;
    button.innerHTML = `<span>${year}</span><span>${count}</span>`;
    fragment.append(button);
  }
  elements.yearDialogList.replaceChildren(fragment);
  elements.yearJumpButton.disabled = counts.size === 0;
}

function calendarMonthHtml(month, currentDate) {
  const weekdays = calendarWeekdays.map((weekday) => `<span>${weekday}</span>`).join('');
  const cells = month.cells.map((cell) => {
    if (!cell) return '<span class="calendar-day-spacer" aria-hidden="true"></span>';
    const status = cell.recorded ? '已有日记' : '空白日期';
    const action = cell.recorded ? '打开日记' : '新建日记';
    const today = cell.date === currentDate ? ' today' : '';
    return `<button class="calendar-day ${cell.recorded ? 'recorded' : 'empty'}${today}" type="button" data-calendar-date="${cell.date}" aria-label="${cell.date}，${status}，${action}" title="${action}"><span>${cell.day}</span></button>`;
  }).join('');
  return `<section class="calendar-month" data-calendar-month="${month.monthIndex + 1}">
    <header class="calendar-month-header">
      <h2>${month.monthIndex + 1}月</h2>
      <span class="calendar-month-count${month.count ? ' has-entries' : ''}">${month.count} 篇</span>
    </header>
    <div class="calendar-weekdays" aria-hidden="true">${weekdays}</div>
    <div class="calendar-days">${cells}</div>
  </section>`;
}

function renderCalendar({ resetScroll = false } = {}) {
  updateViewChrome();
  const recordedDates = new Set(state.entries.map((entry) => entry.date));
  const months = buildCalendarYear(state.calendarYear, recordedDates);
  const yearCount = months.reduce((total, month) => total + month.count, 0);
  const currentDate = todayKey();
  const previousScrollTop = resetScroll ? 0 : elements.calendarView.scrollTop;
  elements.timelineView.classList.add('hidden');
  elements.wanderView.classList.add('hidden');
  elements.analysisView.classList.add('hidden');
  elements.trashView.classList.add('hidden');
  elements.noResultsView.classList.add('hidden');
  elements.calendarView.classList.remove('hidden');
  elements.entryCount.textContent = `${yearCount} 篇`;
  renderCalendarYearChoices();
  elements.calendarView.innerHTML = `<div class="calendar-inner">
    <header class="calendar-year-toolbar">
      <button class="calendar-year-button" type="button" data-calendar-nav="-1" aria-label="上一年" title="上一年"><svg viewBox="0 0 24 24"><path d="m15 6-6 6 6 6"/></svg></button>
      <div class="calendar-year-copy"><strong>${state.calendarYear}</strong><span>${yearCount ? `共记录 ${yearCount} 篇日记` : '还没有日记，点击日期开始记录'}</span></div>
      <button class="calendar-year-button" type="button" data-calendar-nav="1" aria-label="下一年" title="下一年"><svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg></button>
    </header>
    <div class="calendar-legend" aria-label="日历图例"><span><i class="recorded"></i>已有日记</span><span><i></i>空白日期</span></div>
    <div class="calendar-months">${months.map((month) => calendarMonthHtml(month, currentDate)).join('')}</div>
  </div>`;
  elements.calendarView.scrollTop = previousScrollTop;
}

const wanderDeckDetails = {
  random: {
    title: '随机日记',
    description: '从日记库中随机遇见一段旧时光',
    icon: '<path d="M4 7h3c4.5 0 5.5 10 10 10h3M17 4l3 3-3 3M4 17h3c1.5 0 2.6-1.1 3.6-2.6M14.2 9.5c.8-1.4 1.7-2.5 2.8-2.5h3M17 14l3 3-3 3"/>'
  },
  today: {
    title: '那年今天',
    description: '重逢与今天相隔完整月份的记录',
    icon: '<path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.6M4 4v4.6h4.6M12 7v5l3 2"/>'
  }
};

function prepareWanderDecks({ reshuffle = false } = {}) {
  const referenceDay = todayKey();
  const stale = state.wanderPreparedRevision !== state.wanderRevision
    || state.wanderPreparedDay !== referenceDay;
  if (!stale && !reshuffle) return;
  state.wanderDecks.random = shuffledEntries(state.entries);
  state.wanderDecks.today = entriesAtWholeMonthIntervals(state.entries, referenceDay);
  state.wanderIndices.random = 0;
  state.wanderIndices.today = 0;
  state.wanderPreparedRevision = state.wanderRevision;
  state.wanderPreparedDay = referenceDay;
}

function wanderDistanceLabel(entry) {
  const distance = wholeMonthDistance(entry.date, state.wanderPreparedDay);
  if (!distance) return '旧日相遇';
  const years = Math.floor(distance / 12);
  const months = distance % 12;
  if (!years) return `${months} 个月前`;
  if (!months) return `${years} 年前`;
  return `${years} 年 ${months} 个月前`;
}

function wanderCardBodyHtml(entry) {
  if (entry.content === undefined) {
    return '<div class="wander-card-loading" aria-label="正在读取日记"><i></i><i></i><i></i></div>';
  }
  if (!entry.body.trim()) return '<p class="wander-card-empty">这一天还没有写下正文。</p>';
  const preview = entry.body.length > 1800 ? `${entry.body.slice(0, 1800)}\n\n…` : entry.body;
  return markdownToHtml(preview);
}

function wanderCardHtml(entry, offset, deckName) {
  const date = dateFromKey(entry.date);
  const position = offset === 0 ? 'current' : offset > 0 ? 'next' : 'previous';
  const label = deckName === 'today' ? wanderDistanceLabel(entry) : '随机相遇';
  return `<article class="wander-card is-${position}" data-wander-offset="${offset}" data-date="${entry.date}"${offset ? ' aria-hidden="true" inert' : ''}>
    <header class="wander-card-header">
      <div class="wander-card-date">
        <strong>${date.getFullYear()}</strong>
        <span>${date.getMonth() + 1}月${date.getDate()}日 · ${dateFormatters.weekday.format(date)}</span>
      </div>
      <span class="wander-card-label">${label}</span>
    </header>
    <div class="wander-card-meta">${metadataHtml(entry)}</div>
    <div class="wander-card-body bubble-body">${wanderCardBodyHtml(entry)}</div>
    <footer class="wander-card-footer">
      <span>${entry.date}</span>
      <button type="button" data-wander-open="${entry.date}">打开日记<svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg></button>
    </footer>
  </article>`;
}

function wanderSectionHtml(name) {
  const details = wanderDeckDetails[name];
  const shuffle = name === 'random'
    ? `<button class="wander-control-button" type="button" data-wander-shuffle="random" aria-label="重新随机排列" title="重新随机排列"><svg viewBox="0 0 24 24">${details.icon}</svg></button>`
    : '';
  return `<section class="wander-section" data-wander-section="${name}">
    <header class="wander-section-header">
      <span class="wander-section-icon"><svg viewBox="0 0 24 24">${details.icon}</svg></span>
      <div class="wander-section-title"><h2>${details.title}</h2><p>${details.description}</p></div>
      <div class="wander-controls">
        ${shuffle}
        <button class="wander-control-button" type="button" data-wander-move="-1" data-wander-name="${name}" aria-label="上一张日记"><svg viewBox="0 0 24 24"><path d="m15 6-6 6 6 6"/></svg></button>
        <button class="wander-control-button" type="button" data-wander-move="1" data-wander-name="${name}" aria-label="下一张日记"><svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg></button>
      </div>
    </header>
    <div class="wander-deck" data-wander-deck="${name}" tabindex="0" aria-label="${details.title}卡片"></div>
    <div class="wander-deck-progress"><span data-wander-progress="${name}"></span><i></i></div>
  </section>`;
}

function requestWanderContent(name) {
  const entries = state.wanderDecks[name];
  if (!entries.length) return;
  const current = state.wanderIndices[name];
  const candidates = [
    entries[current],
    entries[wrappedIndex(current + 1, entries.length)],
    entries[wrappedIndex(current - 1, entries.length)]
  ];
  for (const entry of new Set(candidates)) {
    if (!entry || entry.content !== undefined) continue;
    void loadEntryContent(entry.date, { priority: entry === entries[current] }).then(() => {
      if (
        state.activeView === 'wander'
        && !state.wanderAnimating.has(name)
        && state.wanderDecks[name].includes(entry)
      ) renderWanderDeck(name);
    });
  }
}

function renderWanderDeck(name) {
  const deck = elements.wanderView.querySelector(`[data-wander-deck="${name}"]`);
  if (!deck) return;
  deck.classList.remove('is-sliding-next', 'is-sliding-previous');
  const entries = state.wanderDecks[name];
  const section = deck.closest('[data-wander-section]');
  const controls = section.querySelectorAll('[data-wander-move]');
  controls.forEach((button) => { button.disabled = entries.length < 2; });
  const progress = section.querySelector(`[data-wander-progress="${name}"]`);
  if (!entries.length) {
    progress.textContent = '0 / 0';
    deck.innerHTML = `<article class="wander-empty-card">
      <span><svg viewBox="0 0 24 24">${wanderDeckDetails[name].icon}</svg></span>
      <h3>${name === 'today' ? '还没有“那年今天”' : '日记库还是空的'}</h3>
      <p>${name === 'today' ? '当日号相同、且与今天相隔完整月份的日记会出现在这里。' : '写下一篇日记后，再来旧时光里漫步。'}</p>
    </article>`;
    return;
  }

  const current = wrappedIndex(state.wanderIndices[name], entries.length);
  state.wanderIndices[name] = current;
  progress.textContent = `${current + 1} / ${entries.length}`;
  const offsets = entries.length === 1 ? [0] : [-1, 1, 0];
  deck.innerHTML = offsets.map((offset) => (
    wanderCardHtml(entries[wrappedIndex(current + offset, entries.length)], offset, name)
  )).join('');
  requestWanderContent(name);
}

function renderWander({ preserveScroll = false, reshuffle = false } = {}) {
  updateViewChrome();
  prepareWanderDecks({ reshuffle });
  state.wanderAnimationTokens.random += 1;
  state.wanderAnimationTokens.today += 1;
  state.wanderAnimating.clear();
  const scrollTop = preserveScroll ? elements.wanderView.scrollTop : 0;
  elements.timelineView.classList.add('hidden');
  elements.calendarView.classList.add('hidden');
  elements.analysisView.classList.add('hidden');
  elements.trashView.classList.add('hidden');
  elements.noResultsView.classList.add('hidden');
  elements.wanderView.classList.remove('hidden');
  elements.entryCount.textContent = '2 组';
  elements.wanderView.innerHTML = `<div class="wander-inner">
    <header class="wander-hero">
      <span class="wander-hero-icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="m15.5 8.5-2.2 4.8-4.8 2.2 2.2-4.8 4.8-2.2Z"/></svg></span>
      <div><h2>在旧时光里漫步</h2><p>左右切换卡片，随机重逢一段日记。</p></div>
      <button type="button" data-wander-shuffle="random"><svg viewBox="0 0 24 24"><path d="M4 7h3c4.5 0 5.5 10 10 10h3M17 4l3 3-3 3M4 17h3c1.5 0 2.6-1.1 3.6-2.6M14.2 9.5c.8-1.4 1.7-2.5 2.8-2.5h3M17 14l3 3-3 3"/></svg>重新漫步</button>
    </header>
    ${wanderSectionHtml('random')}
    ${wanderSectionHtml('today')}
  </div>`;
  renderWanderDeck('random');
  renderWanderDeck('today');
  elements.wanderView.scrollTop = scrollTop;
}

function shuffleWanderDeck() {
  state.wanderAnimationTokens.random += 1;
  state.wanderAnimating.delete('random');
  state.wanderDecks.random = shuffledEntries(state.entries);
  state.wanderIndices.random = 0;
  renderWanderDeck('random');
}

function moveWanderDeck(name, direction) {
  const entries = state.wanderDecks[name];
  const deck = elements.wanderView.querySelector(`[data-wander-deck="${name}"]`);
  if (!deck || entries.length < 2 || state.wanderAnimating.has(name)) return;
  state.wanderAnimating.add(name);
  const token = ++state.wanderAnimationTokens[name];
  deck.classList.add(direction > 0 ? 'is-sliding-next' : 'is-sliding-previous');
  const delay = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 280;
  setTimeout(() => {
    if (state.wanderAnimationTokens[name] !== token) return;
    deck.classList.remove('is-sliding-next', 'is-sliding-previous');
    state.wanderIndices[name] = wrappedIndex(state.wanderIndices[name] + direction, entries.length);
    state.wanderAnimating.delete(name);
    if (state.activeView === 'wander') renderWanderDeck(name);
  }, delay);
}

function trashDeletedAtLabel(value) {
  const deletedAt = new Date(value);
  return Number.isNaN(deletedAt.getTime()) ? '回收时间未知' : `回收于 ${dateFormatters.deletedAt.format(deletedAt)}`;
}

function trashIsBusy() {
  return Boolean(state.restoringTrashId || state.deletingTrashId || state.emptyingTrash);
}

function trashCardHtml(entry) {
  const date = dateFromKey(entry.date);
  const restoring = state.restoringTrashId === entry.id;
  const deleting = state.deletingTrashId === entry.id;
  const busy = trashIsBusy();
  const duplicateLabel = entry.sequence ? `<span class="trash-version">同日版本 ${entry.sequence + 1}</span>` : '';
  return `<article class="trash-card" data-trash-id="${escapeHtml(entry.id)}">
    <div class="trash-card-copy">
      <div class="trash-card-title"><strong>${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日</strong>${duplicateLabel}</div>
      <span>${dateFormatters.weekday.format(date)} · ${trashDeletedAtLabel(entry.deletedAt)}</span>
    </div>
    <div class="trash-card-actions">
      <button class="trash-delete-button" type="button" data-trash-delete="${escapeHtml(entry.id)}"${busy ? ' disabled' : ''}>
        <svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg>
        ${deleting ? '正在删除' : '删除'}
      </button>
      <button class="trash-restore-button" type="button" data-trash-restore="${escapeHtml(entry.id)}"${busy ? ' disabled' : ''}>
        <svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.6M4 4v4.6h4.6"/></svg>
        ${restoring ? '正在恢复' : '恢复'}
      </button>
    </div>
  </article>`;
}

function renderTrashLoading() {
  elements.timelineView.classList.add('hidden');
  elements.calendarView.classList.add('hidden');
  elements.wanderView.classList.add('hidden');
  elements.analysisView.classList.add('hidden');
  elements.noResultsView.classList.add('hidden');
  elements.trashView.classList.remove('hidden');
  elements.trashView.innerHTML = `<div class="trash-loading" aria-label="正在读取已回收日记"><span></span><strong>正在整理回收内容</strong></div>`;
  elements.entryCount.textContent = '读取中';
  elements.yearJumpButton.disabled = true;
  elements.yearDialogList.replaceChildren();
  elements.quickNavList.replaceChildren();
}

function renderTrash() {
  updateViewChrome();
  elements.timelineView.classList.add('hidden');
  elements.calendarView.classList.add('hidden');
  elements.wanderView.classList.add('hidden');
  elements.analysisView.classList.add('hidden');
  elements.noResultsView.classList.add('hidden');
  elements.trashView.classList.remove('hidden');
  elements.entryCount.textContent = `${state.trashEntries.length} 篇`;
  elements.yearJumpButton.disabled = true;
  elements.yearDialogList.replaceChildren();
  elements.quickNavList.replaceChildren();
  const content = state.trashEntries.length
    ? `<div class="trash-grid">${state.trashEntries.map(trashCardHtml).join('')}</div>`
    : `<div class="trash-empty">
        <span><svg viewBox="0 0 24 24"><path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg></span>
        <h3>回收中还没有日记</h3>
        <p>删除的 Markdown 日记会保存在日记库根目录的 .Trash 文件夹中。</p>
      </div>`;
  elements.trashView.innerHTML = `<div class="trash-inner">
    <header class="trash-hero">
      <span class="trash-hero-icon"><svg viewBox="0 0 24 24"><path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg></span>
      <div><h2>已回收的日记</h2><p>文件保存在当前日记库的 <code>.Trash</code> 文件夹中；清空后无法恢复。</p></div>
      <div class="trash-hero-actions">
        <button class="trash-empty-trigger" type="button" data-trash-empty${state.trashEntries.length && !trashIsBusy() ? '' : ' disabled'}>
          <svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg>
          <span>${state.emptyingTrash ? '正在清空' : '清空'}</span>
        </button>
        <button class="trash-refresh-button" type="button" data-trash-refresh aria-label="刷新回收内容" title="刷新"${trashIsBusy() ? ' disabled' : ''}><svg viewBox="0 0 24 24"><path d="M20 6v5h-5M4 18v-5h5M18.5 9A7 7 0 0 0 6.2 6.2L4 8M5.5 15A7 7 0 0 0 17.8 17.8L20 16"/></svg></button>
      </div>
    </header>
    ${content}
  </div>`;
}

async function loadTrashView({ showLoading = true } = {}) {
  const requestId = ++state.viewRequest;
  if (showLoading) renderTrashLoading();
  setSaveStatus('saving', '读取回收');
  try {
    const entries = await dataSource.listTrash();
    if (requestId !== state.viewRequest || state.activeView !== 'trash') return false;
    state.trashEntries = entries;
    renderTrash();
    setSaveStatus('saved', '已同步');
    return true;
  } catch (error) {
    if (requestId !== state.viewRequest || state.activeView !== 'trash') return false;
    renderTrash();
    setSaveStatus('error', '读取失败');
    showSnackbar(`回收读取失败：${error.message}`);
    return false;
  }
}

async function restoreTrashFromView(id) {
  if (!id || trashIsBusy()) return;
  state.restoringTrashId = id;
  renderTrash();
  try {
    const result = await dataSource.restoreTrash(id);
    state.trashEntries = state.trashEntries.filter((entry) => entry.id !== id);
    if (!entryForDate(result.date)) {
      state.entries.push(normalizeEntry({ date: result.date }));
      state.entries.sort((left, right) => right.date.localeCompare(left.date));
      rebuildEntryIndex();
      state.wanderRevision += 1;
      state.galleryIndexLoaded = false;
    }
    showSnackbar('日记已恢复到时间轴');
  } catch (error) {
    showSnackbar(`恢复失败：${error.message}`);
  } finally {
    state.restoringTrashId = null;
    if (state.activeView === 'trash') renderTrash();
  }
}

function openTrashDeleteDialog(request, title, subject) {
  if (elements.trashDeleteDialog.open) return;
  state.pendingTrashDelete = request;
  elements.trashDeleteTitle.textContent = title;
  elements.trashDeleteSubject.textContent = subject;
  elements.trashDeleteDialog.showModal();
}

function requestEmptyTrash() {
  if (!state.trashEntries.length || trashIsBusy()) return;
  openTrashDeleteDialog(
    { type: 'all' },
    '清空回收站？',
    `${state.trashEntries.length} 篇已回收日记`
  );
}

function requestDeleteTrashFromView(id) {
  if (!id || trashIsBusy()) return;
  const entry = state.trashEntries.find((item) => item.id === id);
  if (!entry) return;
  const date = dateFromKey(entry.date);
  const version = entry.sequence ? `（同日版本 ${entry.sequence + 1}）` : '';
  openTrashDeleteDialog(
    { type: 'entry', id: entry.id },
    '永久删除这篇日记？',
    `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日${version}`
  );
}

async function confirmTrashDelete() {
  const request = state.pendingTrashDelete;
  if (!request || trashIsBusy()) return;
  if (request.type === 'all' && !state.trashEntries.length) return;
  if (request.type === 'entry' && !state.trashEntries.some((entry) => entry.id === request.id)) return;
  state.emptyingTrash = request.type === 'all';
  state.deletingTrashId = request.type === 'entry' ? request.id : null;
  const submitButton = elements.trashDeleteForm.querySelector('[type="submit"]');
  submitButton.disabled = true;
  elements.cancelTrashDeleteButton.disabled = true;
  submitButton.textContent = '正在删除';
  if (state.activeView === 'trash') renderTrash();
  try {
    if (request.type === 'all') {
      const result = await dataSource.emptyTrash();
      state.trashEntries = [];
      showSnackbar(result.deletedCount ? `已永久删除 ${result.deletedCount} 篇日记` : '回收站已经为空');
    } else {
      await dataSource.deleteTrash(request.id);
      state.trashEntries = state.trashEntries.filter((entry) => entry.id !== request.id);
      showSnackbar('已永久删除这篇日记');
    }
    elements.trashDeleteDialog.close();
  } catch (error) {
    elements.trashDeleteDialog.close();
    showSnackbar(`${request.type === 'all' ? '清空' : '删除'}失败：${error.message}`);
    if (state.activeView === 'trash') await loadTrashView({ showLoading: false });
  } finally {
    state.emptyingTrash = false;
    state.deletingTrashId = null;
    state.pendingTrashDelete = null;
    submitButton.disabled = false;
    elements.cancelTrashDeleteButton.disabled = false;
    submitButton.textContent = '永久删除';
    if (state.activeView === 'trash') renderTrash();
  }
}

const analysisNumberFormatter = new Intl.NumberFormat('zh-CN');
const analysisWeekdayNames = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

function formatAnalysisNumber(value) {
  return analysisNumberFormatter.format(Number(value) || 0);
}

function analysisMonthLabel(month) {
  if (!/^\d{4}-\d{2}$/.test(month)) return month;
  return `${month.slice(0, 4)}年${Number(month.slice(5))}月`;
}

function analysisMonthEnd(month) {
  const [year, monthNumber] = month.split('-').map(Number);
  const day = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return `${month}-${String(day).padStart(2, '0')}`;
}

function analysisHeroHtml({ loading = false } = {}) {
  return `<header class="analysis-hero">
    <span class="analysis-hero-icon"><svg viewBox="0 0 24 24"><path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/><path d="m4 8 6-4 6 6 5-4"/></svg></span>
    <div><h2>日记洞察</h2><p>在本地 SQLite 中分析正文与已有地点信息；日记文件和 Frontmatter 始终保持原样。</p></div>
    <button type="button" data-analysis-refresh aria-label="重新建立分析索引" title="重新建立分析索引"${loading ? ' disabled' : ''}><svg viewBox="0 0 24 24"><path d="M20 6v5h-5M4 18v-5h5M18.5 9A7 7 0 0 0 6.2 6.2L4 8M5.5 15A7 7 0 0 0 17.8 17.8L20 16"/></svg></button>
  </header>`;
}

function analysisFilterHtml(analysis = state.analysis) {
  const firstDate = state.entries.at(-1)?.date || analysis?.range?.firstDate || '';
  const lastDate = state.entries[0]?.date || analysis?.range?.lastDate || '';
  return `<form class="analysis-filter" data-analysis-filter>
    <label><span>开始日期</span><input type="date" name="startDate" value="${escapeHtml(state.analysisStartDate)}"${firstDate ? ` min="${firstDate}"` : ''}${lastDate ? ` max="${lastDate}"` : ''}></label>
    <label><span>结束日期</span><input type="date" name="endDate" value="${escapeHtml(state.analysisEndDate)}"${firstDate ? ` min="${firstDate}"` : ''}${lastDate ? ` max="${lastDate}"` : ''}></label>
    <div class="analysis-filter-actions">
      <button class="analysis-text-button" type="button" data-analysis-reset>全部时间</button>
      <button class="analysis-filled-button" type="submit">应用范围</button>
    </div>
  </form>`;
}

function analysisMetricHtml(label, value, helper) {
  return `<article class="analysis-metric"><span>${label}</span><strong>${value}</strong><small>${helper}</small></article>`;
}

function analysisMonthlyHtml(monthly) {
  if (!monthly.length) return '<div class="analysis-section-empty">所选范围内还没有可绘制的月份。</div>';
  const maximum = Math.max(...monthly.map((item) => item.wordCount), 1);
  return `<div class="analysis-month-chart" aria-label="每月词数趋势">
    ${monthly.map((item) => {
      const height = Math.max(5, Math.round((item.wordCount / maximum) * 100));
      return `<button class="analysis-month-column" type="button" data-analysis-month="${item.month}" title="${analysisMonthLabel(item.month)}：${formatAnalysisNumber(item.wordCount)} 词，${item.entryCount} 篇">
        <span class="analysis-month-value">${formatAnalysisNumber(item.wordCount)}</span>
        <i style="--analysis-bar-height:${height}%"></i>
        <span>${Number(item.month.slice(5))}月</span>
        <small>${item.month.slice(0, 4)}</small>
      </button>`;
    }).join('')}
  </div>`;
}

function analysisWeekdayHtml(weekdays) {
  const maximum = Math.max(...weekdays.map((item) => item.entryCount), 1);
  return `<div class="analysis-weekdays">
    ${weekdays.map((item, index) => `<div class="analysis-weekday-row">
      <span>${analysisWeekdayNames[index]}</span>
      <i><b style="width:${Math.round((item.entryCount / maximum) * 100)}%"></b></i>
      <strong>${item.entryCount}</strong>
    </div>`).join('')}
  </div>`;
}

function analysisTermsHtml(terms) {
  if (!terms.length) return '<div class="analysis-section-empty">正文词语不足，暂时无法生成词频。</div>';
  const maximum = Math.max(...terms.map((item) => item.count), 1);
  const cloud = terms.slice(0, 28).map((item) => {
    const scale = 0.82 + (item.count / maximum) * 0.72;
    return `<button type="button" data-analysis-term="${escapeHtml(item.term)}" style="font-size:${scale.toFixed(2)}rem" title="搜索“${escapeHtml(item.term)}”">${escapeHtml(item.term)}<small>${formatAnalysisNumber(item.count)}</small></button>`;
  }).join('');
  const ranking = terms.slice(0, 12).map((item, index) => `<button type="button" data-analysis-term="${escapeHtml(item.term)}">
    <span>${index + 1}</span><strong>${escapeHtml(item.term)}</strong><i><b style="width:${Math.round((item.count / maximum) * 100)}%"></b></i><em>${formatAnalysisNumber(item.count)}</em>
  </button>`).join('');
  return `<div class="analysis-terms-layout"><div class="analysis-word-cloud">${cloud}</div><div class="analysis-term-ranking">${ranking}</div></div>`;
}

function analysisAssociationsHtml(associations) {
  if (!associations.length) {
    return '<div class="analysis-section-empty">至少需要 8 个记录日和足够重复的词语，才会显示稳定的共同出现关系。</div>';
  }
  return `<div class="analysis-associations">${associations.map((item) => `<article>
    <div><button type="button" data-analysis-term="${escapeHtml(item.left)}">${escapeHtml(item.left)}</button><svg viewBox="0 0 24 24"><path d="M5 12h14M14 7l5 5-5 5"/></svg><button type="button" data-analysis-term="${escapeHtml(item.right)}">${escapeHtml(item.right)}</button></div>
    <p>共同出现 ${item.supportDays} 天 · 提升度 ${item.lift.toFixed(2)}</p>
  </article>`).join('')}</div>`;
}

function analysisLocationsHtml(locations) {
  const summary = locations?.summary || {};
  const topLocations = Array.isArray(locations?.topLocations) ? locations.topLocations : [];
  const districts = Array.isArray(locations?.districts) ? locations.districts : [];
  const mapPoints = Array.isArray(locations?.mapPoints) ? locations.mapPoints : [];
  const locationEntryCount = Number(summary.locationEntryCount) || 0;
  if (!locationEntryCount || !topLocations.length) {
    return '<div class="analysis-section-empty">所选范围内还没有填写地点。新建或编辑日记时，可继续使用现有的“地点”字段。</div>';
  }

  const uniqueLocationCount = Number(summary.uniqueLocationCount) || 0;
  const geocodedEntryCount = Number(summary.geocodedEntryCount) || 0;
  const unresolvedEntryCount = Math.max(0, Number(summary.unresolvedEntryCount ?? locationEntryCount - geocodedEntryCount) || 0);
  const uniqueDistrictCount = Number(summary.uniqueDistrictCount) || 0;
  const maximumLocationCount = Math.max(...topLocations.map((item) => Number(item.entryCount) || 0), 1);
  const maximumDistrictCount = Math.max(...districts.map((item) => Number(item.entryCount) || 0), 1);
  const ranking = topLocations.map((item, index) => {
    const count = Number(item.entryCount) || 0;
    const geocodedCount = Number(item.geocodedEntryCount) || 0;
    const coordinateLabel = geocodedCount === count
      ? '坐标均已确认'
      : geocodedCount
        ? `${geocodedCount} 篇已确认坐标`
        : '仅有地点文字';
    return `<button type="button" data-analysis-location="${escapeHtml(item.name)}" title="搜索地点“${escapeHtml(item.name)}”">
      <span>${index + 1}</span>
      <span class="analysis-location-name"><strong>${escapeHtml(item.name)}</strong><small>${coordinateLabel}</small></span>
      <i aria-hidden="true"><b style="width:${Math.round((count / maximumLocationCount) * 100)}%"></b></i>
      <em>${formatAnalysisNumber(count)} 篇</em>
    </button>`;
  }).join('');
  const districtRanking = districts.length
    ? districts.map((item) => {
      const count = Number(item.entryCount) || 0;
      return `<div class="analysis-district-row">
        <span title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>
        <i aria-hidden="true"><b style="width:${Math.round((count / maximumDistrictCount) * 100)}%"></b></i>
        <strong>${formatAnalysisNumber(count)}</strong>
      </div>`;
    }).join('')
    : '<div class="analysis-location-secondary-empty">确认高德地点后，这里会按行政区汇总。</div>';
  const migrationCallout = unresolvedEntryCount
    ? `<div class="analysis-location-migration">
        <span><svg viewBox="0 0 24 24"><path d="M18 10c0 4.5-6 10-6 10S6 14.5 6 10a6 6 0 1 1 12 0Z"/><circle cx="12" cy="10" r="2"/><path d="M3 4h5M5.5 1.5v5"/></svg></span>
        <div><strong>${formatAnalysisNumber(unresolvedEntryCount)} 条旧地点只有文字</strong><small>分组确认高德候选后，坐标只保存到本地 SQLite，原始日记保持不变。</small></div>
        <button type="button" data-location-migration-open>补全旧地点</button>
      </div>`
    : '';
  const mapCallout = mapPoints.length
    ? `<div class="analysis-location-map">
        <span><svg viewBox="0 0 24 24"><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z"/><path d="M9 3v15M15 6v15"/><circle cx="15" cy="11" r="2"/></svg></span>
        <strong>${formatAnalysisNumber(mapPoints.length)} 个地点</strong>
        <button type="button" data-location-map-open${desktop ? '' : ' disabled'}>打开地图</button>
      </div>`
    : '';

  return `<div class="analysis-location-summary" aria-label="地点统计摘要">
      <article><span>有地点记录</span><strong>${formatAnalysisNumber(locationEntryCount)}</strong></article>
      <article><span>不同地点</span><strong>${formatAnalysisNumber(uniqueLocationCount)}</strong></article>
      <article><span>已确认坐标</span><strong>${formatAnalysisNumber(geocodedEntryCount)}</strong></article>
      <article><span>行政区</span><strong>${formatAnalysisNumber(uniqueDistrictCount)}</strong></article>
    </div>
    ${mapCallout}
    ${migrationCallout}
    <div class="analysis-location-layout">
      <div class="analysis-location-ranking" aria-label="常去地点排行">
        <div class="analysis-location-subhead"><strong>常去地点</strong></div>
        ${ranking}
      </div>
      <div class="analysis-district-ranking" aria-label="行政区分布">
        <div class="analysis-location-subhead"><strong>行政区分布</strong></div>
        ${districtRanking}
      </div>
    </div>`;
}

function analysisHighlights(analysis) {
  const highlights = [];
  const summary = analysis.summary;
  if (summary.entryCount) {
    highlights.push(`所选范围包含 ${formatAnalysisNumber(summary.entryCount)} 个记录日，共 ${formatAnalysisNumber(summary.wordCount)} 个分词。`);
    highlights.push(`平均每个记录日 ${formatAnalysisNumber(summary.averageWordsPerEntry)} 词，最长连续记录 ${summary.longestStreak} 天。`);
  }
  const busiestMonth = [...analysis.monthly].sort((left, right) => right.wordCount - left.wordCount)[0];
  if (busiestMonth) highlights.push(`${analysisMonthLabel(busiestMonth.month)}的正文词数最高，为 ${formatAnalysisNumber(busiestMonth.wordCount)}。`);
  if (analysis.topTerms[0]) {
    const term = analysis.topTerms[0];
    highlights.push(`高频实词“${term.term}”出现 ${formatAnalysisNumber(term.count)} 次，分布在 ${term.documentCount} 个记录日。`);
  }
  if (analysis.associations[0]) {
    const pair = analysis.associations[0];
    highlights.push(`“${pair.left}”与“${pair.right}”共同出现 ${pair.supportDays} 天；这表示文本关联，不代表因果关系。`);
  }
  const locationSummary = analysis.locations?.summary;
  const topLocation = analysis.locations?.topLocations?.[0];
  if (locationSummary?.locationEntryCount) {
    const coverage = Math.round(locationSummary.coverageRate * 100);
    const frequent = topLocation
      ? `最常记录“${topLocation.name}”，共 ${topLocation.entryCount} 天。`
      : '';
    highlights.push(`${formatAnalysisNumber(locationSummary.locationEntryCount)} 个记录日填写了地点，覆盖率 ${coverage}%；${frequent}`);
    if (locationSummary.geocodedEntryCount) {
      highlights.push(`${formatAnalysisNumber(locationSummary.geocodedEntryCount)} 个地点记录已确认坐标，分布在 ${formatAnalysisNumber(locationSummary.uniqueDistrictCount)} 个行政区。`);
    }
  }
  return highlights;
}

function renderAnalysisLoading() {
  updateViewChrome();
  elements.timelineView.classList.add('hidden');
  elements.calendarView.classList.add('hidden');
  elements.wanderView.classList.add('hidden');
  elements.trashView.classList.add('hidden');
  elements.noResultsView.classList.add('hidden');
  elements.analysisView.classList.remove('hidden');
  elements.entryCount.textContent = '分析中';
  elements.yearJumpButton.disabled = true;
  elements.yearDialogList.replaceChildren();
  elements.quickNavList.replaceChildren();
  elements.analysisView.innerHTML = `<div class="analysis-inner">
    ${analysisHeroHtml({ loading: true })}
    <div class="analysis-loading" aria-live="polite">
      <span></span><strong data-analysis-progress-text>正在检查日记索引</strong>
      <div><i data-analysis-progress-bar></i></div>
      <small>首次分析会读取正文和现有地点字段，并写入日记库中的 .shiguang/analysis.sqlite3</small>
    </div>
  </div>`;
  updateAnalysisProgress(state.analysisProgress);
}

function updateAnalysisProgress(progress) {
  state.analysisProgress = progress || null;
  if (state.activeView !== 'analysis' || !state.analysisLoading) return;
  const label = elements.analysisView.querySelector('[data-analysis-progress-text]');
  const bar = elements.analysisView.querySelector('[data-analysis-progress-bar]');
  if (!label || !bar || !progress) return;
  const total = Number(progress.total) || 0;
  const completed = Number(progress.completed) || 0;
  const percentage = total ? Math.min(100, Math.round((completed / total) * 100)) : 100;
  label.textContent = total
    ? `正在分析 ${completed} / ${total} 篇日记`
    : '正在整理分析数据库';
  bar.style.width = `${percentage}%`;
}

function renderAnalysisError(error) {
  state.analysisLoading = false;
  elements.analysisView.innerHTML = `<div class="analysis-inner">
    ${analysisHeroHtml()}
    <div class="analysis-error"><span><svg viewBox="0 0 24 24"><path d="M12 8v5M12 17h.01"/><path d="M10.3 4.2 2.9 17a2 2 0 0 0 1.7 3h14.8a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z"/></svg></span><h3>暂时无法生成洞察</h3><p>${escapeHtml(error.message || '分析失败')}</p><button type="button" data-analysis-retry>重试</button></div>
  </div>`;
  elements.entryCount.textContent = '失败';
}

function renderAnalysis() {
  updateViewChrome();
  state.analysisLoading = false;
  const analysis = state.analysis;
  elements.timelineView.classList.add('hidden');
  elements.calendarView.classList.add('hidden');
  elements.wanderView.classList.add('hidden');
  elements.trashView.classList.add('hidden');
  elements.noResultsView.classList.add('hidden');
  elements.analysisView.classList.remove('hidden');
  elements.yearJumpButton.disabled = true;
  elements.yearDialogList.replaceChildren();
  elements.quickNavList.replaceChildren();
  if (!analysis) {
    renderAnalysisError(new Error('分析结果不存在'));
    return;
  }
  const summary = analysis.summary;
  elements.entryCount.textContent = `${summary.entryCount} 篇`;
  const synchronized = analysis.synchronizedAt
    ? dateFormatters.deletedAt.format(new Date(analysis.synchronizedAt))
    : '尚未同步';
  const highlights = analysisHighlights(analysis);
  const content = summary.entryCount
    ? `<div class="analysis-metrics">
        ${analysisMetricHtml('记录日', formatAnalysisNumber(summary.activeDays), `覆盖率 ${Math.round(summary.coverageRate * 100)}%`)}
        ${analysisMetricHtml('正文词数', formatAnalysisNumber(summary.wordCount), `${formatAnalysisNumber(summary.characterCount)} 个非空字符`)}
        ${analysisMetricHtml('篇均词数', formatAnalysisNumber(summary.averageWordsPerEntry), `${formatAnalysisNumber(summary.paragraphCount)} 个段落`)}
        ${analysisMetricHtml('最长连续', `${summary.longestStreak} 天`, summary.currentStreak ? `当前连续 ${summary.currentStreak} 天` : '当前没有连续记录')}
      </div>
      <section class="analysis-card analysis-wide-card"><header><div><small>时间序列</small><h3>每月正文词数</h3></div><span>点击月份可限定范围</span></header>${analysisMonthlyHtml(analysis.monthly)}</section>
      <div class="analysis-two-columns">
        <section class="analysis-card"><header><div><small>记录节律</small><h3>星期分布</h3></div><span>按记录日统计</span></header>${analysisWeekdayHtml(analysis.weekdays)}</section>
        <section class="analysis-card"><header><div><small>确定性摘要</small><h3>本期概览</h3></div><span>不使用生成式模型</span></header><ul class="analysis-highlights">${highlights.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></section>
      </div>
      <section class="analysis-card analysis-wide-card"><header><div><h3>地点统计</h3></div></header>${analysisLocationsHtml(analysis.locations)}</section>
      <section class="analysis-card analysis-wide-card"><header><div><small>词频统计</small><h3>常见实词</h3></div><span>点击词语可搜索原日记</span></header>${analysisTermsHtml(analysis.topTerms)}</section>
      <section class="analysis-card analysis-wide-card"><header><div><small>频繁模式</small><h3>同日共同出现</h3></div><span>支持度至少 5%，提升度至少 1.2</span></header>${analysisAssociationsHtml(analysis.associations)}</section>`
    : `<div class="analysis-empty"><span><svg viewBox="0 0 24 24"><path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/></svg></span><h3>所选范围内还没有日记</h3><p>写下日记或调整日期范围后，即可生成本地洞察。</p></div>`;
  elements.analysisView.innerHTML = `<div class="analysis-inner">
    ${analysisHeroHtml()}
    ${analysisFilterHtml(analysis)}
    ${content}
    <footer class="analysis-method">
      <div><strong>本地、只读分析</strong><p>文字分析会忽略 Frontmatter、代码、公式和链接地址；地点统计只读取现有的“地点”字段及本地坐标数据库。不会修改任何 Markdown 文件，分析索引可删除后重建。</p></div>
      <div><span>上次同步</span><strong>${escapeHtml(synchronized)}</strong><code title="${escapeHtml(analysis.database.path)}">${escapeHtml(analysis.database.path)}</code></div>
    </footer>
  </div>`;
}

async function loadAnalysisView({ force = false } = {}) {
  const requestId = ++state.viewRequest;
  state.analysisLoading = true;
  state.analysisProgress = null;
  renderAnalysisLoading();
  setSaveStatus('saving', force ? '重建索引' : '生成洞察');
  const options = {
    startDate: state.analysisStartDate,
    endDate: state.analysisEndDate,
    termLimit: 48
  };
  try {
    const analysis = force
      ? await dataSource.reindexAnalysis(options)
      : await dataSource.getAnalysisInsights(options);
    if (requestId !== state.viewRequest || state.activeView !== 'analysis') return false;
    state.analysis = analysis;
    renderAnalysis();
    setSaveStatus('saved', '已同步');
    return true;
  } catch (error) {
    if (requestId !== state.viewRequest || state.activeView !== 'analysis') return false;
    renderAnalysisError(error);
    setSaveStatus('error', '分析失败');
    showSnackbar(`洞察生成失败：${error.message}`);
    return false;
  }
}

function renderActiveView(options = {}) {
  if (state.activeView === 'analysis') {
    if (state.analysisLoading) renderAnalysisLoading();
    else renderAnalysis();
    return;
  }
  if (state.activeView === 'calendar') {
    renderCalendar(options);
    return;
  }
  if (state.activeView === 'wander') {
    renderWander(options);
    return;
  }
  if (state.activeView === 'trash') {
    renderTrash(options);
    return;
  }
  renderQuickNavigator();
  renderTimeline(options);
}

function prepareVisibleEntries() {
  if (!state.query) state.visibleEntries = entriesForActiveView();
}

function galleryArticleHtml(entry) {
  const date = dateFromKey(entry.date);
  const thumbnails = entry.images
    .map((image, index) => imageThumbnailHtml(entry, image, index, 'gallery-thumbnail', false))
    .join('');
  return `<article class="timeline-entry gallery-entry" data-date="${entry.date}">
    <time class="timeline-date" datetime="${entry.date}" title="${dateFormatters.full.format(date)}">
      <strong>${String(date.getDate()).padStart(2, '0')}</strong>
      <span>${dateFormatters.month.format(date)}</span>
    </time>
    <span class="timeline-dot" aria-hidden="true"></span>
    <div class="gallery-day">
      <div class="gallery-day-header"><strong>${dateFormatters.weekday.format(date)}</strong><span>${entry.images.length} 张</span></div>
      <div class="gallery-images" data-gallery-date="${entry.date}">${thumbnails}</div>
    </div>
  </article>`;
}

function timelineArticleHtml(entry) {
  if (state.activeView === 'gallery') return galleryArticleHtml(entry);
  const date = dateFromKey(entry.date);
  return `<article class="timeline-entry" data-date="${entry.date}">
    <time class="timeline-date" datetime="${entry.date}" title="${dateFormatters.full.format(date)}">
      <strong>${String(date.getDate()).padStart(2, '0')}</strong>
      <span>${dateFormatters.month.format(date)}</span>
    </time>
    <span class="timeline-dot" aria-hidden="true"></span>
    <div class="bubble${state.editingDate === entry.date ? ' editing' : ''}">
      ${state.editingDate === entry.date ? editorHtml(entry) : viewerHtml(entry)}
    </div>
  </article>`;
}

function createMonthSection(group, index) {
  const section = document.createElement('section');
  section.className = 'timeline-month-section';
  section.dataset.monthSection = group.key;
  section.dataset.monthIndex = String(index);
  section.innerHTML = `${group.yearBoundary
    ? `<div class="timeline-year" data-year-marker="${group.year}">${group.year}</div>`
    : ''}
    <div class="timeline-month" data-month="${group.key}">${Number(group.key.slice(5))} 月</div>
    ${group.entries.map(timelineArticleHtml).join('')}`;
  return section;
}

function captureRenderedMonthHeights() {
  elements.timelineView.querySelectorAll('[data-month-section]').forEach((section) => {
    const height = section.offsetHeight;
    if (height > 0) state.measuredMonthHeights.set(section.dataset.monthSection, height);
  });
}

function refreshMonthOffsets() {
  state.monthOffsets = buildMonthOffsets(state.timelineGroups, state.measuredMonthHeights);
}

function recycleVirtualWindow(range, scrollTop) {
  const inner = elements.timelineView.querySelector('.timeline-inner');
  const overlaps = range.start < state.virtualEnd && range.end > state.virtualStart;
  if (!inner || !overlaps) return false;

  const anchorIndex = Math.max(range.start, state.virtualStart);
  const anchor = inner.querySelector(`[data-month-index="${anchorIndex}"]`);
  const anchorTop = anchor?.getBoundingClientRect().top;
  const oldStart = state.virtualStart;
  const oldEnd = state.virtualEnd;
  inner.querySelectorAll('[data-month-index]').forEach((section) => {
    const index = Number(section.dataset.monthIndex);
    if (index < range.start || index >= range.end) section.remove();
  });

  let firstSection = inner.querySelector('[data-month-index]');
  for (let index = Math.min(oldStart, range.end) - 1; index >= range.start; index -= 1) {
    const section = createMonthSection(state.timelineGroups[index], index);
    inner.insertBefore(section, firstSection || inner.querySelector('.timeline-spacer-bottom'));
    firstSection = section;
  }
  const bottomSpacer = inner.querySelector('.timeline-spacer-bottom');
  for (let index = Math.max(oldEnd, range.start); index < range.end; index += 1) {
    inner.insertBefore(createMonthSection(state.timelineGroups[index], index), bottomSpacer);
  }

  inner.querySelector('.timeline-spacer-top').style.height = `${state.monthOffsets[range.start]}px`;
  bottomSpacer.style.height = `${state.monthOffsets.at(-1) - state.monthOffsets[range.end]}px`;
  state.virtualStart = range.start;
  state.virtualEnd = range.end;
  state.suppressVirtualScroll = true;
  elements.timelineView.scrollTop = scrollTop;
  if (anchor && Number.isFinite(anchorTop)) {
    elements.timelineView.scrollTop += anchor.getBoundingClientRect().top - anchorTop;
  }
  requestAnimationFrame(() => {
    state.suppressVirtualScroll = false;
  });
  observeUnloadedEntries();
  observeGalleries();
  return true;
}

function renderVirtualWindow(centerIndex, { scrollTop = elements.timelineView.scrollTop, jumpMonth = null, force = false } = {}) {
  if (!state.timelineGroups.length) return;
  captureRenderedMonthHeights();
  refreshMonthOffsets();
  const range = virtualRange(state.timelineGroups.length, centerIndex, VIRTUAL_MONTH_WINDOW);
  if (!force && range.start === state.virtualStart && range.end === state.virtualEnd) return;
  if (!force && recycleVirtualWindow(range, scrollTop)) return;

  const inner = document.createElement('div');
  inner.className = 'timeline-inner';
  const topSpacer = document.createElement('div');
  topSpacer.className = 'timeline-spacer timeline-spacer-top';
  topSpacer.style.height = `${state.monthOffsets[range.start]}px`;
  inner.append(topSpacer);
  for (let index = range.start; index < range.end; index += 1) {
    inner.append(createMonthSection(state.timelineGroups[index], index));
  }
  const bottomSpacer = document.createElement('div');
  bottomSpacer.className = 'timeline-spacer timeline-spacer-bottom';
  bottomSpacer.style.height = `${state.monthOffsets.at(-1) - state.monthOffsets[range.end]}px`;
  inner.append(bottomSpacer);

  state.virtualStart = range.start;
  state.virtualEnd = range.end;
  state.suppressVirtualScroll = true;
  elements.timelineView.replaceChildren(inner);
  elements.timelineView.scrollTop = scrollTop;
  if (jumpMonth) {
    const target = inner.querySelector(`[data-month="${jumpMonth}"]`);
    if (target) {
      const section = target.closest('[data-month-section]');
      elements.timelineView.scrollTop = (section?.offsetTop || 0) + target.offsetTop;
      target.classList.add('jump-target');
    }
  }
  requestAnimationFrame(() => {
    state.suppressVirtualScroll = false;
  });
  observeUnloadedEntries();
  observeGalleries();
}

function renderTimeline({ preserveScroll = false, targetMonth = null } = {}) {
  updateViewChrome();
  elements.calendarView.classList.add('hidden');
  elements.wanderView.classList.add('hidden');
  elements.analysisView.classList.add('hidden');
  elements.trashView.classList.add('hidden');
  const previousScrollTop = preserveScroll ? elements.timelineView.scrollTop : 0;
  const previousGroup = state.timelineGroups.length
    ? state.timelineGroups[Math.min(state.timelineGroups.length - 1, Math.floor((state.virtualStart + state.virtualEnd) / 2))]
    : null;
  captureRenderedMonthHeights();
  prepareVisibleEntries();
  elements.timelineView.replaceChildren();

  if (!state.visibleEntries.length) {
    state.timelineGroups = [];
    state.monthOffsets = [0];
    elements.timelineView.classList.add('hidden');
    elements.noResultsView.classList.remove('hidden');
    return;
  }

  elements.noResultsView.classList.add('hidden');
  elements.timelineView.classList.remove('hidden');
  const layoutKey = `${state.activeView}\u0000${state.query}\u0000${state.visibleEntries.length}\u0000${state.visibleEntries[0].date}\u0000${state.visibleEntries.at(-1).date}`;
  if (state.timelineLayoutKey !== layoutKey) {
    state.timelineLayoutKey = layoutKey;
    state.measuredMonthHeights.clear();
  }
  state.timelineGroups = groupEntriesByMonth(state.visibleEntries);
  refreshMonthOffsets();

  let centerIndex = 0;
  if (targetMonth) {
    centerIndex = state.timelineGroups.findIndex((group) => group.key === targetMonth);
  } else if (preserveScroll && previousGroup) {
    centerIndex = state.timelineGroups.findIndex((group) => group.key === previousGroup.key);
  }
  if (centerIndex < 0) centerIndex = 0;
  renderVirtualWindow(centerIndex, {
    scrollTop: targetMonth ? state.monthOffsets[centerIndex] : previousScrollTop,
    jumpMonth: targetMonth,
    force: true
  });
}

function handleVirtualTimelineScroll() {
  if (state.timelineFocusDate || state.suppressVirtualScroll || state.virtualScrollFrame || !state.timelineGroups.length) return;
  state.virtualScrollFrame = requestAnimationFrame(() => {
    state.virtualScrollFrame = 0;
    const sections = [...elements.timelineView.querySelectorAll('[data-month-index]')];
    if (!sections.length) return;
    const center = elements.timelineView.scrollTop + elements.timelineView.clientHeight / 2;
    const visibleSection = sections.find((section) => center >= section.offsetTop && center < section.offsetTop + section.offsetHeight);
    let centerIndex;
    if (visibleSection) {
      centerIndex = Number(visibleSection.dataset.monthIndex);
    } else {
      captureRenderedMonthHeights();
      refreshMonthOffsets();
      centerIndex = findMonthIndexAtOffset(state.monthOffsets, center);
    }
    if (centerIndex < 0) return;
    const nearStart = centerIndex <= state.virtualStart + 1 && state.virtualStart > 0;
    const nearEnd = centerIndex >= state.virtualEnd - 2 && state.virtualEnd < state.timelineGroups.length;
    if (nearStart || nearEnd || !visibleSection) renderVirtualWindow(centerIndex);
  });
}

let contentObserver;
const contentRequests = new Map();
const contentLoadQueue = [];
let activeContentLoads = 0;

function drainContentLoadQueue() {
  while (activeContentLoads < CONTENT_LOAD_CONCURRENCY && contentLoadQueue.length) {
    const item = contentLoadQueue.shift();
    activeContentLoads += 1;
    Promise.resolve()
      .then(item.task)
      .then(item.resolve, item.reject)
      .finally(() => {
        activeContentLoads -= 1;
        drainContentLoadQueue();
      });
  }
}

function enqueueContentLoad(task, priority = false) {
  return new Promise((resolve, reject) => {
    const item = { task, resolve, reject };
    if (priority) contentLoadQueue.unshift(item);
    else contentLoadQueue.push(item);
    drainContentLoadQueue();
  });
}

function observeUnloadedEntries() {
  contentObserver?.disconnect();
  if (state.activeView === 'gallery') return;
  const unloadedElements = [...elements.timelineView.querySelectorAll('.timeline-entry')].filter((element) => (
    entryForDate(element.dataset.date)?.content === undefined
  ));
  if (!unloadedElements.length) return;
  contentObserver = new IntersectionObserver((observations) => {
    const rootBounds = elements.timelineView.getBoundingClientRect();
    const viewportCenter = rootBounds.top + rootBounds.height / 2;
    const visible = observations
      .filter((observation) => observation.isIntersecting)
      .sort((a, b) => Math.abs(a.boundingClientRect.top - viewportCenter)
        - Math.abs(b.boundingClientRect.top - viewportCenter));
    for (const observation of visible) {
      contentObserver.unobserve(observation.target);
      void loadEntryContent(observation.target.dataset.date);
    }
  }, { root: elements.timelineView, rootMargin: '1000px 0px' });
  unloadedElements.forEach((element) => contentObserver.observe(element));
}

async function loadEntryContent(date, { priority = false } = {}) {
  const entry = entryForDate(date);
  if (!entry || entry.content !== undefined) return entry;
  if (!contentRequests.has(date)) {
    const request = enqueueContentLoad(async () => {
      try {
        const loaded = normalizeEntry(await dataSource.readEntry(date));
        Object.assign(entry, loaded);
        const element = elements.timelineView.querySelector(`.timeline-entry[data-date="${date}"]`);
        if (element && state.editingDate !== date) {
          const bubble = element.querySelector('.bubble');
          if (bubble) {
            bubble.innerHTML = viewerHtml(entry);
            observeGalleries();
          }
        }
        return entry;
      } catch (error) {
        showSnackbar(`读取失败：${error.message}`);
        return null;
      }
    }, priority);
    contentRequests.set(date, request);
    void request.finally(() => {
      if (contentRequests.get(date) === request) contentRequests.delete(date);
    });
  }
  return contentRequests.get(date);
}

const imageCache = new Map();
let galleryObserver;

async function resolveImageUrl(entry, index) {
  const image = entry.images[index];
  if (!image) throw new Error('图片不存在');
  const key = `${entry.date}\u0000${image.source}`;
  if (!imageCache.has(key)) {
    const request = dataSource.readImage(entry.date, image.source).catch((error) => {
      imageCache.delete(key);
      throw error;
    });
    imageCache.set(key, request);
  }
  return imageCache.get(key);
}

function waitForImageWorkSlot() {
  return new Promise((resolve) => {
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(resolve, { timeout: 120 });
    } else {
      setTimeout(resolve, 16);
    }
  });
}

async function hydrateThumbnail(entry, button) {
  const index = Number(button.dataset.imageIndex);
  try {
    const url = await resolveImageUrl(entry, index);
    const image = document.createElement('img');
    image.alt = entry.images[index].alt;
    image.loading = 'lazy';
    image.decoding = 'async';
    image.fetchPriority = 'low';
    image.src = url;
    await Promise.race([
      image.decode().catch(() => undefined),
      new Promise((resolve) => setTimeout(resolve, 200))
    ]);
    if (!button.isConnected) return;
    button.querySelector('.thumbnail-placeholder')?.replaceWith(image);
  } catch {
    const placeholder = button.querySelector('.thumbnail-placeholder');
    if (placeholder) placeholder.textContent = '无法读取';
  }
}

async function hydrateGallery(gallery) {
  if (gallery.dataset.loaded === 'true') return;
  gallery.dataset.loaded = 'true';
  const entry = entryForDate(gallery.dataset.galleryDate);
  if (!entry) return;
  const buttons = [...gallery.querySelectorAll('.bubble-thumbnail, .gallery-thumbnail')];
  for (let start = 0; start < buttons.length; start += 6) {
    await waitForImageWorkSlot();
    if (!gallery.isConnected) return;
    await Promise.all(buttons.slice(start, start + 6).map((button) => hydrateThumbnail(entry, button)));
  }
}

function observeGalleries() {
  galleryObserver?.disconnect();
  galleryObserver = new IntersectionObserver((observations) => {
    for (const observation of observations) {
      if (!observation.isIntersecting) continue;
      galleryObserver.unobserve(observation.target);
      void hydrateGallery(observation.target);
    }
  }, { root: elements.timelineView, rootMargin: '420px' });
  elements.timelineView
    .querySelectorAll('.bubble-images:not([data-loaded="true"]), .gallery-images:not([data-loaded="true"])')
    .forEach((gallery) => galleryObserver.observe(gallery));
}

function currentPreviewEntry() {
  return entryForDate(state.previewDate);
}

let imageDrag = null;

function endImageDrag() {
  const drag = imageDrag;
  imageDrag = null;
  elements.imageStage.classList.remove('is-panning');
  if (drag && elements.imageStage.hasPointerCapture(drag.id)) {
    elements.imageStage.releasePointerCapture(drag.id);
  }
}

function layoutImagePreview({ center = false } = {}) {
  endImageDrag();
  const stageWidth = elements.imageStage.clientWidth;
  const stageHeight = elements.imageStage.clientHeight;
  const naturalWidth = elements.imagePreview.naturalWidth;
  const naturalHeight = elements.imagePreview.naturalHeight;
  if (!stageWidth || !stageHeight || !naturalWidth || !naturalHeight) return;

  const fitScale = Math.min(
    Math.max(1, stageWidth - 48) / naturalWidth,
    Math.max(1, stageHeight - 48) / naturalHeight,
    1
  );
  const width = Math.max(1, naturalWidth * fitScale * state.previewZoom);
  const height = Math.max(1, naturalHeight * fitScale * state.previewZoom);
  elements.imagePreview.style.width = `${width}px`;
  elements.imagePreview.style.height = `${height}px`;
  elements.imageCanvas.style.width = `${Math.max(stageWidth, width + 48)}px`;
  elements.imageCanvas.style.height = `${Math.max(stageHeight, height + 48)}px`;
  elements.imageStage.classList.toggle('can-pan',
    elements.imageStage.scrollWidth > elements.imageStage.clientWidth
    || elements.imageStage.scrollHeight > elements.imageStage.clientHeight
  );

  if (center) {
    elements.imageStage.scrollLeft = Math.max(0, (elements.imageStage.scrollWidth - stageWidth) / 2);
    elements.imageStage.scrollTop = Math.max(0, (elements.imageStage.scrollHeight - stageHeight) / 2);
  }
}

function setImageZoom(value, pointer = null) {
  const nextZoom = Math.min(5, Math.max(0.25, Number(value) || 1));
  const stage = elements.imageStage;
  const rect = stage.getBoundingClientRect();
  const pointX = pointer ? pointer.clientX - rect.left : stage.clientWidth / 2;
  const pointY = pointer ? pointer.clientY - rect.top : stage.clientHeight / 2;
  const ratioX = (stage.scrollLeft + pointX) / Math.max(1, stage.scrollWidth);
  const ratioY = (stage.scrollTop + pointY) / Math.max(1, stage.scrollHeight);

  state.previewZoom = nextZoom;
  elements.imageZoomText.textContent = `${Math.round(nextZoom * 100)}%`;
  layoutImagePreview();

  requestAnimationFrame(() => {
    stage.scrollLeft = ratioX * stage.scrollWidth - pointX;
    stage.scrollTop = ratioY * stage.scrollHeight - pointY;
  });
}

function resetImageZoom() {
  state.previewZoom = 1;
  elements.imageZoomText.textContent = '100%';
  layoutImagePreview({ center: true });
}

async function showPreviewImage(index) {
  const entry = currentPreviewEntry();
  const count = entry?.images?.length || 0;
  if (!entry || !count) return;

  endImageDrag();
  elements.imageStage.classList.remove('can-pan');
  const normalizedIndex = ((Number(index) || 0) % count + count) % count;
  const requestId = ++state.previewRequest;
  state.previewIndex = normalizedIndex;
  state.previewZoom = 1;
  elements.imageCounter.textContent = `${normalizedIndex + 1} / ${count}`;
  elements.imageZoomText.textContent = '100%';
  elements.previousImageButton.disabled = count < 2;
  elements.nextImageButton.disabled = count < 2;
  elements.imagePreview.alt = entry.images[normalizedIndex]?.alt || '日记图片预览';
  elements.imagePreview.removeAttribute('src');

  try {
    const url = await resolveImageUrl(entry, normalizedIndex);
    if (requestId !== state.previewRequest || state.previewDate !== entry.date) return;
    let loaded = false;
    const handleLoaded = () => {
      if (loaded || requestId !== state.previewRequest) return;
      loaded = true;
      resetImageZoom();
    };
    elements.imagePreview.onload = handleLoaded;
    elements.imagePreview.onerror = () => {
      if (requestId === state.previewRequest) showSnackbar('图片无法显示');
    };
    elements.imagePreview.src = url;
    if (elements.imagePreview.complete && elements.imagePreview.naturalWidth) requestAnimationFrame(handleLoaded);
  } catch (error) {
    if (requestId === state.previewRequest) showSnackbar(`图片读取失败：${error.message}`);
  }
}

async function openImagePreview(date, index) {
  const entry = entryForDate(date);
  if (!entry?.images?.length) return;
  state.previewDate = date;
  if (!elements.imageDialog.open) elements.imageDialog.showModal();
  await showPreviewImage(index);
}

function switchPreviewImage(direction) {
  if (!state.previewDate || (currentPreviewEntry()?.images?.length || 0) < 2) return;
  void showPreviewImage(state.previewIndex + direction);
}

function renderGalleryLoading() {
  elements.noResultsView.classList.add('hidden');
  elements.timelineView.classList.remove('hidden');
  elements.timelineView.replaceChildren();
  const loading = document.createElement('div');
  loading.className = 'gallery-loading';
  loading.innerHTML = '<span></span><strong>正在整理图片</strong><small>首次打开时需要读取 Markdown 图片索引</small>';
  elements.timelineView.append(loading);
  elements.entryCount.textContent = '读取中';
  elements.yearJumpButton.disabled = true;
  elements.yearDialogList.replaceChildren();
  elements.quickNavList.replaceChildren();
}

async function ensureGalleryIndex() {
  if (state.galleryIndexLoaded) return;
  if (state.galleryLoadPromise) return state.galleryLoadPromise;
  const requestId = ++state.galleryRequest;
  const request = (async () => {
    const indexedEntries = await dataSource.listImages();
    if (requestId !== state.galleryRequest) return;
    for (const indexed of indexedEntries) {
      const entry = entryForDate(indexed.date);
      if (entry) entry.images = indexed.images;
    }
    state.galleryIndexLoaded = true;
  })();
  state.galleryLoadPromise = request;
  try {
    await request;
  } finally {
    if (state.galleryLoadPromise === request) state.galleryLoadPromise = null;
  }
}

async function setActiveView(view, { targetMonth = null } = {}) {
  clearTimelineEntryFocus();
  const target = ['gallery', 'calendar', 'wander', 'analysis', 'trash'].includes(view) ? view : 'diary';
  const requestId = ++state.viewRequest;
  try {
    await flushSave();
  } catch {
    return false;
  }
  if (requestId !== state.viewRequest) return false;
  state.activeView = target;
  state.editingDate = null;
  state.draft = null;
  state.query = '';
  elements.searchInput.value = '';
  state.timelineLayoutKey = '';
  state.measuredMonthHeights.clear();
  contentObserver?.disconnect();
  galleryObserver?.disconnect();
  updateViewChrome();
  applyNavigatorVisibility();
  closeSidebar();

  if (target === 'calendar') {
    state.visibleEntries = state.entries;
    renderCalendar();
    setSaveStatus('saved', '已同步');
    return true;
  }

  if (target === 'wander') {
    state.visibleEntries = state.entries;
    renderWander({ reshuffle: true });
    setSaveStatus('saved', '已同步');
    return true;
  }

  if (target === 'analysis') {
    state.visibleEntries = state.entries;
    return loadAnalysisView();
  }

  if (target === 'trash') {
    state.visibleEntries = state.entries;
    return loadTrashView();
  }

  elements.calendarView.classList.add('hidden');
  elements.wanderView.classList.add('hidden');
  elements.analysisView.classList.add('hidden');
  elements.trashView.classList.add('hidden');

  if (target === 'gallery') {
    renderGalleryLoading();
    setSaveStatus('saving', '整理图片');
    try {
      await ensureGalleryIndex();
    } catch (error) {
      if (requestId === state.viewRequest) showSnackbar(`图库读取失败：${error.message}`);
    }
    if (requestId !== state.viewRequest || state.activeView !== 'gallery') return false;
  }

  state.visibleEntries = entriesForActiveView();
  renderQuickNavigator();
  renderTimeline({ targetMonth });
  setSaveStatus('saved', '已同步');
  return true;
}

async function loadDirectory() {
  setSaveStatus('saving', '读取中');
  try {
    const data = await dataSource.listEntries();
    state.galleryRequest += 1;
    state.galleryLoadPromise = null;
    state.galleryIndexLoaded = false;
    state.analysis = null;
    state.analysisLoading = false;
    state.analysisProgress = null;
    state.analysisStartDate = '';
    state.analysisEndDate = '';
    if (elements.locationMapDialog.open) closeLocationMap();
    state.locationMapPage = 0;
    state.locationMapError = '';
    state.locationMigration = null;
    state.locationMigrationSourceKey = '';
    state.locationMigrationCandidates = [];
    state.trashEntries = [];
    state.viewRequest += 1;
    state.activeView = 'diary';
    state.directorySelected = true;
    state.directoryPath = data.path;
    state.entries = data.entries.map(normalizeEntry).sort((a, b) => b.date.localeCompare(a.date));
    rebuildEntryIndex();
    state.wanderRevision += 1;
    state.wanderPreparedRevision = -1;
    state.calendarYear = defaultCalendarYear();
    state.visibleEntries = state.entries;
    state.measuredMonthHeights.clear();
    contentRequests.clear();
    imageCache.clear();
    state.query = '';
    elements.searchInput.value = '';
    updateViewChrome();
    showSelectedState();
    renderQuickNavigator();
    renderTimeline();
    setSaveStatus('saved', '已同步');
  } catch (error) {
    setSaveStatus('error', '读取失败');
    showSnackbar(error.message);
  }
}

async function chooseDirectory() {
  try {
    await flushSave();
    const result = await dataSource.chooseDirectory();
    if (result.canceled) return;
    state.directoryPath = result.path;
    await loadDirectory();
    closeSidebar();
    if (result.created) showSnackbar('已创建并打开日记目录');
  } catch (error) {
    showSnackbar(error.message);
  }
}

let locationSearchTimer;

function closeLocationSuggestions({ invalidate = true } = {}) {
  clearTimeout(locationSearchTimer);
  locationSearchTimer = null;
  if (invalidate) state.locationSearchRequest += 1;
  state.locationCandidates = [];
  state.locationActiveIndex = -1;
  state.locationSearching = false;
  elements.composeLocationSuggestions.replaceChildren();
  elements.composeLocationSuggestions.classList.add('hidden');
  elements.composeLocationInput.setAttribute('aria-expanded', 'false');
  elements.composeLocationInput.removeAttribute('aria-activedescendant');
}

function updateComposeLocationMapButton() {
  const available = Boolean(desktop && state.draft?.savedLocation && state.draft.date === state.composeDate);
  elements.composeLocationMapButton.hidden = !available;
}

function locationSecondaryText(candidate) {
  const parts = [candidate.district, candidate.address].filter(Boolean);
  return [...new Set(parts)].join(' · ') || '高德地图地点';
}

function renderLocationSuggestions(message = '') {
  const list = elements.composeLocationSuggestions;
  list.replaceChildren();
  if (!state.composeDate || (!message && !state.locationCandidates.length)) {
    list.classList.add('hidden');
    elements.composeLocationInput.setAttribute('aria-expanded', 'false');
    return;
  }
  if (message) {
    const status = document.createElement('div');
    status.className = 'location-suggestion-status';
    status.textContent = message;
    list.append(status);
  } else {
    state.locationCandidates.forEach((candidate, index) => {
      const option = document.createElement('button');
      option.type = 'button';
      option.id = `location-option-${index}`;
      option.className = 'location-suggestion';
      option.dataset.locationIndex = String(index);
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', String(index === state.locationActiveIndex));
      option.classList.toggle('active', index === state.locationActiveIndex);

      const text = document.createElement('span');
      text.className = 'location-suggestion-text';
      const name = document.createElement('strong');
      name.textContent = candidate.displayName;
      const secondary = document.createElement('small');
      secondary.textContent = locationSecondaryText(candidate);
      text.append(name, secondary);

      const confirm = document.createElement('span');
      confirm.className = 'location-suggestion-confirm';
      confirm.textContent = '选择';
      option.append(text, confirm);
      list.append(option);
    });
  }
  list.classList.remove('hidden');
  elements.composeLocationInput.setAttribute('aria-expanded', 'true');
}

function setActiveLocationCandidate(index) {
  if (!state.locationCandidates.length) return;
  state.locationActiveIndex = (index + state.locationCandidates.length) % state.locationCandidates.length;
  renderLocationSuggestions();
  const active = elements.composeLocationSuggestions.querySelector(`#location-option-${state.locationActiveIndex}`);
  elements.composeLocationInput.setAttribute('aria-activedescendant', active.id);
  active.scrollIntoView({ block: 'nearest' });
}

function selectLocationCandidate(index) {
  if (!state.draft || state.draft.date !== state.composeDate) return;
  const candidate = state.locationCandidates[index];
  if (!candidate) return;
  state.draft.savedLocation = { ...candidate };
  state.draft.fields.地点 = candidate.displayName;
  elements.composeLocationInput.value = candidate.displayName;
  closeLocationSuggestions();
  updateComposeLocationMapButton();
  markDirty();
  void flushSave().catch(() => undefined);
}

function scheduleLocationSearch() {
  clearTimeout(locationSearchTimer);
  locationSearchTimer = null;
  const query = elements.composeLocationInput.value.trim();
  const requestId = ++state.locationSearchRequest;
  state.locationCandidates = [];
  state.locationActiveIndex = -1;
  elements.composeLocationInput.removeAttribute('aria-activedescendant');
  if ([...query].length < 2) {
    renderLocationSuggestions();
    return;
  }
  if (!desktop) {
    renderLocationSuggestions('高德地点搜索仅在桌面应用中可用');
    return;
  }
  if (!state.amapKeyConfigured) {
    renderLocationSuggestions('请先在设置中配置高德 Web 服务 Key');
    return;
  }
  state.locationSearching = true;
  renderLocationSuggestions('正在搜索高德地点…');
  locationSearchTimer = setTimeout(async () => {
    try {
      const candidates = await dataSource.searchLocations(query);
      if (requestId !== state.locationSearchRequest || query !== elements.composeLocationInput.value.trim()) return;
      state.locationSearching = false;
      state.locationCandidates = candidates;
      state.locationActiveIndex = candidates.length ? 0 : -1;
      if (candidates.length) {
        renderLocationSuggestions();
        elements.composeLocationInput.setAttribute('aria-activedescendant', 'location-option-0');
      } else {
        renderLocationSuggestions('没有找到匹配地点，可继续手动填写');
      }
    } catch (error) {
      if (requestId !== state.locationSearchRequest) return;
      state.locationSearching = false;
      renderLocationSuggestions(error.message);
    }
  }, 320);
}

function handleLocationSearchKeydown(event) {
  if (event.isComposing) return;
  if (event.key === 'Escape') {
    closeLocationSuggestions();
    return;
  }
  if (!state.locationCandidates.length) return;
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    setActiveLocationCandidate(state.locationActiveIndex + (event.key === 'ArrowDown' ? 1 : -1));
  } else if (event.key === 'Enter') {
    event.preventDefault();
    selectLocationCandidate(Math.max(0, state.locationActiveIndex));
  }
}

function locationMapPoints() {
  return Array.isArray(state.analysis?.locations?.mapPoints)
    ? state.analysis.locations.mapPoints
    : [];
}

function activeLocationMapPage() {
  const points = locationMapPoints();
  const pageCount = Math.max(1, Math.ceil(points.length / LOCATION_MAP_PAGE_SIZE));
  state.locationMapPage = Math.min(pageCount - 1, Math.max(0, state.locationMapPage));
  const start = state.locationMapPage * LOCATION_MAP_PAGE_SIZE;
  return { points: points.slice(start, start + LOCATION_MAP_PAGE_SIZE), start, pageCount };
}

function locationMapPointHtml(point, index) {
  const marker = LOCATION_MAP_MARKERS[index];
  const sourceNames = Array.isArray(point.sourceNames) ? point.sourceNames.filter(Boolean) : [];
  const aliases = sourceNames.filter((name) => name !== point.name);
  const alias = aliases.length
    ? `日记中记为：${aliases.join('、')}`
    : '';
  const detail = [point.district, point.address].filter(Boolean).join(' · ') || '已确认高德坐标';
  const dateRange = point.firstDate === point.lastDate
    ? point.firstDate
    : `${point.firstDate} — ${point.lastDate}`;
  return `<article class="location-map-point">
    <span class="location-map-marker"><b>${marker}</b></span>
    <div><strong>${escapeHtml(point.name)}</strong><small>${escapeHtml(detail)}</small>${alias ? `<small>${escapeHtml(alias)}</small>` : ''}<code>${Number(point.longitude).toFixed(6)}, ${Number(point.latitude).toFixed(6)}</code><em>${escapeHtml(dateRange)} · ${formatAnalysisNumber(point.entryCount)} 篇</em></div>
    <button type="button" data-location-map-point="${index}" aria-label="在高德地图中打开“${escapeHtml(point.name)}”" title="在高德地图中打开"><svg viewBox="0 0 24 24"><path d="M14 5h5v5M19 5l-7 7"/><path d="M18 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg></button>
  </article>`;
}

function renderLocationMap() {
  const allPoints = locationMapPoints();
  const { points, start, pageCount } = activeLocationMapPage();
  if (!allPoints.length) {
    elements.locationMapView.innerHTML = '<div class="location-map-empty"><strong>暂无可显示坐标</strong></div>';
    return;
  }
  const mapContent = state.locationMapUrl
    ? `<img src="${escapeHtml(state.locationMapUrl)}" alt="当前统计范围的高德地点地图" decoding="async">`
    : '<div class="location-map-placeholder"><svg viewBox="0 0 24 24"><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z"/><path d="M9 3v15M15 6v15"/></svg></div>';
  const loading = state.locationMapLoading
    ? '<div class="location-map-loading"><span></span><strong>正在生成地点地图</strong></div>'
    : '';
  const error = state.locationMapError
    ? `<div class="location-map-error"><span><svg viewBox="0 0 24 24"><path d="M12 8v5M12 17h.01"/><path d="M10.3 4.2 2.9 17a2 2 0 0 0 1.7 3h14.8a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z"/></svg></span><strong>暂时无法显示地图</strong><p>${escapeHtml(state.locationMapError)}</p><div><button type="button" data-location-map-retry>重试</button>${!state.amapKeyConfigured ? '<button type="button" data-location-map-settings>配置 Key</button>' : ''}</div></div>`
    : '';
  elements.locationMapView.innerHTML = `<div class="location-map-layout">
    <section class="location-map-canvas">
      <div class="location-map-image">${mapContent}${loading}${error}</div>
    </section>
    <aside class="location-map-points">
      <header><strong>${formatAnalysisNumber(allPoints.length)} 个地点</strong><span>${start + 1}–${start + points.length} / ${allPoints.length}</span></header>
      <div class="location-map-point-list">${points.map(locationMapPointHtml).join('')}</div>
      <footer><button type="button" data-location-map-page="-1"${state.locationMapPage === 0 ? ' disabled' : ''}><svg viewBox="0 0 24 24"><path d="m15 5-7 7 7 7"/></svg>上一页</button><span>第 ${state.locationMapPage + 1} / ${pageCount} 页</span><button type="button" data-location-map-page="1"${state.locationMapPage >= pageCount - 1 ? ' disabled' : ''}>下一页<svg viewBox="0 0 24 24"><path d="m9 5 7 7-7 7"/></svg></button></footer>
    </aside>
  </div>`;
  const image = elements.locationMapView.querySelector('.location-map-image > img');
  image?.addEventListener('error', () => {
    if (!state.locationMapUrl) return;
    state.locationMapUrl = '';
    state.locationMapError = '地图图像加载失败，请重试';
    renderLocationMap();
  }, { once: true });
}

async function loadLocationMapPage() {
  const { points } = activeLocationMapPage();
  if (!points.length) return;
  const requestId = ++state.locationMapRequest;
  state.locationMapLoading = true;
  state.locationMapError = '';
  state.locationMapUrl = '';
  renderLocationMap();
  try {
    if (!state.amapKeyConfigured) throw new Error('请先在设置中配置高德 Web 服务 Key');
    const snapshot = await dataSource.createLocationMap(points);
    if (requestId !== state.locationMapRequest) return;
    state.locationMapUrl = snapshot.url;
  } catch (error) {
    if (requestId !== state.locationMapRequest) return;
    state.locationMapError = friendlyErrorMessage(error, '地图生成失败');
  } finally {
    if (requestId !== state.locationMapRequest) return;
    state.locationMapLoading = false;
    renderLocationMap();
  }
}

function openLocationMap() {
  if (!desktop) {
    showSnackbar('地点地图仅在桌面应用中可用');
    return;
  }
  if (!locationMapPoints().length) {
    showSnackbar('当前统计范围没有已确认坐标');
    return;
  }
  state.locationMapPage = 0;
  state.locationMapUrl = '';
  state.locationMapError = '';
  if (!elements.locationMapDialog.open) elements.locationMapDialog.showModal();
  renderLocationMap();
  void loadLocationMapPage();
}

function closeLocationMap() {
  state.locationMapRequest += 1;
  state.locationMapLoading = false;
  state.locationMapUrl = '';
  elements.locationMapView.querySelector('img')?.removeAttribute('src');
  void dataSource.cancelLocationMap().catch(() => undefined);
  if (elements.locationMapDialog.open) elements.locationMapDialog.close();
}

function changeLocationMapPage(direction) {
  const pageCount = Math.ceil(locationMapPoints().length / LOCATION_MAP_PAGE_SIZE);
  const next = Math.min(pageCount - 1, Math.max(0, state.locationMapPage + direction));
  if (next === state.locationMapPage) return;
  state.locationMapPage = next;
  void loadLocationMapPage();
}

function openLocationMapPoint(index) {
  const point = activeLocationMapPage().points[index];
  if (!point) return;
  void dataSource.previewLocation({
    provider: 'amap',
    displayName: point.name,
    address: point.address || '',
    district: point.district || '',
    longitude: point.longitude,
    latitude: point.latitude,
    coordinateSystem: point.coordinateSystem
  }).catch((error) => showSnackbar(error.message));
}

function activeLocationMigrationGroup() {
  const groups = state.locationMigration?.groups || [];
  return groups.find((group) => group.sourceKey === state.locationMigrationSourceKey) || groups[0] || null;
}

function resetLocationMigrationResolver(group) {
  state.locationMigrationSearchRequest += 1;
  state.locationMigrationSourceKey = group?.sourceKey || '';
  state.locationMigrationCandidates = [];
  state.locationMigrationSelectedIndex = -1;
  state.locationMigrationSearching = false;
  state.locationMigrationQuery = group?.sourceLabel || '';
  state.locationMigrationCity = '';
  state.locationMigrationScope = 'all';
  state.locationMigrationDate = group?.dates?.[0] || '';
  state.locationMigrationStartDate = group?.firstDate || '';
  state.locationMigrationEndDate = group?.lastDate || '';
  state.locationMigrationError = '';
}

function locationMigrationScope() {
  if (state.locationMigrationScope === 'single') {
    return { type: 'single', date: state.locationMigrationDate };
  }
  if (state.locationMigrationScope === 'range') {
    return {
      type: 'range',
      startDate: state.locationMigrationStartDate,
      endDate: state.locationMigrationEndDate
    };
  }
  return { type: 'all' };
}

function locationMigrationSummaryHtml(status) {
  const summary = status.summary;
  return `<section class="location-migration-summary" aria-label="旧地点迁移进度">
    <article><span>地点记录</span><strong>${formatAnalysisNumber(summary.locationEntryCount)}</strong><small>来自现有 Markdown</small></article>
    <article><span>已确认</span><strong>${formatAnalysisNumber(summary.confirmedEntryCount)}</strong><small>可以直接打开地图</small></article>
    <article><span>待补全</span><strong>${formatAnalysisNumber(summary.pendingEntryCount)}</strong><small>${formatAnalysisNumber(summary.pendingGroupCount)} 个同名组</small></article>
    <article><span>已跳过 / 冲突</span><strong>${formatAnalysisNumber(summary.skippedEntryCount + summary.conflictEntryCount)}</strong><small>${summary.conflictEntryCount} 条需要复核</small></article>
  </section>`;
}

function locationMigrationGroupsHtml(status, active) {
  if (!status.groups.length) {
    return `<div class="location-migration-groups-empty">
      <svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg>
      <strong>没有待补全地点</strong>
      <span>${status.summary.skippedEntryCount ? '可重置已跳过记录后继续。' : '旧地点坐标已经处理完成。'}</span>
    </div>`;
  }
  return status.groups.map((group) => `<button type="button" data-migration-group="${escapeHtml(group.sourceKey)}" class="${active?.sourceKey === group.sourceKey ? 'active' : ''}">
    <span class="location-migration-group-icon"><svg viewBox="0 0 24 24"><path d="M18 10c0 4.5-6 10-6 10S6 14.5 6 10a6 6 0 1 1 12 0Z"/><circle cx="12" cy="10" r="2"/></svg></span>
    <span><strong>${escapeHtml(group.sourceLabel)}</strong><small>${group.firstDate} — ${group.lastDate}</small></span>
    <em>${formatAnalysisNumber(group.entryCount)} 篇</em>
  </button>`).join('');
}

function locationMigrationCandidateHtml(candidate, index) {
  const selected = index === state.locationMigrationSelectedIndex;
  const secondary = [candidate.district, candidate.address].filter(Boolean).join(' · ') || '高德地图地点';
  return `<article class="location-migration-candidate${selected ? ' selected' : ''}">
    <button type="button" data-migration-candidate="${index}" aria-pressed="${selected}">
      <span class="location-migration-radio"></span>
      <span><strong>${escapeHtml(candidate.displayName)}</strong><small>${escapeHtml(secondary)}</small><code>${candidate.longitude}, ${candidate.latitude}</code></span>
    </button>
    <button type="button" data-migration-preview="${index}" aria-label="在高德地图中预览“${escapeHtml(candidate.displayName)}”" title="在高德地图中预览"><svg viewBox="0 0 24 24"><path d="M14 5h5v5M19 5l-7 7"/><path d="M18 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg></button>
  </article>`;
}

function locationMigrationScopeFieldsHtml(group) {
  if (state.locationMigrationScope === 'single') {
    return `<label class="location-migration-scope-detail"><span>日记日期</span><select name="singleDate">
      ${group.dates.map((date) => `<option value="${date}"${date === state.locationMigrationDate ? ' selected' : ''}>${date}</option>`).join('')}
    </select></label>`;
  }
  if (state.locationMigrationScope === 'range') {
    return `<div class="location-migration-date-range">
      <label><span>开始日期</span><input name="startDate" type="date" min="${group.firstDate}" max="${group.lastDate}" value="${state.locationMigrationStartDate}"></label>
      <label><span>结束日期</span><input name="endDate" type="date" min="${group.firstDate}" max="${group.lastDate}" value="${state.locationMigrationEndDate}"></label>
    </div>`;
  }
  return `<p class="location-migration-scope-note">将应用到这组 ${formatAnalysisNumber(group.entryCount)} 篇同名日记；原始“${escapeHtml(group.sourceLabel)}”文字保持不变。</p>`;
}

function locationMigrationResolverHtml(status, group) {
  if (!group) {
    const conflicts = status.conflicts.slice(0, 4).map((item) => `<li><strong>${item.date}</strong><span>“${escapeHtml(item.sourceLabel)}”与已保存的“${escapeHtml(item.savedDisplayName)}”不一致</span></li>`).join('');
    return `<section class="location-migration-complete">
      <span><svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg></span>
      <h3>待补全地点已处理完毕</h3>
      <p>Markdown 文件没有被修改。今后仍可从洞察重新打开此工具。</p>
      ${conflicts ? `<div><strong>仍有 ${status.summary.conflictEntryCount} 条冲突</strong><ul>${conflicts}</ul><small>可在对应日记中重新搜索并确认坐标。</small></div>` : ''}
    </section>`;
  }
  const selected = state.locationMigrationCandidates[state.locationMigrationSelectedIndex];
  const candidates = state.locationMigrationSearching
    ? '<div class="location-migration-search-state"><span></span>正在搜索高德地点…</div>'
    : state.locationMigrationCandidates.length
      ? state.locationMigrationCandidates.map(locationMigrationCandidateHtml).join('')
      : '<div class="location-migration-search-state">输入与旧称对应的真实地点，并从高德候选中确认。</div>';
  return `<section class="location-migration-resolver">
    <header><div><small>原始地点</small><h3>${escapeHtml(group.sourceLabel)}</h3></div><span>${formatAnalysisNumber(group.entryCount)} 篇 · ${group.firstDate} 至 ${group.lastDate}</span></header>
    ${!state.amapKeyConfigured ? '<div class="location-migration-key-warning"><span>高德 Web 服务 Key 尚未配置。</span><button type="button" data-migration-settings>打开设置</button></div>' : ''}
    <form class="location-migration-search" data-migration-search>
      <label><span>高德搜索词</span><input name="query" value="${escapeHtml(state.locationMigrationQuery)}" autocomplete="off" placeholder="可与原始地点不同，例如用小区名搜索“家”" required></label>
      <label class="location-migration-city"><span>城市 adcode（可选）</span><input name="city" value="${escapeHtml(state.locationMigrationCity)}" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" placeholder="例如 110000"></label>
      <button type="submit"${state.locationMigrationSearching || !state.amapKeyConfigured ? ' disabled' : ''}><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>搜索</button>
    </form>
    <p class="location-migration-privacy">仅搜索词和可选城市编码会发送给高德；日记正文、日期和文件名不会离开本机。</p>
    ${state.locationMigrationError ? `<div class="location-migration-inline-error">${escapeHtml(state.locationMigrationError)}</div>` : ''}
    <div class="location-migration-candidates">${candidates}</div>
    <form class="location-migration-apply" data-migration-apply>
      <div class="location-migration-scope-row">
        <label><span>应用范围</span><select name="scope">
          <option value="all"${state.locationMigrationScope === 'all' ? ' selected' : ''}>全部同名日记</option>
          <option value="range"${state.locationMigrationScope === 'range' ? ' selected' : ''}>指定日期范围</option>
          <option value="single"${state.locationMigrationScope === 'single' ? ' selected' : ''}>仅一篇日记</option>
        </select></label>
        ${locationMigrationScopeFieldsHtml(group)}
      </div>
      <div class="location-migration-selection">
        ${selected ? `<span><small>将保存为</small><strong>${escapeHtml(selected.displayName)}</strong></span>` : '<span><small>尚未选择候选</small><strong>先搜索并选择真实地点</strong></span>'}
        <div><button class="location-migration-skip" type="button" data-migration-skip${state.locationMigrationMutating ? ' disabled' : ''}>跳过这组</button><button class="location-migration-confirm" type="submit"${!selected || state.locationMigrationMutating ? ' disabled' : ''}>${state.locationMigrationMutating ? '正在保存…' : '确认并保存坐标'}</button></div>
      </div>
    </form>
  </section>`;
}

function renderLocationMigration() {
  if (state.locationMigrationLoading) {
    elements.locationMigrationView.innerHTML = '<div class="location-migration-loading"><span></span><strong>正在只读扫描旧日记地点</strong><small>不会修改 Markdown 文件</small></div>';
    return;
  }
  const status = state.locationMigration;
  if (!status) {
    elements.locationMigrationView.innerHTML = `<div class="location-migration-fatal"><strong>无法读取旧地点</strong><p>${escapeHtml(state.locationMigrationError || '迁移状态不存在')}</p><button type="button" data-migration-refresh>重试</button></div>`;
    return;
  }
  const active = activeLocationMigrationGroup();
  const databaseError = status.database?.error
    ? `<div class="location-migration-database-error"><strong>地点数据库暂时不可用</strong><span>${escapeHtml(status.database.error)}</span></div>`
    : '';
  elements.locationMigrationView.innerHTML = `${locationMigrationSummaryHtml(status)}
    <div class="location-migration-toolbar">
      <span>按旧地点文字分组，所有选择都需要人工确认。</span>
      <div>
        <button type="button" data-migration-refresh>重新扫描</button>
        <button type="button" data-migration-reset-skips${status.summary.skippedEntryCount ? '' : ' disabled'}>恢复已跳过</button>
        <button type="button" data-migration-undo${status.latestMigration ? '' : ' disabled'}>撤销最近迁移</button>
      </div>
    </div>
    ${databaseError}
    <div class="location-migration-workspace">
      <nav class="location-migration-groups" aria-label="待补全地点组">${locationMigrationGroupsHtml(status, active)}</nav>
      ${locationMigrationResolverHtml(status, active)}
    </div>`;
}

async function loadLocationMigration({ preserveGroup = false } = {}) {
  state.locationMigrationLoading = true;
  state.locationMigrationError = '';
  renderLocationMigration();
  try {
    const status = await dataSource.getLocationMigrationStatus();
    state.locationMigration = status;
    const group = preserveGroup
      ? status.groups.find((item) => item.sourceKey === state.locationMigrationSourceKey) || status.groups[0]
      : status.groups[0];
    resetLocationMigrationResolver(group);
  } catch (error) {
    state.locationMigration = null;
    state.locationMigrationError = error.message;
  } finally {
    state.locationMigrationLoading = false;
    renderLocationMigration();
  }
}

function openLocationMigration() {
  if (!desktop) {
    showSnackbar('旧地点迁移仅在桌面应用中可用');
    return;
  }
  if (!elements.locationMigrationDialog.open) elements.locationMigrationDialog.showModal();
  void loadLocationMigration();
}

async function searchLocationMigrationCandidates() {
  if ([...state.locationMigrationQuery.trim()].length < 2) {
    state.locationMigrationError = '请至少输入两个字进行搜索';
    renderLocationMigration();
    return;
  }
  const requestId = ++state.locationMigrationSearchRequest;
  const sourceKey = state.locationMigrationSourceKey;
  const query = state.locationMigrationQuery;
  const city = state.locationMigrationCity;
  state.locationMigrationSearching = true;
  state.locationMigrationCandidates = [];
  state.locationMigrationSelectedIndex = -1;
  state.locationMigrationError = '';
  renderLocationMigration();
  try {
    const candidates = await dataSource.searchLocations({
      query,
      city,
      cityLimit: Boolean(city)
    });
    if (requestId !== state.locationMigrationSearchRequest || sourceKey !== state.locationMigrationSourceKey) return;
    state.locationMigrationCandidates = candidates;
    if (!candidates.length) state.locationMigrationError = '没有找到带坐标的候选，请调整搜索词或城市编码';
  } catch (error) {
    if (requestId !== state.locationMigrationSearchRequest || sourceKey !== state.locationMigrationSourceKey) return;
    state.locationMigrationError = error.message;
  } finally {
    if (requestId !== state.locationMigrationSearchRequest || sourceKey !== state.locationMigrationSourceKey) return;
    state.locationMigrationSearching = false;
    renderLocationMigration();
  }
}

async function applySelectedLocationMigration() {
  const group = activeLocationMigrationGroup();
  const candidate = state.locationMigrationCandidates[state.locationMigrationSelectedIndex];
  if (!group || !candidate || state.locationMigrationMutating) return;
  state.locationMigrationMutating = true;
  state.locationMigrationError = '';
  renderLocationMigration();
  try {
    const result = await dataSource.applyLocationMigration({
      sourceKey: group.sourceKey,
      candidate,
      scope: locationMigrationScope()
    });
    state.locationMigration = result.status;
    resetLocationMigrationResolver(result.status.groups[0]);
    showSnackbar(`已为 ${result.run.createdCount} 篇旧日记保存坐标`);
  } catch (error) {
    state.locationMigrationError = error.message;
  } finally {
    state.locationMigrationMutating = false;
    renderLocationMigration();
  }
}

async function skipActiveLocationMigration() {
  const group = activeLocationMigrationGroup();
  if (!group || state.locationMigrationMutating) return;
  state.locationMigrationMutating = true;
  renderLocationMigration();
  try {
    const status = await dataSource.skipLocationMigration({
      sourceKey: group.sourceKey,
      scope: locationMigrationScope()
    });
    state.locationMigration = status;
    resetLocationMigrationResolver(status.groups[0]);
    showSnackbar('已跳过所选旧地点记录');
  } catch (error) {
    state.locationMigrationError = error.message;
  } finally {
    state.locationMigrationMutating = false;
    renderLocationMigration();
  }
}

async function resetLocationMigrationSkips() {
  if (state.locationMigrationMutating) return;
  state.locationMigrationMutating = true;
  renderLocationMigration();
  try {
    const status = await dataSource.resetLocationMigrationSkips();
    state.locationMigration = status;
    resetLocationMigrationResolver(status.groups[0]);
    showSnackbar('已恢复所有跳过的旧地点');
  } catch (error) {
    state.locationMigrationError = error.message;
  } finally {
    state.locationMigrationMutating = false;
    renderLocationMigration();
  }
}

async function undoLatestLocationMigration() {
  if (state.locationMigrationMutating) return;
  state.locationMigrationMutating = true;
  renderLocationMigration();
  try {
    const result = await dataSource.undoLocationMigration();
    state.locationMigration = result.status;
    resetLocationMigrationResolver(result.status.groups[0]);
    showSnackbar(`已撤销最近迁移，移除 ${result.undone.removedCount} 条坐标`);
  } catch (error) {
    state.locationMigrationError = error.message;
  } finally {
    state.locationMigrationMutating = false;
    renderLocationMigration();
  }
}

async function openComposeEditor(date) {
  try {
    await flushSave();
  } catch {
    return;
  }
  const entry = await loadEntryContent(date, { priority: true });
  if (!entry) return;
  state.query = '';
  elements.searchInput.value = '';
  state.editingDate = null;
  state.composeDate = date;
  state.draft = {
    date,
    fields: { ...entry.fields },
    body: entry.body,
    savedLocation: entry.savedLocation || null
  };
  state.dirty = false;
  elements.composeDateText.textContent = dateFormatters.full.format(dateFromKey(date));
  elements.composeWeatherInput.value = state.draft.fields.天气;
  elements.composeLocationInput.value = state.draft.fields.地点;
  closeLocationSuggestions();
  updateComposeLocationMapButton();
  elements.composeEditor.value = state.draft.body;
  elements.importImageButton.disabled = !desktop;
  setSaveStatus('saved', '已保存');
  if (!elements.composeDialog.open) elements.composeDialog.showModal();
  requestAnimationFrame(() => elements.composeEditor.focus());
}

function handleComposeInput(event) {
  if (!state.draft || state.draft.date !== state.composeDate) return;
  if (event.target === elements.composeWeatherInput) state.draft.fields.天气 = event.target.value;
  if (event.target === elements.composeLocationInput) {
    state.draft.fields.地点 = event.target.value;
    if (!savedLocationMatchesText(state.draft.savedLocation, event.target.value)) {
      state.draft.savedLocation = null;
      updateComposeLocationMapButton();
    }
    scheduleLocationSearch();
  }
  if (event.target === elements.composeEditor) state.draft.body = event.target.value;
  markDirty();
}

function updateComposeBody() {
  if (!state.draft || state.draft.date !== state.composeDate) return;
  state.draft.body = elements.composeEditor.value;
  markDirty();
}

function replaceComposeSelection(before, after, placeholder) {
  const editor = elements.composeEditor;
  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  const selected = editor.value.slice(start, end);
  const content = selected || placeholder;
  editor.setRangeText(`${before}${content}${after}`, start, end, 'end');
  editor.focus();
  editor.setSelectionRange(start + before.length, start + before.length + content.length);
  updateComposeBody();
}

function prefixComposeLines(prefixForIndex) {
  const editor = elements.composeEditor;
  const edit = prefixMarkdownLines(
    editor.value,
    editor.selectionStart,
    editor.selectionEnd,
    prefixForIndex
  );
  editor.setRangeText(edit.text, edit.start, edit.end, 'end');
  editor.focus();
  editor.setSelectionRange(edit.selectionStart, edit.selectionEnd);
  updateComposeBody();
}

function handleComposeEditorKeydown(event) {
  if (
    event.key !== 'Enter' ||
    event.shiftKey ||
    event.isComposing ||
    elements.composeEditor.selectionStart !== elements.composeEditor.selectionEnd
  ) return;
  const editor = elements.composeEditor;
  const edit = markdownContinuationEdit(editor.value, editor.selectionStart);
  if (!edit) return;
  event.preventDefault();
  editor.setRangeText(edit.text, edit.start, edit.end, 'end');
  editor.setSelectionRange(edit.cursor, edit.cursor);
  updateComposeBody();
}

function applyMarkdownTool(action) {
  if (!state.composeDate) return;
  const wrappers = {
    bold: ['**', '**', '粗体文字'],
    italic: ['*', '*', '斜体文字'],
    strike: ['~~', '~~', '删除线文字'],
    code: ['`', '`', '代码'],
    link: ['[', '](https://)', '链接文字'],
    'code-block': ['```\n', '\n```', '代码'],
    math: ['$', '$', '公式'],
    image: ['![', '](./images/)', '图片说明']
  };
  if (wrappers[action]) {
    replaceComposeSelection(...wrappers[action]);
    return;
  }
  if (action === 'heading') prefixComposeLines(() => '## ');
  if (action === 'bullet') prefixComposeLines(() => '- ');
  if (action === 'numbered') prefixComposeLines((index) => `${index + 1}. `);
  if (action === 'quote') prefixComposeLines(() => '> ');
}

async function importImageIntoCompose() {
  if (!state.composeDate || state.importingImage || !desktop) return;
  const editor = elements.composeEditor;
  const date = state.composeDate;
  const selectionStart = editor.selectionStart;
  const selectionEnd = editor.selectionEnd;
  const selectedText = editor.value.slice(selectionStart, selectionEnd).trim();
  state.importingImage = true;
  elements.importImageButton.disabled = true;
  setSaveStatus('saving', '选择图片');
  try {
    const result = await dataSource.importImage(date);
    if (result.canceled) {
      setSaveStatus(state.dirty ? 'saving' : 'saved', state.dirty ? '等待保存' : '已保存');
      return;
    }
    const alt = (selectedText || result.alt || '图片')
      .replace(/[\[\]\r\n]+/g, ' ')
      .trim() || '图片';
    const markdown = `![${alt}](<${result.path}>)`;
    editor.setRangeText(markdown, selectionStart, selectionEnd, 'end');
    editor.focus();
    const cursor = selectionStart + markdown.length;
    editor.setSelectionRange(cursor, cursor);
    updateComposeBody();
    showSnackbar('图片已复制并插入日记');
  } catch (error) {
    setSaveStatus(state.dirty ? 'saving' : 'saved', state.dirty ? '等待保存' : '已保存');
    showSnackbar(`图片导入失败：${error.message}`);
  } finally {
    state.importingImage = false;
    elements.importImageButton.disabled = !desktop;
  }
}

async function finishComposeEditing() {
  if (!state.composeDate || state.finishingCompose) return;
  state.finishingCompose = true;
  const controls = [...elements.composeForm.elements];
  controls.forEach((control) => { control.disabled = true; });
  try {
    await flushSave();
    closeLocationSuggestions();
    state.composeDate = null;
    state.draft = null;
    elements.composeDialog.close();
    renderActiveView({ preserveScroll: true });
  } catch {
    showSnackbar('日记尚未保存，请重试');
  } finally {
    state.finishingCompose = false;
    controls.forEach((control) => { control.disabled = false; });
  }
}

async function startEditing(date) {
  if (state.editingDate === date) return;
  try {
    await flushSave();
  } catch {
    return;
  }
  const entry = await loadEntryContent(date, { priority: true });
  if (!entry) return;
  state.query = '';
  elements.searchInput.value = '';
  state.composeDate = null;
  state.editingDate = date;
  state.draft = {
    date,
    fields: { ...entry.fields },
    body: entry.body,
    savedLocation: entry.savedLocation || null
  };
  state.dirty = false;
  renderTimeline({ preserveScroll: true });
  const element = elements.timelineView.querySelector(`.timeline-entry[data-date="${date}"]`);
  element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  element?.querySelector('.bubble-editor')?.focus();
}

function markDirty() {
  if (!state.draft) return;
  state.dirty = true;
  setSaveStatus('saving', '等待保存');
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(() => void flushSave(), SAVE_DELAY);
}

async function flushSave() {
  clearTimeout(state.saveTimer);
  state.saveTimer = null;
  if (!state.dirty || !state.draft) return state.saveChain;
  const date = state.draft.date;
  const content = serializeDraft(state.draft);
  const savedLocation = state.draft.savedLocation ? { ...state.draft.savedLocation } : null;
  state.dirty = false;
  setSaveStatus('saving', '保存中');

  state.saveChain = state.saveChain
    .catch(() => undefined)
    .then(async () => {
      try {
        const result = await dataSource.writeEntry(date, content, savedLocation);
        const persistedLocation = result && Object.hasOwn(result, 'savedLocation')
          ? result.savedLocation
          : savedLocation;
        const parsed = { ...parseEntry(date, content), savedLocation: persistedLocation };
        const entry = entryForDate(date);
        if (entry) Object.assign(entry, parsed);
        if (!state.dirty) setSaveStatus('saved', '已保存');
      } catch (error) {
        state.dirty = true;
        setSaveStatus('error', '保存失败');
        showSnackbar(error.message);
        throw error;
      }
    });
  return state.saveChain;
}

async function finishEditing() {
  try {
    await flushSave();
    state.editingDate = null;
    state.draft = null;
    renderTimeline({ preserveScroll: true });
  } catch {
    showSnackbar('日记尚未保存，请重试');
  }
}

async function createEntry(date) {
  const existing = entryForDate(date);
  if (existing) {
    showSnackbar('这一天已有日记');
    if (state.activeView !== 'diary') await setActiveView('diary');
    await startEditing(date);
    return;
  }
  try {
    await flushSave();
    state.query = '';
    elements.searchInput.value = '';
    const template = createTemplate();
    await dataSource.writeEntry(date, template, null);
    const entry = { ...parseEntry(date, template), savedLocation: null };
    state.entries.push(entry);
    state.entries.sort((a, b) => b.date.localeCompare(a.date));
    rebuildEntryIndex();
    state.wanderRevision += 1;
    state.visibleEntries = entriesForActiveView();
    renderActiveView({ targetMonth: date.slice(0, 7) });
    await openComposeEditor(date);
    showSnackbar('新日记已创建');
  } catch (error) {
    if (state.activeView === 'calendar') renderCalendar();
    showSnackbar(error.message);
  }
}

function requestDeleteEntry(date) {
  const entry = entryForDate(date);
  if (!entry) return;
  state.pendingDeleteDate = date;
  elements.deleteDateText.textContent = dateFormatters.full.format(dateFromKey(date));
  elements.deleteDialog.showModal();
}

async function confirmDeleteEntry() {
  const date = state.pendingDeleteDate;
  if (!date || state.deleting) return;
  state.deleting = true;
  const submitButton = elements.deleteForm.querySelector('[type="submit"]');
  submitButton.disabled = true;
  try {
    await flushSave();
    await dataSource.deleteEntry(date);
    state.trashEntries = [];
    state.entries = state.entries.filter((entry) => entry.date !== date);
    rebuildEntryIndex();
    state.wanderRevision += 1;
    state.visibleEntries = entriesForActiveView();
    state.query = '';
    elements.searchInput.value = '';
    if (state.editingDate === date) {
      state.editingDate = null;
      state.draft = null;
      state.dirty = false;
    }
    for (const key of imageCache.keys()) {
      if (key.startsWith(`${date}\u0000`)) imageCache.delete(key);
    }
    state.pendingDeleteDate = null;
    elements.deleteDialog.close();
    renderActiveView({ preserveScroll: true });
    showSnackbar('日记已移入日记库的 .Trash');
  } catch (error) {
    showSnackbar(`删除失败：${error.message}`);
  } finally {
    state.deleting = false;
    submitButton.disabled = false;
  }
}

function openDateDialog() {
  elements.dateInput.value = todayKey();
  elements.dateDialog.showModal();
}

let searchTimer;
function scheduleSearch() {
  clearTimeout(searchTimer);
  const query = elements.searchInput.value.trim();
  const requestId = ++state.searchRequest;
  state.query = query;
  if (!query) {
    state.visibleEntries = entriesForActiveView();
    renderTimeline();
    return;
  }
  if (state.activeView === 'gallery') {
    searchTimer = setTimeout(() => {
      if (requestId !== state.searchRequest) return;
      const needle = query.toLocaleLowerCase('zh-CN');
      state.visibleEntries = entriesForActiveView().filter((entry) => (
        entry.date.includes(needle) || entry.images.some((image) => (
          `${image.alt}\n${image.source}`.toLocaleLowerCase('zh-CN').includes(needle)
        ))
      ));
      renderSearchResults();
    }, 100);
    return;
  }
  searchTimer = setTimeout(async () => {
    try {
      if (state.entries.every((entry) => entry.content !== undefined)) {
        const needle = query.toLocaleLowerCase('zh-CN');
        state.visibleEntries = state.entries.filter((entry) => (
          `${entry.date}\n${entry.content}`.toLocaleLowerCase('zh-CN').includes(needle)
        ));
      } else {
        const results = await dataSource.searchEntries(query);
        if (requestId !== state.searchRequest) return;
        const dates = new Set(results.map((item) => typeof item === 'string' ? item : item.date));
        state.visibleEntries = state.entries.filter((entry) => dates.has(entry.date));
      }
      if (requestId !== state.searchRequest) return;
      renderSearchResults();
    } catch (error) {
      showSnackbar(`搜索失败：${error.message}`);
    }
  }, 180);
}

function renderSearchResults() {
  renderTimeline();
}

function handleTimelineInput(event) {
  if (!state.draft) return;
  if (event.target.matches('[data-role="editor"]')) state.draft.body = event.target.value;
  const field = event.target.dataset.field;
  if (field && Object.hasOwn(state.draft.fields, field)) {
    state.draft.fields[field] = event.target.value;
    if (field === '地点' && !savedLocationMatchesText(state.draft.savedLocation, event.target.value)) {
      state.draft.savedLocation = null;
    }
  }
  markDirty();
}

function resetSearchForJump() {
  if (!state.query) return false;
  clearTimeout(searchTimer);
  state.searchRequest += 1;
  state.query = '';
  elements.searchInput.value = '';
  state.visibleEntries = entriesForActiveView();
  return true;
}

function jumpToTimelineMonth(month) {
  const searchWasReset = resetSearchForJump();
  if (searchWasReset) {
    renderTimeline({ targetMonth: month });
    return;
  }
  const index = state.timelineGroups.findIndex((group) => group.key === month);
  if (index < 0) return;
  captureRenderedMonthHeights();
  refreshMonthOffsets();
  renderVirtualWindow(index, {
    scrollTop: state.monthOffsets[index],
    jumpMonth: month,
    force: true
  });
}

let timelineFocusObserver;
let timelineFocusFrame = 0;
let timelineFocusTimer;

function clearTimelineEntryFocus() {
  timelineFocusObserver?.disconnect();
  timelineFocusObserver = null;
  clearTimeout(timelineFocusTimer);
  timelineFocusTimer = null;
  if (timelineFocusFrame) cancelAnimationFrame(timelineFocusFrame);
  timelineFocusFrame = 0;
  state.timelineFocusDate = null;
}

function centerFocusedTimelineEntry() {
  timelineFocusFrame = 0;
  if (!state.timelineFocusDate || state.activeView !== 'diary') return;
  const entry = elements.timelineView.querySelector(`.timeline-entry[data-date="${state.timelineFocusDate}"]`);
  if (!entry) return;
  const viewport = elements.timelineView.getBoundingClientRect();
  const card = entry.getBoundingClientRect();
  const delta = card.top + card.height / 2 - (viewport.top + viewport.height / 2);
  if (Math.abs(delta) < 0.5) return;
  state.suppressVirtualScroll = true;
  elements.timelineView.scrollTop += delta;
  requestAnimationFrame(() => { state.suppressVirtualScroll = false; });
}

function scheduleTimelineEntryCenter() {
  if (timelineFocusFrame) return;
  timelineFocusFrame = requestAnimationFrame(centerFocusedTimelineEntry);
}

function focusTimelineEntry(date) {
  clearTimelineEntryFocus();
  state.timelineFocusDate = date;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (state.timelineFocusDate !== date || state.activeView !== 'diary') return;
    const entry = elements.timelineView.querySelector(`.timeline-entry[data-date="${date}"]`);
    const inner = elements.timelineView.querySelector('.timeline-inner');
    if (!entry || !inner) {
      clearTimelineEntryFocus();
      showSnackbar('已打开时间轴，但未能定位这篇日记');
      return;
    }
    entry.classList.add('calendar-jump-target');
    setTimeout(() => entry.classList.remove('calendar-jump-target'), 1400);
    timelineFocusObserver = new ResizeObserver(scheduleTimelineEntryCenter);
    timelineFocusObserver.observe(inner);
    timelineFocusObserver.observe(entry);
    scheduleTimelineEntryCenter();
    timelineFocusTimer = setTimeout(clearTimelineEntryFocus, 3000);
  }));
}

async function openTimelineDate(date) {
  const loaded = await loadEntryContent(date, { priority: true });
  if (!loaded) return;
  const switched = await setActiveView('diary', { targetMonth: date.slice(0, 7) });
  if (!switched || state.activeView !== 'diary') return;
  focusTimelineEntry(date);
}

let wanderPointer = null;

function bindEvents() {
  elements.welcomeChooseButton.addEventListener('click', () => void chooseDirectory());
  elements.settingsChooseFolderButton.addEventListener('click', () => void chooseDirectory());
  elements.settingsOpenFolderButton.addEventListener('click', async () => {
    try {
      await dataSource.openDirectory();
    } catch (error) {
      showSnackbar(error.message);
    }
  });
  elements.settingsButton.addEventListener('click', openSettings);
  elements.sidebarSettingsButton.addEventListener('click', () => {
    closeSidebar();
    openSettings();
  });
  elements.closeSettingsButton.addEventListener('click', () => elements.settingsDialog.close());
  elements.closeLocationMapButton.addEventListener('click', closeLocationMap);
  elements.locationMapDialog.addEventListener('close', () => {
    state.locationMapRequest += 1;
    state.locationMapLoading = false;
    state.locationMapUrl = '';
    void dataSource.cancelLocationMap().catch(() => undefined);
  });
  elements.locationMapView.addEventListener('click', (event) => {
    const page = event.target.closest('[data-location-map-page]')?.dataset.locationMapPage;
    if (page !== undefined) {
      changeLocationMapPage(Number(page));
      return;
    }
    const point = event.target.closest('[data-location-map-point]')?.dataset.locationMapPoint;
    if (point !== undefined) {
      openLocationMapPoint(Number(point));
      return;
    }
    if (event.target.closest('[data-location-map-retry]')) {
      void loadLocationMapPage();
      return;
    }
    if (event.target.closest('[data-location-map-settings]')) {
      closeLocationMap();
      openSettings();
    }
  });
  elements.closeLocationMigrationButton.addEventListener('click', () => elements.locationMigrationDialog.close());
  elements.locationMigrationDialog.addEventListener('close', () => {
    if (state.activeView === 'analysis') void loadAnalysisView();
  });
  elements.locationMigrationView.addEventListener('submit', (event) => {
    if (event.target.matches('[data-migration-search]')) {
      event.preventDefault();
      void searchLocationMigrationCandidates();
      return;
    }
    if (event.target.matches('[data-migration-apply]')) {
      event.preventDefault();
      void applySelectedLocationMigration();
    }
  });
  elements.locationMigrationView.addEventListener('input', (event) => {
    if (event.target.name === 'query') state.locationMigrationQuery = event.target.value;
    if (event.target.name === 'city') {
      state.locationMigrationCity = event.target.value.replace(/\D/g, '').slice(0, 6);
      event.target.value = state.locationMigrationCity;
    }
    if (event.target.name === 'startDate') state.locationMigrationStartDate = event.target.value;
    if (event.target.name === 'endDate') state.locationMigrationEndDate = event.target.value;
  });
  elements.locationMigrationView.addEventListener('change', (event) => {
    if (event.target.name === 'scope') {
      state.locationMigrationScope = event.target.value;
      renderLocationMigration();
    }
    if (event.target.name === 'singleDate') state.locationMigrationDate = event.target.value;
  });
  elements.locationMigrationView.addEventListener('click', (event) => {
    const groupKey = event.target.closest('[data-migration-group]')?.dataset.migrationGroup;
    if (groupKey) {
      const group = state.locationMigration?.groups.find((item) => item.sourceKey === groupKey);
      resetLocationMigrationResolver(group);
      renderLocationMigration();
      return;
    }
    const candidateIndex = event.target.closest('[data-migration-candidate]')?.dataset.migrationCandidate;
    if (candidateIndex !== undefined) {
      state.locationMigrationSelectedIndex = Number(candidateIndex);
      state.locationMigrationError = '';
      renderLocationMigration();
      return;
    }
    const previewIndex = event.target.closest('[data-migration-preview]')?.dataset.migrationPreview;
    if (previewIndex !== undefined) {
      const candidate = state.locationMigrationCandidates[Number(previewIndex)];
      if (candidate) void dataSource.previewLocation(candidate).catch((error) => showSnackbar(error.message));
      return;
    }
    if (event.target.closest('[data-migration-skip]')) {
      void skipActiveLocationMigration();
      return;
    }
    if (event.target.closest('[data-migration-refresh]')) {
      void loadLocationMigration({ preserveGroup: true });
      return;
    }
    if (event.target.closest('[data-migration-reset-skips]')) {
      void resetLocationMigrationSkips();
      return;
    }
    if (event.target.closest('[data-migration-undo]')) {
      void undoLatestLocationMigration();
      return;
    }
    if (event.target.closest('[data-migration-settings]')) {
      elements.locationMigrationDialog.close();
      openSettings();
    }
  });
  elements.passwordStoreSelect.addEventListener('change', () => {
    void setPasswordStore(elements.passwordStoreSelect.value);
  });
  elements.saveAmapKeyButton.addEventListener('click', () => void saveAmapKey());
  elements.clearAmapKeyButton.addEventListener('click', () => void clearAmapKey());
  elements.amapKeyInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    void saveAmapKey();
  });
  elements.navigatorButton.addEventListener('click', () => void setNavigatorVisibility(!state.showNavigator));
  elements.closeNavigatorButton.addEventListener('click', () => void setNavigatorVisibility(false));
  elements.navigatorToggle.addEventListener('change', () => void setNavigatorVisibility(elements.navigatorToggle.checked));
  elements.zoomInput.addEventListener('input', () => scheduleZoom(elements.zoomInput.value));
  elements.zoomOutButton.addEventListener('click', () => scheduleZoom(state.zoom - 5));
  elements.zoomInButton.addEventListener('click', () => scheduleZoom(state.zoom + 5));
  elements.backgroundTransparencyInput.addEventListener('input', () => {
    scheduleBackgroundTransparency(elements.backgroundTransparencyInput.value);
  });
  elements.backgroundTransparencyDownButton.addEventListener('click', () => {
    scheduleBackgroundTransparency(state.backgroundTransparency - BACKGROUND_TRANSPARENCY_STEP);
  });
  elements.backgroundTransparencyUpButton.addEventListener('click', () => {
    scheduleBackgroundTransparency(state.backgroundTransparency + BACKGROUND_TRANSPARENCY_STEP);
  });
  elements.darkModeToggle.addEventListener('change', () => void setDarkMode(elements.darkModeToggle.checked));
  elements.newButton.addEventListener('click', openDateDialog);
  elements.cancelDateButton.addEventListener('click', () => elements.dateDialog.close());
  elements.dateForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const date = elements.dateInput.value;
    if (!date) return;
    elements.dateDialog.close();
    void createEntry(date);
  });
  elements.composeForm.addEventListener('input', handleComposeInput);
  elements.composeLocationInput.addEventListener('keydown', handleLocationSearchKeydown);
  elements.composeLocationInput.addEventListener('blur', () => {
    setTimeout(() => {
      if (!elements.composeLocationSuggestions.matches(':focus-within')) closeLocationSuggestions();
    }, 120);
  });
  elements.composeLocationSuggestions.addEventListener('click', (event) => {
    const option = event.target.closest('[data-location-index]');
    if (option) selectLocationCandidate(Number(option.dataset.locationIndex));
  });
  elements.composeLocationMapButton.addEventListener('click', () => {
    if (state.composeDate) void openSavedLocation(state.composeDate);
  });
  elements.composeEditor.addEventListener('keydown', handleComposeEditorKeydown);
  elements.composeToolbar.addEventListener('click', (event) => {
    const button = event.target.closest('[data-markdown]');
    if (button) applyMarkdownTool(button.dataset.markdown);
  });
  elements.importImageButton.addEventListener('click', () => void importImageIntoCompose());
  elements.composeForm.addEventListener('submit', (event) => {
    event.preventDefault();
    void finishComposeEditing();
  });
  elements.closeComposeButton.addEventListener('click', () => void finishComposeEditing());
  elements.composeDialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    void finishComposeEditing();
  });
  elements.searchInput.addEventListener('input', scheduleSearch);
  elements.galleryButton.addEventListener('click', () => {
    void setActiveView(state.activeView === 'gallery' ? 'diary' : 'gallery');
  });
  elements.calendarButton.addEventListener('click', () => {
    void setActiveView(state.activeView === 'calendar' ? 'diary' : 'calendar');
  });
  elements.wanderButton.addEventListener('click', () => {
    void setActiveView(state.activeView === 'wander' ? 'diary' : 'wander');
  });
  elements.analysisButton.addEventListener('click', () => {
    void setActiveView(state.activeView === 'analysis' ? 'diary' : 'analysis');
  });
  elements.trashButton.addEventListener('click', () => {
    void setActiveView(state.activeView === 'trash' ? 'diary' : 'trash');
  });
  elements.trashView.addEventListener('click', (event) => {
    const restore = event.target.closest('[data-trash-restore]');
    if (restore) {
      void restoreTrashFromView(restore.dataset.trashRestore);
      return;
    }
    const remove = event.target.closest('[data-trash-delete]');
    if (remove) {
      requestDeleteTrashFromView(remove.dataset.trashDelete);
      return;
    }
    if (event.target.closest('[data-trash-empty]')) {
      requestEmptyTrash();
      return;
    }
    if (event.target.closest('[data-trash-refresh]')) void loadTrashView({ showLoading: false });
  });
  elements.analysisView.addEventListener('submit', (event) => {
    const form = event.target.closest('[data-analysis-filter]');
    if (!form) return;
    event.preventDefault();
    const startDate = form.elements.startDate.value;
    const endDate = form.elements.endDate.value;
    if (startDate && endDate && startDate > endDate) {
      showSnackbar('开始日期不能晚于结束日期');
      return;
    }
    state.analysisStartDate = startDate;
    state.analysisEndDate = endDate;
    void loadAnalysisView();
  });
  elements.analysisView.addEventListener('click', (event) => {
    if (event.target.closest('[data-analysis-refresh]')) {
      void loadAnalysisView({ force: true });
      return;
    }
    if (event.target.closest('[data-analysis-retry]')) {
      void loadAnalysisView();
      return;
    }
    if (event.target.closest('[data-analysis-reset]')) {
      state.analysisStartDate = '';
      state.analysisEndDate = '';
      void loadAnalysisView();
      return;
    }
    if (event.target.closest('[data-location-migration-open]')) {
      openLocationMigration();
      return;
    }
    if (event.target.closest('[data-location-map-open]')) {
      openLocationMap();
      return;
    }
    const month = event.target.closest('[data-analysis-month]')?.dataset.analysisMonth;
    if (month) {
      state.analysisStartDate = `${month}-01`;
      state.analysisEndDate = analysisMonthEnd(month);
      void loadAnalysisView();
      return;
    }
    const location = event.target.closest('[data-analysis-location]')?.dataset.analysisLocation;
    if (location) {
      void setActiveView('diary').then((changed) => {
        if (!changed) return;
        elements.searchInput.value = location;
        scheduleSearch();
        elements.searchInput.focus();
      });
      return;
    }
    const term = event.target.closest('[data-analysis-term]')?.dataset.analysisTerm;
    if (term) {
      void setActiveView('diary').then((changed) => {
        if (!changed) return;
        elements.searchInput.value = term;
        scheduleSearch();
        elements.searchInput.focus();
      });
    }
  });
  elements.calendarView.addEventListener('click', (event) => {
    const navigation = event.target.closest('[data-calendar-nav]');
    if (navigation) {
      state.calendarYear += Number(navigation.dataset.calendarNav);
      renderCalendar({ resetScroll: true });
      return;
    }
    const day = event.target.closest('[data-calendar-date]');
    if (!day) return;
    const date = day.dataset.calendarDate;
    if (entryForDate(date)) {
      void openTimelineDate(date);
      return;
    }
    day.disabled = true;
    void createEntry(date);
  });
  elements.wanderView.addEventListener('click', (event) => {
    const shuffle = event.target.closest('[data-wander-shuffle]');
    if (shuffle) {
      shuffleWanderDeck();
      return;
    }
    const move = event.target.closest('[data-wander-move]');
    if (move) {
      moveWanderDeck(move.dataset.wanderName, Number(move.dataset.wanderMove));
      return;
    }
    const open = event.target.closest('[data-wander-open]');
    if (open) void openTimelineDate(open.dataset.wanderOpen);
  });
  elements.wanderView.addEventListener('keydown', (event) => {
    const deck = event.target.closest('[data-wander-deck]');
    if (!deck || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    moveWanderDeck(deck.dataset.wanderDeck, event.key === 'ArrowRight' ? 1 : -1);
  });
  elements.wanderView.addEventListener('pointerdown', (event) => {
    const deck = event.target.closest('[data-wander-deck]');
    if (!deck || event.button !== 0 || event.target.closest('button, a, input, textarea, select')) return;
    wanderPointer = { id: event.pointerId, name: deck.dataset.wanderDeck, x: event.clientX };
    deck.setPointerCapture?.(event.pointerId);
  });
  elements.wanderView.addEventListener('pointerup', (event) => {
    if (!wanderPointer || wanderPointer.id !== event.pointerId) return;
    const movement = event.clientX - wanderPointer.x;
    const name = wanderPointer.name;
    wanderPointer = null;
    if (Math.abs(movement) >= 48) moveWanderDeck(name, movement < 0 ? 1 : -1);
  });
  elements.wanderView.addEventListener('pointercancel', () => { wanderPointer = null; });
  elements.wanderView.addEventListener('wheel', (event) => {
    const deck = event.target.closest('[data-wander-deck]');
    if (!deck || Math.abs(event.deltaX) < 28 || Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
    event.preventDefault();
    moveWanderDeck(deck.dataset.wanderDeck, event.deltaX > 0 ? 1 : -1);
  }, { passive: false });
  elements.yearJumpButton.addEventListener('click', () => elements.yearDialog.showModal());
  elements.closeYearButton.addEventListener('click', () => elements.yearDialog.close());
  elements.yearDialogList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-jump-year]');
    if (!button) return;
    const year = button.dataset.jumpYear;
    if (state.activeView === 'calendar') {
      state.calendarYear = Number(year);
      renderCalendar({ resetScroll: true });
    } else if (state.activeView === 'wander') {
      void setActiveView('diary').then(() => {
        const targetMonth = state.entries.find((entry) => entry.date.startsWith(`${year}-`))?.date.slice(0, 7);
        if (targetMonth) jumpToTimelineMonth(targetMonth);
      });
    } else {
      const targetMonth = entriesForActiveView().find((entry) => entry.date.startsWith(`${year}-`))?.date.slice(0, 7);
      if (targetMonth) jumpToTimelineMonth(targetMonth);
    }
    elements.yearDialog.close();
    closeSidebar();
  });
  elements.quickNavList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-jump]');
    if (!button) return;
    const month = button.dataset.jump;
    jumpToTimelineMonth(month);
    elements.quickNavList.querySelectorAll('.quick-month').forEach((item) => item.classList.toggle('active', item.dataset.jump === month));
  });
  elements.timelineView.addEventListener('scroll', handleVirtualTimelineScroll, { passive: true });
  elements.timelineView.addEventListener('wheel', clearTimelineEntryFocus, { passive: true });
  elements.timelineView.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    if (button.dataset.action === 'edit') void startEditing(button.dataset.date);
    if (button.dataset.action === 'done') void finishEditing();
    if (button.dataset.action === 'image') void openImagePreview(button.dataset.date, Number(button.dataset.imageIndex));
    if (button.dataset.action === 'delete') requestDeleteEntry(button.dataset.date);
  });
  elements.cancelDeleteButton.addEventListener('click', () => {
    state.pendingDeleteDate = null;
    elements.deleteDialog.close();
  });
  elements.deleteForm.addEventListener('submit', (event) => {
    event.preventDefault();
    void confirmDeleteEntry();
  });
  elements.deleteDialog.addEventListener('close', () => {
    if (!elements.deleteDialog.open) state.pendingDeleteDate = null;
  });
  elements.cancelTrashDeleteButton.addEventListener('click', () => elements.trashDeleteDialog.close());
  elements.trashDeleteForm.addEventListener('submit', (event) => {
    event.preventDefault();
    void confirmTrashDelete();
  });
  elements.trashDeleteDialog.addEventListener('cancel', (event) => {
    if (trashIsBusy()) event.preventDefault();
  });
  elements.trashDeleteDialog.addEventListener('close', () => {
    if (!trashIsBusy()) state.pendingTrashDelete = null;
  });
  elements.previousImageButton.addEventListener('click', () => switchPreviewImage(-1));
  elements.nextImageButton.addEventListener('click', () => switchPreviewImage(1));
  elements.resetImageZoomButton.addEventListener('click', resetImageZoom);
  elements.closeImageButton.addEventListener('click', () => elements.imageDialog.close());
  elements.imageStage.addEventListener('wheel', (event) => {
    if (!state.previewDate) return;
    event.preventDefault();
    const delta = event.deltaY * (event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : 1);
    setImageZoom(state.previewZoom * Math.exp(-delta * 0.0015), event);
  }, { passive: false });
  elements.imageCanvas.addEventListener('pointerdown', (event) => {
    const stage = elements.imageStage;
    if (event.pointerType !== 'mouse' || event.button !== 0 || !stage.classList.contains('can-pan')) return;
    event.preventDefault();
    imageDrag = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      scale: stage.getBoundingClientRect().width / stage.offsetWidth
    };
    stage.setPointerCapture(event.pointerId);
    stage.classList.add('is-panning');
  });
  elements.imageStage.addEventListener('pointermove', (event) => {
    if (!imageDrag || event.pointerId !== imageDrag.id) return;
    if (!(event.buttons & 1)) {
      endImageDrag();
      return;
    }
    elements.imageStage.scrollLeft -= (event.clientX - imageDrag.x) / imageDrag.scale;
    elements.imageStage.scrollTop -= (event.clientY - imageDrag.y) / imageDrag.scale;
    imageDrag.x = event.clientX;
    imageDrag.y = event.clientY;
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    elements.imageStage.addEventListener(type, (event) => {
      if (event.pointerId === imageDrag?.id) endImageDrag();
    });
  }
  window.addEventListener('blur', endImageDrag);
  elements.imageDialog.addEventListener('close', () => {
    endImageDrag();
    elements.imageStage.classList.remove('can-pan');
    state.previewRequest += 1;
    state.previewDate = null;
    state.previewIndex = 0;
    state.previewZoom = 1;
    elements.imagePreview.onload = null;
    elements.imagePreview.onerror = null;
    elements.imagePreview.removeAttribute('src');
    elements.imagePreview.removeAttribute('style');
    elements.imageCanvas.removeAttribute('style');
    elements.imageCounter.textContent = '1 / 1';
    elements.imageZoomText.textContent = '100%';
  });
  elements.timelineView.addEventListener('input', handleTimelineInput);
  elements.menuButton.addEventListener('click', openSidebar);
  elements.closeSidebarButton.addEventListener('click', closeSidebar);
  elements.scrim.addEventListener('click', closeSidebar);

  document.addEventListener('click', (event) => {
    const location = event.target.closest('[data-location-date]');
    if (location) void openSavedLocation(location.dataset.locationDate);
  });

  document.addEventListener('keydown', (event) => {
    if (elements.imageDialog.open && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      event.preventDefault();
      switchPreviewImage(event.key === 'ArrowLeft' ? -1 : 1);
      return;
    }
    const command = event.ctrlKey || event.metaKey;
    if (state.timelineFocusDate && ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) {
      clearTimelineEntryFocus();
    }
    if (command && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      openSidebar();
      elements.searchInput.focus();
    }
    if (command && event.key.toLowerCase() === 's') {
      event.preventDefault();
      void flushSave();
    }
    if (event.key === 'Escape') closeSidebar();
  });

  window.addEventListener('beforeunload', (event) => {
    if (!state.dirty) return;
    event.preventDefault();
    event.returnValue = '';
  });
  window.addEventListener('resize', () => {
    if (elements.imageDialog.open) layoutImagePreview();
    if (state.timelineFocusDate) {
      scheduleTimelineEntryCenter();
      return;
    }
    if (state.activeView === 'calendar' || state.activeView === 'wander' || state.activeView === 'analysis' || state.activeView === 'trash') return;
    clearTimeout(timelineResizeTimer);
    timelineResizeTimer = setTimeout(() => {
      if (state.activeView === 'calendar' || state.activeView === 'wander' || state.activeView === 'analysis' || state.activeView === 'trash') return;
      if (!state.timelineGroups.length) return;
      state.measuredMonthHeights.clear();
      renderTimeline({ preserveScroll: true });
    }, 120);
  });
}

async function initialize() {
  document.documentElement.dataset.platform = desktop?.platform || 'web';
  const applePlatform = desktop
    ? desktop.platform === 'darwin'
    : /^(?:Mac|iPhone|iPad|iPod)/.test(navigator.platform);
  elements.searchShortcut.textContent = applePlatform ? '⌘K' : 'Ctrl K';
  bindEvents();
  desktop?.onAnalysisProgress?.(updateAnalysisProgress);
  setSaveStatus('', '就绪');
  try {
    const config = await dataSource.getConfig();
    state.zoom = Number(config.zoom) || 110;
    state.backgroundTransparency = Number(config.backgroundTransparency) || 0;
    state.darkMode = config.darkMode === true;
    state.showNavigator = config.showNavigator === true;
    applyAmapConfig(config);
    state.directoryPath = config.directoryPath || '';
    updateZoomDisplay(state.zoom);
    updateBackgroundTransparencyDisplay(state.backgroundTransparency);
    applyDarkMode();
    applyNavigatorVisibility();
    const status = await dataSource.getStatus();
    if (status.selected) {
      state.directoryPath = status.path;
      await loadDirectory();
    } else {
      showWelcomeState();
    }
  } catch (error) {
    showWelcomeState();
    showSnackbar(error.message);
  }
}

void initialize();
