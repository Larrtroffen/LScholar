import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import { initSqlite } from './db';
import { registerIpcHandlers } from './ipc';
import { startScheduler } from './rss';

// 异常捕获修复版
(process as any).on('uncaughtException', (error: Error) => {
  console.error('Main process exception:', error);
  if (app.isPackaged) {
    dialog.showErrorBox('Main Process Error', error.stack || error.message);
  }
});

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1300,
    height: 850,
    minWidth: 1000,
    minHeight: 700,
    backgroundColor: '#1A1B26',
    title: 'LarRsScholar',
    webPreferences: {
      // 确保 preload 路径正确
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.setMenu(null);

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    // 关键路径修改：dist/main -> dist/index.html
    const htmlPath = path.join(__dirname, '../index.html');
    mainWindow.loadFile(htmlPath).catch((err) => {
      dialog.showErrorBox('Load Error', `Failed to load HTML: ${err.message}`);
    });
  }
}

app.disableHardwareAcceleration();

app.whenReady().then(() => {
  try {
    initSqlite();
    registerIpcHandlers();
    startScheduler();
    createWindow();
  } catch (error: any) {
    dialog.showErrorBox('Init Error', error.message || 'Failed to initialize app');
  }

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});