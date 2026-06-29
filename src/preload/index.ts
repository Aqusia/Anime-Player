import { contextBridge, ipcRenderer } from 'electron'

const api = {
  list: (force?: boolean) => ipcRenderer.invoke('anime:list', force),
  episodes: (catId: string) => ipcRenderer.invoke('anime:episodes', catId),
  metaAll: () => ipcRenderer.invoke('meta:all'),
  metaGet: (catId: string) => ipcRenderer.invoke('meta:get', catId),
  metaStatus: () => ipcRenderer.invoke('meta:status'),
  metaEpisodes: (bgmId: number) => ipcRenderer.invoke('meta:episodes', bgmId),
  onMetaProgress: (cb: (s: unknown) => void) => {
    const handler = (_e: unknown, s: unknown) => cb(s)
    ipcRenderer.on('meta:progress', handler)
    return () => ipcRenderer.removeListener('meta:progress', handler)
  },
  streamUrl: (payload: { catId: string; postId: string; apireq: string }) =>
    ipcRenderer.invoke('stream:url', payload),
  downloadStart: (payload: { catId: string; title: string; cover?: string; episodes: unknown[] }) =>
    ipcRenderer.invoke('download:start', payload),
  downloadDelete: (catId: string) => ipcRenderer.invoke('download:delete', catId),
  downloadAll: () => ipcRenderer.invoke('download:all'),
  onDownloadProgress: (cb: (s: unknown) => void) => {
    const handler = (_e: unknown, s: unknown) => cb(s)
    ipcRenderer.on('download:progress', handler)
    return () => ipcRenderer.removeListener('download:progress', handler)
  },
  myselfCatalog: () => ipcRenderer.invoke('my:catalog'),
  onMyselfEnriched: (cb: () => void) => {
    const handler = (): void => cb()
    ipcRenderer.on('my:enriched', handler)
    return () => ipcRenderer.removeListener('my:enriched', handler)
  },
  myselfSearch: (query: string) => ipcRenderer.invoke('my:search', query),
  myselfDetails: (id: string) => ipcRenderer.invoke('my:details', id),
  myselfEpisodes: (id: string, title: string) => ipcRenderer.invoke('my:episodes', id, title),
  myselfStreamUrl: (tid: string, vid: string) => ipcRenderer.invoke('my:streamUrl', tid, vid),
  setProgress: (p: unknown) => ipcRenderer.invoke('progress:set', p),
  progressList: () => ipcRenderer.invoke('progress:list'),
  progressOne: (catId: string, postId: string) =>
    ipcRenderer.invoke('progress:getOne', catId, postId),
  progressRemoveAnime: (catId: string) => ipcRenderer.invoke('progress:removeAnime', catId),
  progressClear: () => ipcRenderer.invoke('progress:clear'),
  myList: () => ipcRenderer.invoke('mylist:get'),
  toggleMyList: (catId: string) => ipcRenderer.invoke('mylist:toggle', catId),
  watchedGet: () => ipcRenderer.invoke('watched:get'),
  watchedToggle: (catId: string) => ipcRenderer.invoke('watched:toggle', catId),
  watchedMark: (catId: string) => ipcRenderer.invoke('watched:mark', catId)
}

contextBridge.exposeInMainWorld('api', api)
