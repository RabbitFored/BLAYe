// main.js - The entry point for your Electron app
console.log('✅✅✅ main SCRIPT IS RUNNING! ✅✅✅');
const { app, BrowserWindow, ipcMain, autoUpdater} = require('electron');
const path = require('path');
const fs = require('fs'); // NEW: Import Node.js File System module
const os = require('os'); // NEW: Import Node.js Operating System module


const preloadPath = path.join(__dirname, 'preload.js');


const targetPreloadPath = path.join(__dirname, 'preload.js');

console.log('---------------- DEBUG PATHS ----------------');
console.log('1. Main.js is located at:   ', __dirname);
console.log('2. Trying to load preload at:', targetPreloadPath);
console.log('3. Does file exist there?   ', fs.existsSync(targetPreloadPath) ? 'YES ✅' : 'NO ❌');
console.log('---------------------------------------------');


const createWindow = () => {
  // Create the browser window.
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: preloadPath,
      // sandbox: false,
      nodeIntegration: false,
      contextIsolation: true,
    }
  });

  // --- ADD THIS LINE ---
  //mainWindow.webContents.openDevTools(); 
  // ---------------------
  
  // Remove the default menu bar
  win.setMenu(null);

  // Maximize the window for a full-screen feel
  win.maximize();

  // Load the index.html of your app.
  win.loadFile('index.html');

  // Optional: Open the DevTools for debugging.
  // win.webContents.openDevTools();
};

ipcMain.on('print-pdf', (event, pdfBuffer) => {
  const tempPDFPath = path.join(os.tmpdir(), `invoice-${Date.now()}.pdf`);
  fs.writeFileSync(tempPDFPath, Buffer.from(pdfBuffer));

  const printWindow = new BrowserWindow({ 
    show: false,
    webPreferences: {
      // Use the built-in PDF viewer
      plugins: true
    }
  });
  
  printWindow.loadFile(tempPDFPath);

  printWindow.webContents.once('did-finish-load', () => {
    // NEW: Wait for 500ms before printing to allow the PDF viewer to render
    setTimeout(() => {
      printWindow.webContents.print({}, (success, errorType) => {
        if (!success) console.log(`Print failed: ${errorType}`);
        
        printWindow.close();
        fs.unlinkSync(tempPDFPath);
      });
    }, 500); // 500 milliseconds = 0.5 seconds
  });
});
// --- End Upda
// 1. Add IPC Listener for manual check
ipcMain.on('check-for-updates', () => {
  if (!app.isPackaged) {
    // updates don't work in dev mode
    const win = BrowserWindow.getAllWindows()[0];
    win.webContents.send('update-status', { state: 'error', message: 'Cannot check for updates in dev mode' });
    return;
  }
  autoUpdater.checkForUpdates();
});

// 2. Configure AutoUpdater Events to send status back to UI
// Only run this logic if app is packaged
if (app.isPackaged) {
  const server = 'https://update.electronjs.org';
  const feed = `${server}/RabbitFored/BLAYe/${process.platform}/${app.getVersion()}`;
  autoUpdater.setFeedURL({ url: feed });

  autoUpdater.on('checking-for-update', () => {
    sendStatusToWindow({ state: 'checking', message: 'Checking for updates...' });
  });

  autoUpdater.on('update-available', () => {
    sendStatusToWindow({ state: 'available', message: 'Update available. Downloading...' });
  });

  autoUpdater.on('update-not-available', () => {
    sendStatusToWindow({ state: 'not-available', message: 'You are on the latest version.' });
  });

  autoUpdater.on('error', (err) => {
    sendStatusToWindow({ state: 'error', message: 'Error checking for updates.' });
  });

  autoUpdater.on('update-downloaded', () => {
    sendStatusToWindow({ state: 'downloaded', message: 'Update downloaded. Restarting...' });
    // Optional: Auto restart after a few seconds or prompt via dialog
    setTimeout(() => autoUpdater.quitAndInstall(), 3000);

});
}
// This method will be called when Electron has finished initialization
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed, except on macOS.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Helper function
function sendStatusToWindow(statusObj) {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    win.webContents.send('update-status', statusObj);
  }
}