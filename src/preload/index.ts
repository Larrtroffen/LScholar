import { contextBridge, ipcRenderer, shell } from 'electron';

contextBridge.exposeInMainWorld('electron', {
  shell: {
    openExternal: (url: string) => shell.openExternal(url)
  },
  ipcRenderer: {
    send: (channel: string, data: any) => ipcRenderer.send(channel, data),
    invoke: (channel: string, data: any) => ipcRenderer.invoke(channel, data),
    on: (channel: string, func: (...args: any[]) => void) => {
      const subscription = (_event: any, ...args: any[]) => func(...args);
      ipcRenderer.on(channel, subscription);
      return () => ipcRenderer.removeListener(channel, subscription);
    },
  },
});
