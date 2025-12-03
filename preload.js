const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Trigger the update check
  checkForUpdates: () => ipcRenderer.send('check-for-updates'),
  
  // Listen for status messages from the main process
  onUpdateStatus: (callback) => {
    ipcRenderer.removeAllListeners('update-status');
    // Pass the entire status object (which now contains 'percent')
    ipcRenderer.on('update-status', (event, statusObj) => callback(statusObj));
  },

  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  
  // Existing feature: Print PDF (if you have this logic)
  printComponentPDF: (data) => ipcRenderer.send('print-component-pdf', data)
});