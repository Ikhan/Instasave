import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { DownloadProgress, InstaApi } from '../shared/types'

const api: InstaApi = {
  fetchPost: (url) => ipcRenderer.invoke('post:fetch', url),
  downloadItems: (post, itemIds) => ipcRenderer.invoke('post:download', post.shortcode, [...itemIds]),
  onProgress: (listener) => {
    const handler = (_e: IpcRendererEvent, p: DownloadProgress): void => listener(p)
    ipcRenderer.on('download:progress', handler)
    return () => ipcRenderer.removeListener('download:progress', handler)
  },
  getPreview: (url) => ipcRenderer.invoke('preview:get', url),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (patch) => ipcRenderer.invoke('settings:update', patch),
  chooseDownloadDir: () => ipcRenderer.invoke('settings:chooseDir'),
  getHistory: () => ipcRenderer.invoke('history:get'),
  clearHistory: () => ipcRenderer.invoke('history:clear'),
  revealFile: (filePath) => ipcRenderer.invoke('file:reveal', filePath),
  toolStatus: () => ipcRenderer.invoke('tool:status'),
  installTool: () => ipcRenderer.invoke('tool:install')
}

contextBridge.exposeInMainWorld('insta', api)
