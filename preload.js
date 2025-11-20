console.log('✅✅✅ PRELOAD SCRIPT IS RUNNING! ✅✅✅');

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Trigger the update check
  checkForUpdates: () => ipcRenderer.send('check-for-updates'),
  
  // Listen for status messages from the main process
  onUpdateStatus: (callback) => {
    // Remove old listeners to prevent duplicates
    ipcRenderer.removeAllListeners('update-status');
    ipcRenderer.on('update-status', (event, status) => callback(status));
  },
  
  // Existing feature: Print PDF (if you have this logic)
  printComponentPDF: (data) => ipcRenderer.send('print-component-pdf', data)
});