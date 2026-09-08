const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('diaryAPI', {
  platform: process.platform,
  chooseDirectory: () => ipcRenderer.invoke('diary:choose-directory'),
  getStatus: () => ipcRenderer.invoke('diary:get-status'),
  getConfig: () => ipcRenderer.invoke('diary:get-config'),
  updateConfig: (patch) => ipcRenderer.invoke('diary:update-config', patch),
  listEntries: () => ipcRenderer.invoke('diary:list'),
  listImages: () => ipcRenderer.invoke('diary:list-images'),
  listTrash: () => ipcRenderer.invoke('diary:list-trash'),
  emptyTrash: () => ipcRenderer.invoke('diary:empty-trash'),
  deleteTrash: (id) => ipcRenderer.invoke('diary:delete-trash', id),
  getAnalysisInsights: (options) => ipcRenderer.invoke('diary:analysis-insights', options),
  reindexAnalysis: (options) => ipcRenderer.invoke('diary:analysis-reindex', options),
  onAnalysisProgress: (callback) => {
    if (typeof callback !== 'function') return () => undefined;
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on('diary:analysis-progress', listener);
    return () => ipcRenderer.removeListener('diary:analysis-progress', listener);
  },
  importImage: (date) => ipcRenderer.invoke('diary:import-image', date),
  readEntry: (date) => ipcRenderer.invoke('diary:read', date),
  readImage: (date, source) => ipcRenderer.invoke('diary:read-image', date, source),
  writeEntry: (date, content, savedLocation) => ipcRenderer.invoke('diary:write', date, content, savedLocation),
  deleteEntry: (date) => ipcRenderer.invoke('diary:delete', date),
  restoreTrash: (id) => ipcRenderer.invoke('diary:restore-trash', id),
  searchEntries: (query) => ipcRenderer.invoke('diary:search', query),
  searchLocations: (query) => ipcRenderer.invoke('diary:location-search', query),
  openEntryLocation: (date) => ipcRenderer.invoke('diary:location-open', date),
  previewLocation: (location) => ipcRenderer.invoke('diary:location-preview', location),
  createLocationMap: (points) => ipcRenderer.invoke('diary:location-map-create', points),
  cancelLocationMap: () => ipcRenderer.invoke('diary:location-map-cancel'),
  getLocationMigrationStatus: () => ipcRenderer.invoke('diary:location-migration-status'),
  applyLocationMigration: (value) => ipcRenderer.invoke('diary:location-migration-apply', value),
  skipLocationMigration: (value) => ipcRenderer.invoke('diary:location-migration-skip', value),
  resetLocationMigrationSkips: () => ipcRenderer.invoke('diary:location-migration-reset-skips'),
  undoLocationMigration: () => ipcRenderer.invoke('diary:location-migration-undo'),
  openDirectory: () => ipcRenderer.invoke('diary:open-directory')
});
