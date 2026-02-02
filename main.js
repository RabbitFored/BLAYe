// main.js - The entry point for your Electron app
const { app, BrowserWindow, ipcMain, autoUpdater, dialog, net, session} = require('electron');
const path = require('path');
const fs = require('fs'); // NEW: Import Node.js File System module
const os = require('os'); // NEW: Import Node.js Operating System module

// 1. HANDLE SQUIRREL STARTUP (CRITICAL FOR WINDOWS SHORTCUTS)
// If this is missing, the installer won't create Desktop icons.
if (require('electron-squirrel-startup')) {
  app.quit();
}

// --- GST PORTAL INTEGRATION (Bypassing CORS) ---

// Helper function to wrap Electron's net.request in a Promise
function makeRequest(url, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const request = net.request({ url, ...options });
    
    // Mimic a real browser to avoid being blocked
    request.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    request.setHeader('Referer', 'https://services.gst.gov.in/services/searchtp');
    
    if (body) {
      request.setHeader('Content-Type', 'application/json');
      request.write(JSON.stringify(body));
    }

    request.on('response', (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const data = Buffer.concat(chunks);
        resolve({
          statusCode: response.statusCode,
          headers: response.headers,
          data: data
        });
      });
    });

    request.on('error', (error) => reject(error));
    request.end();
  });
}

ipcMain.handle('gst-get-captcha', async () => {
  try {
    // 1. Clear previous session cookies to ensure a fresh start
    await session.defaultSession.clearStorageData({ storages: ['cookies'] });

    // 2. Hit the main search page first to initialize session cookies (Just like Python's session.get)
    await makeRequest('https://services.gst.gov.in/services/searchtp');

    // 3. Get the Captcha Image
    const response = await makeRequest('https://services.gst.gov.in/services/captcha?v=' + Date.now());
    
    // 4. Convert Buffer to Base64
    const base64Image = response.data.toString('base64');
    
    return { 
      success: true, 
      image: `data:image/png;base64,${base64Image}` 
    };

  } catch (error) {
    console.error('GST Captcha Error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('gst-get-details', async (event, { gstin, captcha }) => {
  try {
    // 1. Prepare the payload
    const payload = {
      gstin: gstin,
      captcha: captcha
    };

    // 2. Send POST request (Cookies are automatically handled by Electron's defaultSession)
    const response = await makeRequest(
      'https://services.gst.gov.in/services/api/search/taxpayerDetails', 
      { method: 'POST' }, 
      payload
    );

    // 3. Parse JSON response
    const jsonResponse = JSON.parse(response.data.toString());
    
    return jsonResponse;

  } catch (error) {
    console.error('GST Details Error:', error);
    return { error: error.message };
  }
});

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
  const server = 'https://update.electronjs.org';
  const feed = `${server}/RabbitFored/BLAYe/${process.platform}/${app.getVersion()}`;
  autoUpdater.setFeedURL({ url: feed });

  // Update Events
  // Update Events
  autoUpdater.on('checking-for-update', () => sendStatusToWindow({ state: 'checking', message: 'Checking for updates...' }));
  autoUpdater.on('update-available', () => sendStatusToWindow({ state: 'available', message: 'Update available. Downloading...' }));
  autoUpdater.on('update-not-available', () => sendStatusToWindow({ state: 'not-available', message: 'You are on the latest version.' }));


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

// Helper function
function sendStatusToWindow(statusObj) {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    win.webContents.send('update-status', statusObj);
  }
}