import { installModelService, downloadFixedFiles } from './model-download.js';
import { CUTOUT_FILE, CUTOUT_PERMISSION, CUTOUT_KEY, cutoutReady, saveCutout, deleteCutout } from './cutout-model-store.js';
export async function downloadCutout({ signal, fetcher = fetch, progress = () => {}, save = saveCutout }) {
  const record = await downloadFixedFiles({ files: [CUTOUT_FILE], signal, progress, fetcher: (url, options) => fetcher(url, { ...options, redirect: 'follow' }) });
  signal.throwIfAborted();
  await save(record.mask, signal);
}
export function installCutoutService(api = chrome) {
  return installModelService(api, { download: downloadCutout, ready: cutoutReady, remove: deleteCutout,
    statusType: 'CUTOUT_MODEL_STATUS', deleteType: 'CUTOUT_MODEL_DELETE', portName: 'pagekit-cutout-download', permissions: CUTOUT_PERMISSION,
    onInstalled: () => api.storage.local.set({ [CUTOUT_KEY]: Date.now() }), onRemoved: () => api.storage.local.set({ [CUTOUT_KEY]: null }) });
}
