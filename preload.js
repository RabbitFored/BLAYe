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

  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  
  // Existing feature: Print PDF (if you have this logic)
  printComponentPDF: (data) => ipcRenderer.send('print-component-pdf', data),
  // NEW: GST Functions
  getGstCaptcha: () => ipcRenderer.invoke('gst-get-captcha'),
  getGstDetails: (data) => ipcRenderer.invoke('gst-get-details', data)

});