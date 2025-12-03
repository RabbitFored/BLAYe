// main.js - The entry point for your Electron app
const { app, BrowserWindow, ipcMain, autoUpdater, dialog, globalShortcut} = require('electron');
const path = require('path');
const fs = require('fs'); // NEW: Import Node.js File System module
const os = require('os'); // NEW: Import Node.js Operating System module


const preloadPath = path.join(__dirname, 'preload.js');


const targetPreloadPath = path.join(__dirname, 'preload.js');


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


ipcMain.handle('get-app-version', () => {
  return app.getVersion()
})



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


  // printed error, carefull !!!
  autoUpdater.on('error', (err) => {
    sendStatusToWindow({ state: 'error', message: `Error: ${err.message || err.toString()}` });
  });

  autoUpdater.on('update-downloaded', () => {
    sendStatusToWindow({ state: 'downloaded', message: 'Update downloaded. Restarting...' });
    // Optional: Auto restart after a few seconds or prompt via dialog
    setTimeout(() => autoUpdater.quitAndInstall(), 3000);

});
}

// Handle Printing
ipcMain.on('print-component-pdf', (event, pdfData) => {
  // 1. Create a temporary path for the PDF
  const pdfPath = path.join(os.tmpdir(), 'print.pdf');

  // 2. Write the PDF data to that file
  // pdfData comes as an ArrayBuffer from the frontend, so we convert it to a Buffer
  fs.writeFileSync(pdfPath, Buffer.from(pdfData));

  // 3. Create a hidden window to render the PDF
  const printWindow = new BrowserWindow({ 
    show: false,
    webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
    } 
  });

  // 4. Load the PDF file
  printWindow.loadURL(`file://${pdfPath}`);

  // 5. Wait for it to load, then print
  printWindow.webContents.on('did-finish-load', () => {
    printWindow.webContents.print({
        silent: false, // Show the printer selection dialog
        printBackground: true,
        deviceName: '', // Let user choose

        // --- CRITICAL FIXES FOR SCALING ---
        // 1. Force margins to 0 (The PDF has its own margins)
        margins: {
        marginType: 'custom', // Use 'custom' instead of 'none' for better driver support
        top: 0,
        bottom: 0,
        left: 0,
        right: 0
    },
        
        // 2. Force A4 size
        pageSize: 'A4',
        
        // 3. Prevent "Fit to Page" shrinking
        scaleFactor: 100


    }, (success, errorType) => {
        if (!success) console.log("Print failed:", errorType);
        
        // Clean up: Close window and attempt to delete file
        printWindow.close();
        try { fs.unlinkSync(pdfPath); } catch (e) {}
    });
  });
});

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