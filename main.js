const { app, BrowserWindow, ipcMain, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');

// Better detection: check if Next.js dev server is likely running
// In dev mode (electron-dev script), NODE_ENV might not be set, but we can check if 'out' folder exists
const outPath = path.join(__dirname, 'out/index.html')
const hasProductionBuild = fs.existsSync(outPath)

// Force dev mode when running electron-dev (localhost:3000 should be available)
// Only use production build if 'out' folder exists and NODE_ENV explicitly set to production
const isDev = process.env.NODE_ENV !== 'production' || !hasProductionBuild

let mainWindow;
let whatsappClient;
let whatsappStatus = 'DISCONNECTED'; // DISCONNECTED, CONNECTING, QR_READY, AUTHENTICATED, READY

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        show: false, // Don't show until ready
        backgroundColor: '#f8fafc', // Match app background (slate-50)
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: false, // Allow cross-origin fetch for Drive/Sheets sync
            preload: path.join(__dirname, 'preload.js')
        },
        title: 'Sri Vari Enterprises - Billing ERP',
        icon: process.platform === 'win32'
            ? path.join(__dirname, 'public/icon.ico')
            : path.join(__dirname, 'public/icon.png')
    })

    // Remove default menu
    mainWindow.setMenuBarVisibility(false)

    // Show window when ready to prevent white flash
    mainWindow.once('ready-to-show', () => {
        mainWindow.show()
    })

    // CSP Fix for Google Drive & Sheets API
    const { session } = require('electron')
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        callback({
            responseHeaders: {
                ...details.responseHeaders,
                'Content-Security-Policy': [
                    "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: http://localhost:3000 https://*; " +
                    "connect-src 'self' http://localhost:3000 ws://localhost:3000 https://*; " +
                    "img-src 'self' data: blob: https://*;"
                ]
            }
        })
    })

    if (isDev) {
        // Development: Load from Next.js dev server
        console.log('Loading from development server: http://localhost:3000')
        mainWindow.loadURL('http://localhost:3000')
        // DevTools disabled for clean UI
        // mainWindow.webContents.openDevTools()
    } else {
        // Production: Load from static export
        console.log('Loading from production build:', outPath)
        mainWindow.loadFile(outPath)
    }

    // Handle load errors
    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
        console.error(`Failed to load: ${errorDescription} (${errorCode})`)
        if (isDev) {
            // Retry loading after a short delay (dev server might still be starting)
            setTimeout(() => {
                console.log('Retrying connection to dev server...')
                mainWindow.loadURL('http://localhost:3000')
            }, 2000)
        }
    })

    // Initialize WhatsApp
    initWhatsApp();
}

function initWhatsApp() {
    if (whatsappClient && (whatsappStatus === 'CONNECTING' || whatsappStatus === 'QR_READY' || whatsappStatus === 'AUTHENTICATED' || whatsappStatus === 'READY')) {
        console.log('WhatsApp Client already initialized or connecting. Status:', whatsappStatus);
        return;
    }

    console.log('Initializing WhatsApp Client...');
    whatsappStatus = 'CONNECTING';

    whatsappClient = new Client({
        authStrategy: new LocalAuth({
            dataPath: path.join(app.getPath('userData'), 'whatsapp-session')
        }),
        puppeteer: {
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        }
    });

    whatsappClient.on('qr', async (qr) => {
        console.log('WhatsApp QR Received');
        whatsappStatus = 'QR_READY';
        try {
            const qrDataUrl = await qrcode.toDataURL(qr);
            if (mainWindow) {
                mainWindow.webContents.send('whatsapp:qr', qrDataUrl);
                mainWindow.webContents.send('whatsapp:status', whatsappStatus);
            }
        } catch (err) {
            console.error('Failed to generate QR Data URL', err);
        }
    });

    whatsappClient.on('authenticated', () => {
        console.log('WhatsApp Authenticated');
        whatsappStatus = 'AUTHENTICATED';
        if (mainWindow) mainWindow.webContents.send('whatsapp:authenticated');
        if (mainWindow) mainWindow.webContents.send('whatsapp:status', whatsappStatus);
    });

    whatsappClient.on('auth_failure', (msg) => {
        console.error('WhatsApp Auth Failure', msg);
        whatsappStatus = 'DISCONNECTED';
        if (mainWindow) mainWindow.webContents.send('whatsapp:auth_failure', msg);
        if (mainWindow) mainWindow.webContents.send('whatsapp:status', whatsappStatus);
    });

    whatsappClient.on('ready', () => {
        console.log('WhatsApp Client Ready');
        whatsappStatus = 'READY';
        if (mainWindow) mainWindow.webContents.send('whatsapp:ready');
        if (mainWindow) mainWindow.webContents.send('whatsapp:status', whatsappStatus);
    });

    whatsappClient.on('change_state', (state) => {
        console.log('WhatsApp State Changed:', state);
    });

    whatsappClient.on('disconnected', (reason) => {
        console.log('WhatsApp Disconnected:', reason);
        whatsappStatus = 'DISCONNECTED';
        if (mainWindow) mainWindow.webContents.send('whatsapp:status', whatsappStatus);
    });

    whatsappClient.initialize().catch(err => {
        console.error('WhatsApp Initialization Error:', err);
    });
}

