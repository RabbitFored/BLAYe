
const { contextBridge, ipcRenderer } = require('electron');


// This creates a secure bridge to expose the 'print-pdf' function 
// to your app.js file under the name "window.electronAPI".
contextBridge.exposeInMainWorld('electronAPI', {
  printComponentPDF: (pdfData) => ipcRenderer.send('print-pdf', pdfData)
});