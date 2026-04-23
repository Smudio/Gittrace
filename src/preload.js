const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('livegit', {
    openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
    openRepo: (p) => ipcRenderer.invoke('git:open', p),
    commitDiff: (p, h) => ipcRenderer.invoke('git:commitDiff', p, h),
    fileDiff: (p, f) => ipcRenderer.invoke('git:fileDiff', p, f),
    fileContent: (p, f) => ipcRenderer.invoke('git:fileContent', p, f),
    fileTree: (p) => ipcRenderer.invoke('git:fileTree', p),
    refreshStatus: (p) => ipcRenderer.invoke('git:refreshStatus', p),
    diffStats: (p, f) => ipcRenderer.invoke('git:diffStats', p, f),
    showInFolder: (p) => ipcRenderer.invoke('shell:showInFolder', p),
    openPath: (p) => ipcRenderer.invoke('shell:openPath', p),
    onLiveChange: (cb) => ipcRenderer.on('live:change', (_, d) => cb(d)),
    contextMenu: (opts) => ipcRenderer.invoke('context:menu', opts),
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized')
});
