const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
    whatsapp: {
        onQR: (callback) => ipcRenderer.on('whatsapp:qr', (event, qr) => callback(qr)),
        onReady: (callback) => ipcRenderer.on('whatsapp:ready', () => callback()),
        onAuthenticated: (callback) => ipcRenderer.on('whatsapp:authenticated', () => callback()),
        onAuthFailure: (callback) => ipcRenderer.on('whatsapp:auth_failure', (event, msg) => callback(msg)),
        onStatus: (callback) => ipcRenderer.on('whatsapp:status', (event, status) => callback(status)),
        sendPDF: (phoneNumber, pdfBase64, filename, caption) =>
            ipcRenderer.invoke('whatsapp:send-pdf', { phoneNumber, pdfBase64, filename, caption }),
        getStatus: () => ipcRenderer.invoke('whatsapp:get-status'),
        logout: () => ipcRenderer.invoke('whatsapp:logout'),
        reconnect: () => ipcRenderer.invoke('whatsapp:reconnect')
    },
    printer: {
        getPrinters: () => ipcRenderer.invoke('printer:get-printers'),
        print: (printerName) => ipcRenderer.invoke('printer:print', { printerName, silent: true })
    },
    drive: {
        isConnected: () => ipcRenderer.invoke('drive:is-connected'),
        getAccessToken: () => ipcRenderer.invoke('drive:get-access-token'),
        connect: (clientId) => ipcRenderer.invoke('drive:connect', { clientId }),
        saveTokens: (tokens) => ipcRenderer.invoke('drive:save-tokens', tokens)
    }
});