// IPC Handlers
ipcMain.handle('whatsapp:send-pdf', async (event, { phoneNumber, pdfBase64, filename, caption }) => {
    if (whatsappStatus !== 'READY') {
        throw new Error('WhatsApp is not ready. Status: ' + whatsappStatus);
    }

    try {
        // Sanitize phone number (remove non-digits, ensure country code)
        let sanitizedNumber = phoneNumber.replace(/\D/g, '');
        if (sanitizedNumber.length === 10) {
            sanitizedNumber = '91' + sanitizedNumber; // Default to India if 10 digits
        }

        const chatId = `${sanitizedNumber}@c.us`;
        const media = new MessageMedia('application/pdf', pdfBase64, filename || 'document.pdf');

        await whatsappClient.sendMessage(chatId, media, { caption: caption || '' });
        return { success: true };
    } catch (err) {
        console.error('Failed to send WhatsApp message:', err);
        // Specifically catch detached frame or similar errors
        if (err.message && (err.message.includes('detached Frame') || err.message.includes('Execution context was destroyed'))) {
            console.error('CRITICAL: WhatsApp browser context lost. Re-initialization recommended.');
            whatsappStatus = 'DISCONNECTED';
            if (mainWindow) mainWindow.webContents.send('whatsapp:status', whatsappStatus);
        }
        throw err;
    }
});

ipcMain.handle('whatsapp:reconnect', async () => {
    console.log('Manual WhatsApp Reconnect Triggered');
    if (whatsappClient) {
        try {
            await whatsappClient.destroy();
        } catch (e) {
            console.error('Error destroying old client:', e);
        }
        whatsappClient = null;
    }
    whatsappStatus = 'DISCONNECTED';
    initWhatsApp();
    return { status: whatsappStatus };
});

ipcMain.handle('whatsapp:get-status', () => {
    return whatsappStatus;
});

ipcMain.handle('whatsapp:logout', async () => {
    if (whatsappClient) {
        await whatsappClient.logout();
        whatsappStatus = 'DISCONNECTED';
        if (mainWindow) mainWindow.webContents.send('whatsapp:status', whatsappStatus);
    }
});

// ─── Printer IPC Handlers ────────────────────────────────────────────────────

// List all installed printers (Windows 7-12 compatible via Chromium)
ipcMain.handle('printer:get-printers', async () => {
    try {
        if (!mainWindow) return [];
        const printers = await mainWindow.webContents.getPrintersAsync();
        return printers.map(p => ({
            name: p.name,
            displayName: p.displayName || p.name,
            isDefault: p.isDefault,
            status: p.status,
            description: p.description || ''
        }));
    } catch (err) {
        console.error('Failed to list printers:', err);
        return [];
    }
});

// Print the current invoice page to a selected printer (silent, no dialog)
ipcMain.handle('printer:print', async (event, { printerName, silent }) => {
    try {
        if (!mainWindow) throw new Error('No main window');
        return await new Promise((resolve, reject) => {
            mainWindow.webContents.print(
                {
                    silent: silent !== false,     // silent by default
                    printBackground: true,         // print CSS backgrounds
                    deviceName: printerName || '', // '' = system default printer
                    pageSize: 'A4',
                    margins: { marginType: 'custom', top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 },
                    scaleFactor: 100
                },
                (success, failureReason) => {
                    if (success) resolve({ success: true });
                    else reject(new Error(failureReason || 'Print failed'));
                }
            );
        });
    } catch (err) {
        console.error('Print failed:', err);
        throw err;
    }
});

// ─────────────────────────────────────────────────────────────────────────────

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
