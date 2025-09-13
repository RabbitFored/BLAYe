// main.js - The entry point for your Electron app

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs'); // NEW: Import Node.js File System module
const os = require('os'); // NEW: Import Node.js Operating System module

const createWindow = () => {
  // Create the browser window.
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'electron/preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    }
  });

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