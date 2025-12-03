// main.js - The entry point for your Electron app
const { app, BrowserWindow, ipcMain, autoUpdater, dialog} = require('electron');
const path = require('path');
const fs = require('fs'); // NEW: Import Node.js File System module
const os = require('os'); // NEW: Import Node.js Operating System module

const { autoUpdater } = require('electron-updater');

const log = require('electron-log'); // You might need: npm install electron-log
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';
// 1. HANDLE SQUIRREL STARTUP (CRITICAL FOR WINDOWS SHORTCUTS)
// If this is missing, the installer won't create Desktop icons.
if (require('electron-squirrel-startup')) {
  app.quit();
}

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      // Use path.resolve for safety
      preload: path.resolve(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false, // Helps with some Linux permission issues
    },
  });

  // Remove the default menu bar
  mainWindow.setMenu(null);

  // Maximize the window for a full-screen feel
  mainWindow.maximize();

  // Load the index.html of your app.
  mainWindow.loadFile('index.html');

  // Debugging: Open the DevTools for debugging.
  // mainWindow.webContents.openDevTools();
};


// --- APP LIFECYCLE ---

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
  if (process.platform !== 'darwin') app.quit();
});


// --- FEATURES ---

// 1. Get App Version
ipcMain.handle('get-app-version', () => {
  return app.getVersion()
})

// 2. Printing Logic 
ipcMain.on('print-component-pdf', (event, pdfData) => {
  // 1. Create a temporary file
  const fileName = `Invoice-${Date.now()}.pdf`;
  const pdfPath = path.join(os.tmpdir(), fileName);

  try {
    fs.writeFileSync(pdfPath, Buffer.from(pdfData));

    // 2. Create a hidden window
    // FIX: Set dimensions to match A4 size (approx 595x842 points)
    // This reduces the "Gray Box" effect by making the window fit the paper.
    const printWindow = new BrowserWindow({ 
      show: false,
      width: 595, 
      height: 842,
      webPreferences: {
          nodeIntegration: false,
          contextIsolation: true
      } 
    });

    // 3. Load the PDF
    printWindow.loadURL(`file://${pdfPath}`);

    // 4. Wait for load + small delay for rendering
    printWindow.webContents.on('did-finish-load', () => {
      setTimeout(() => {
          printWindow.webContents.print({
              silent: false, // Show the native print dialog
              printBackground: true,
              deviceName: '',
              
              // FIX: Removed "scaleFactor" and "margins: custom".
              // We let the printer driver handle the defaults first.
              // Often, forcing these settings causes the "Tiny Thumbnail" issue.
              pageSize: 'A4' 
              
          }, (success, errorType) => {
              if (!success && errorType !== 'cancelled') {
                  console.log("Print failed:", errorType);
              }
              // Cleanup
              printWindow.close();
              try { fs.unlinkSync(pdfPath); } catch (e) {}
          });
      }, 500); // 500ms delay to ensure PDF viewer is fully ready
    });

  } catch (error) {
    console.error("PDF Handling Error:", error);
  }
});
// 3. Auto-Updater Logic
// 3.1. Add IPC Listener for manual check
ipcMain.on('check-for-updates', () => {
  if (!app.isPackaged) {
    // updates don't work in dev mode
    const win = BrowserWindow.getAllWindows()[0];
    win.webContents.send('update-status', { state: 'error', message: 'Cannot check for updates in dev mode' });
    return;
  }
  autoUpdater.checkForUpdates();
});




// 3.2. Configure AutoUpdater Events to send status back to UI
// Only run this logic if app is packaged
if (app.isPackaged) {
  // 1. Remove the old setFeedURL (electron-updater handles this automatically via package.json)
  // autoUpdater.setFeedURL({ url: feed }); <-- DELETE THIS LINE

  // 2. Configure Basic Events
  autoUpdater.on('checking-for-update', () => sendStatusToWindow({ state: 'checking', message: 'Checking for updates...' }));
  autoUpdater.on('update-available', () => sendStatusToWindow({ state: 'available', message: 'Update available. Downloading...' }));
  autoUpdater.on('update-not-available', () => sendStatusToWindow({ state: 'not-available', message: 'You are on the latest version.' }));

  autoUpdater.on('error', (err) => {
    sendStatusToWindow({ state: 'error', message: `Error: ${err.message || err.toString()}` });
  });

  // 3. NEW: Handle Download Progress
  autoUpdater.on('download-progress', (progressObj) => {
    const percent = Math.round(progressObj.percent);
    const speed = (progressObj.bytesPerSecond / 1024).toFixed(0); // KB/s

    sendStatusToWindow({ 
        state: 'progress', 
        message: `Downloading: ${percent}% (${speed} KB/s)`,
        percent: percent // Send the raw number for a progress bar
    });
  });

  // 4. Handle Completion
  autoUpdater.on('update-downloaded', () => {
    sendStatusToWindow({ state: 'downloaded', message: 'Update downloaded. Restarting...' });
    // Optional: Wait for user confirmation or restart immediately
    // autoUpdater.quitAndInstall(); 
  });
}

// Helper function
function sendStatusToWindow(statusObj) {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    win.webContents.send('update-status', statusObj);
  }
}