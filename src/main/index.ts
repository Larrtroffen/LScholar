import { app, BrowserWindow, dialog, Menu, MenuItem } from 'electron';
import path from 'path';
import { initSqlite } from './db';
import { setupIpc } from './ipc';
import { eventBus } from './events';
import { configService } from './services/ConfigService';

// 异常捕获修复版
process.on('uncaughtException', (error: Error) => {
  console.error('❌ Main process uncaughtException:', error);
  if (app.isPackaged) {
    dialog.showErrorBox('Main Process Error', error.stack || error.message);
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Main process unhandledRejection at:', promise, 'reason:', reason);
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
  
  // 自动打开开发者工具以便调试
  mainWindow.webContents.openDevTools();

  // 添加右键菜单
  mainWindow.webContents.on('context-menu', (event, params) => {
    const menu = new Menu();

    // 添加复制选项（如果有选中文本）
    if (params.selectionText) {
      menu.append(new MenuItem({
        label: '复制',
        role: 'copy',
        accelerator: 'CmdOrCtrl+C'
      }));
    }

    // 添加剪切选项（如果有选中文本且在可编辑区域）
    if (params.isEditable && params.selectionText) {
      menu.append(new MenuItem({
        label: '剪切',
        role: 'cut',
        accelerator: 'CmdOrCtrl+X'
      }));
    }

    // 添加粘贴选项（如果在可编辑区域）
    if (params.isEditable) {
      menu.append(new MenuItem({
        label: '粘贴',
        role: 'paste',
        accelerator: 'CmdOrCtrl+V'
      }));
    }

    // 添加全选选项
    menu.append(new MenuItem({
      label: '全选',
      role: 'selectAll',
      accelerator: 'CmdOrCtrl+A'
    }));

    // 如果菜单有内容，则显示
    if (menu.items.length > 0) {
      menu.popup({ window: mainWindow, x: params.x, y: params.y });
    }
  });

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
  console.log('🚀 App is ready, initializing...');
  try {
    console.log('1. Initializing SQLite...');
    initSqlite();

    console.log('1.5. Initializing Services...');
    configService.initialize();
    
    console.log('2. Registering IPC handlers...');
    setupIpc();
    
    console.log('3. Creating Main Window...');
    createWindow();
    
    console.log('✅ Initialization complete');
    eventBus.emit('app:ready');
  } catch (error: any) {
    console.error('❌ Initialization failed:', error);
    dialog.showErrorBox('Init Error', error.message || 'Failed to initialize app');
  }

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  eventBus.emit('app:quit');
  if (process.platform !== 'darwin') app.quit();
});
