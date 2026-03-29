const { app, BrowserWindow, ipcMain, shell, protocol, net } = require('electron')
const path = require('path')
const fs = require('fs')
const https = require('https')

// ─── Logging System (Critical for Production Debugging) ──────────────────────
const logDir = path.join(app.getPath('userData'), 'logs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
const logFile = path.join(logDir, 'debug.log');

function logToFile(...args) {
    const timestamp = new Date().toISOString();
    const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ');
    const line = `[${timestamp}] ${message}\n`;
    fs.appendFileSync(logFile, line);
    console.log(message);
}

// Global Exception Handler
process.on('uncaughtException', (err) => {
    const errorMsg = require('util').inspect(err, { showHidden: true, depth: 5, colors: false });
    const stack = err && err.stack ? `\nStack: ${err.stack}` : '';
    logToFile('CRITICAL ERROR (Uncaught Exception):', errorMsg + stack);
});

process.on('unhandledRejection', (reason, promise) => {
    const errorMsg = require('util').inspect(reason, { showHidden: true, depth: 5, colors: false });
    const stack = reason && reason.stack ? `\nStack: ${reason.stack}` : '';
    logToFile('CRITICAL ERROR (Unhandled Rejection):', errorMsg + stack);
});

logToFile('--- Application Starting ---');
logToFile('Platform:', process.platform);
logToFile('Version:', app.getVersion());
logToFile('Is Packaged:', app.isPackaged);
logToFile('UserData Path:', app.getPath('userData'));

// ─── Load .env.local at runtime (required for production exe) ────────────────
function loadEnvFile() {
    try {
        const resourcesPath = process.resourcesPath || path.join(__dirname);
        const envPaths = [
            path.join(resourcesPath, 'app.asar.unpacked', '.env.local'), // packaged (asar unpacked)
            path.join(resourcesPath, '.env.local'),                     // packaged (direct resource)
            path.join(__dirname, '.env.local'),                          // dev mode
        ];

        let found = false;
        for (const envPath of envPaths) {
            if (fs.existsSync(envPath)) {
                logToFile('[env] Trying path:', envPath);
                const content = fs.readFileSync(envPath, 'utf8');
                content.split('\n').filter(line => line.trim() && !line.startsWith('#')).forEach(line => {
                    const parts = line.split('=');
                    if (parts.length >= 2) {
                        const key = parts[0].trim();
                        let value = parts.slice(1).join('=').trim();
                        
                        // Strip surrounding quotes
                        if ((value.startsWith("'") && value.endsWith("'")) || 
                            (value.startsWith('"') && value.endsWith('"'))) {
                            value = value.substring(1, value.length - 1);
                        }
                        
                        if (!process.env[key]) {
                            process.env[key] = value;
                        }
                    }
                });
                logToFile('[env] Success: Loaded environment from', envPath);
                found = true;
                break;
            }
        }
        if (!found) {
            logToFile('[env] WARNING: No .env.local file found in any expected location.');
        }
    } catch (err) {
        logToFile('[env] ERROR: Failed to load environment file:', err.message);
    }
}
loadEnvFile();

// ─── Protocol Registration (MUST BE BEFORE app:ready) ────────────────────────
protocol.registerSchemesAsPrivileged([
    { scheme: 'app', privileges: { secure: true, standard: true, supportFetchAPI: true } }
]);

const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');

const isDev = !app.isPackaged;
const outDir = path.join(__dirname, 'out');

let mainWindow;
let whatsappClient;
let whatsappStatus = 'DISCONNECTED';

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        show: false,
        backgroundColor: '#f8fafc',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: false, // allow cors
            preload: path.join(__dirname, 'preload.js')
        },
        title: 'Sri Vari Enterprises - Billing ERP',
        icon: path.join(__dirname, 'public', process.platform === 'win32' ? 'icon.ico' : 'icon.png')
    })

    logToFile('[Main] Initializing BrowserWindow...');

    mainWindow.setMenuBarVisibility(false)

    mainWindow.once('ready-to-show', () => {
        mainWindow.show()
    })

    // CSP Handler for runtime connections
    const { session: cspSession } = require('electron')
    cspSession.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        let supabaseHost = '*.supabase.co';
        try {
            const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
            if (supabaseUrl && supabaseUrl.startsWith('http')) {
                supabaseHost = new URL(supabaseUrl).host;
            }
        } catch (e) {
            logToFile('[CSP] Error parsing NEXT_PUBLIC_SUPABASE_URL:', e.message);
        }
        
        callback({
            responseHeaders: {
                ...details.responseHeaders,
                'Content-Security-Policy': [
                    `default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: app://* http://localhost:3000 https://*; ` +
                    `connect-src 'self' app://* http://localhost:3000 ws://localhost:3000 https://* https://${supabaseHost} https://*.googleapis.com; ` +
                    `img-src 'self' data: blob: app://* https://*; ` +
                    `frame-src 'self' https://*;`
                ]
            }
        })
    })

    if (isDev) {
        logToFile('[Main] Loading dev URL: http://localhost:3000');
        mainWindow.loadURL('http://localhost:3000')
    } else {
        logToFile('[Main] Loading production URL: app://localhost/');
        mainWindow.loadURL('app://localhost/')
    }

    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
        console.error(`Failed to load: ${errorDescription} (${errorCode})`)
        if (errorCode === -3) return; // user cancelled

        setTimeout(() => {
            if (!mainWindow || mainWindow.isDestroyed()) return;
            if (isDev) {
                mainWindow.loadURL('http://localhost:3000')
            } else {
                mainWindow.loadURL('app://localhost/')
            }
        }, 2000)
    })

    // Enable DevTools shortcut in production (for debugging)
    mainWindow.webContents.on('before-input-event', (event, input) => {
        if ((input.control || input.meta) && input.shift && input.key.toLowerCase() === 'i') {
            mainWindow.webContents.openDevTools()
        }
    })

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    initWhatsApp();
}

function initWhatsApp() {
    try {
        if (whatsappClient && (whatsappStatus === 'CONNECTING' || whatsappStatus === 'QR_READY' || whatsappStatus === 'AUTHENTICATED' || whatsappStatus === 'READY')) {
            logToFile('[WhatsApp] Client already initialized or connecting. Status:', whatsappStatus);
            return;
        }

        logToFile('[WhatsApp] Initializing WhatsApp Client...');
        whatsappStatus = 'CONNECTING';

        // ── CRITICAL FIX: Clear Chromium SingletonLock before each init ───────
        // This prevents the 'Browser already running' error after a crash or
        // ungraceful shutdown. The lock file is stale and safe to delete.
        try {
            const sessionDir = path.join(app.getPath('userData'), 'whatsapp-session');
            const lockFiles = [
                path.join(sessionDir, 'Default', 'SingletonLock'),
                path.join(sessionDir, 'SingletonLock'),
            ];
            for (const lockFile of lockFiles) {
                if (fs.existsSync(lockFile)) {
                    fs.unlinkSync(lockFile);
                    logToFile('[WhatsApp] Cleared stale Chromium lock file:', lockFile);
                }
            }
            // Also look inside any profile dir
            if (fs.existsSync(sessionDir)) {
                const entries = fs.readdirSync(sessionDir);
                for (const entry of entries) {
                    const entryPath = path.join(sessionDir, entry);
                    const lock = path.join(entryPath, 'SingletonLock');
                    if (fs.existsSync(lock)) {
                        fs.unlinkSync(lock);
                        logToFile('[WhatsApp] Cleared stale lock in subdir:', lock);
                    }
                }
            }
        } catch (lockErr) {
            logToFile('[WhatsApp] Warning: Could not clear lock files:', lockErr.message);
        }

        // Windows FIX: Building on Mac for Windows doesn't bundle the correct Chromium.
        // We'll try to find Chrome or Edge on the user's Windows machine as a backup.
        let executablePath = undefined;
        if (process.platform === 'win32') {
            const potentialPaths = [
                'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
                'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
                'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
                'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
                // Chrome in user local apps
                path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
                path.join(process.env.PROGRAMFILES || '', 'Google\\Chrome\\Application\\chrome.exe'),
                path.join(process.env['PROGRAMFILES(X86)'] || '', 'Google\\Chrome\\Application\\chrome.exe')
            ];
            for (const p of potentialPaths) {
                if (fs.existsSync(p)) {
                    logToFile('[WhatsApp] Found system browser for Puppeteer:', p);
                    executablePath = p;
                    break;
                }
            }
        }

    whatsappClient = new Client({
        authStrategy: new LocalAuth({
            dataPath: path.join(app.getPath('userData'), 'whatsapp-session')
        }),
        webVersionCache: {
            type: 'remote',
            remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
        },
        puppeteer: {
            headless: 'new',
            executablePath: executablePath,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-extensions',
                '--no-zygote',
                '--disable-gpu',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-breakpad',
                '--disable-component-extensions-with-background-pages',
                '--disable-ipc-flooding-protection',
                '--disable-renderer-backgrounding',
                '--proxy-server="direct://"',
                '--proxy-bypass-list=*',
                '--js-flags="--max-old-space-size=512"' // Lower memory overhead
            ]
        },
        authTimeoutMs: 120000 // Increased to 2 minutes for slower machines
    });

    let authToReadyTimeout;

    whatsappClient.on('qr', async (qr) => {
        try {
            console.log('WhatsApp QR Received');
            whatsappStatus = 'QR_READY';
            if (authToReadyTimeout) clearTimeout(authToReadyTimeout);
            
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('whatsapp:qr', qr);
                mainWindow.webContents.send('whatsapp:status', whatsappStatus);
            }
        } catch (qrErr) {
            logToFile('[WhatsApp] Error in QR handler:', qrErr.message || qrErr);
        }
    });

    whatsappClient.on('authenticated', () => {
        console.log('WhatsApp Authenticated');
        whatsappStatus = 'AUTHENTICATED';
        if (mainWindow) {
            mainWindow.webContents.send('whatsapp:authenticated');
            mainWindow.webContents.send('whatsapp:status', whatsappStatus);
        }

        // FAILSAFE: If it stays in AUTHENTICATED state for 2 minutes without reaching READY, it's hung
        if (authToReadyTimeout) clearTimeout(authToReadyTimeout);
        authToReadyTimeout = setTimeout(() => {
            if (whatsappStatus === 'AUTHENTICATED') {
                console.error('WhatsApp failed to transition from AUTHENTICATED to READY in 2 minutes.');
                if (whatsappClient) whatsappClient.destroy().catch(() => { });
                whatsappStatus = 'DISCONNECTED';
                if (mainWindow) {
                    mainWindow.webContents.send('whatsapp:status', whatsappStatus);
                    mainWindow.webContents.send('whatsapp:auth_failure', 'Connection timeout after scanning. Please try re-syncing.');
                }
            }
        }, 120000);
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
        if (authToReadyTimeout) clearTimeout(authToReadyTimeout);
        if (mainWindow) mainWindow.webContents.send('whatsapp:ready');
        if (mainWindow) mainWindow.webContents.send('whatsapp:status', whatsappStatus);
    });

    whatsappClient.on('change_state', (state) => {
        console.log('WhatsApp State Changed:', state);
    });

    whatsappClient.on('error', (err) => {
        logToFile('[WhatsApp] Library Error:', require('util').inspect(err, { depth: 2, colors: false }));
    });

    whatsappClient.on('disconnected', (reason) => {
        console.log('WhatsApp Disconnected:', reason);
        whatsappStatus = 'DISCONNECTED';
        if (mainWindow) mainWindow.webContents.send('whatsapp:status', whatsappStatus);
    });

        logToFile('[WhatsApp] Starting WhatsApp Client initialization...');
        whatsappClient.initialize().then(() => {
            logToFile('[WhatsApp] Client initialization promise resolved');
        }).catch(err => {
            logToFile('[WhatsApp] Initialization Error:', err.message);
            whatsappStatus = 'DISCONNECTED';
            if (mainWindow) {
                mainWindow.webContents.send('whatsapp:status', whatsappStatus);
                mainWindow.webContents.send('whatsapp:auth_failure', 'Initialization failed: ' + (err.message || 'Unknown error'));
            }
        });
    } catch (e) {
        logToFile('[WhatsApp] CRITICAL failure in initWhatsApp:', e.message);
    }
}

// IPC Handlers
ipcMain.handle('whatsapp:send-pdf', async (event, { phoneNumber, pdfBase64, filename, caption }) => {
    if (whatsappStatus !== 'READY') {
        throw new Error('WhatsApp is not ready. Status: ' + whatsappStatus);
    }

    // Guard against 'Cannot read properties of null (reading evaluate)'
    // This happens when the Puppeteer browser context has been destroyed
    if (!whatsappClient || !whatsappClient.pupPage) {
        whatsappStatus = 'DISCONNECTED';
        if (mainWindow) mainWindow.webContents.send('whatsapp:status', whatsappStatus);
        throw new Error('WhatsApp browser context lost. Please click Re-sync Connection to reconnect.');
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

    // CRITICAL: Wipe the session folder to ensure a clean start
    const sessionPath = path.join(app.getPath('userData'), 'whatsapp-session');
    try {
        if (fs.existsSync(sessionPath)) {
            fs.rmSync(sessionPath, { recursive: true, force: true });
            console.log('Wiped WhatsApp session folder:', sessionPath);
        }
    } catch (err) {
        console.error('Failed to wipe session folder:', err);
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

// ─── Google Drive OAuth Handlers ─────────────────────────────────────────────
// Service accounts have no Drive storage quota, so we use OAuth to upload
// PDFs under the user's personal Google Drive account instead.

const DRIVE_TOKEN_FILE = path.join(app.getPath('userData'), 'drive_token.json');

// Read stored Drive OAuth tokens from disk
function readDriveTokens() {
    try {
        if (fs.existsSync(DRIVE_TOKEN_FILE)) {
            return JSON.parse(fs.readFileSync(DRIVE_TOKEN_FILE, 'utf-8'));
        }
    } catch (e) {
        console.error('[Drive OAuth] Failed to read tokens:', e);
    }
    return null;
}

// Write tokens to disk
function writeDriveTokens(tokens) {
    try {
        fs.writeFileSync(DRIVE_TOKEN_FILE, JSON.stringify(tokens), 'utf-8');
    } catch (e) {
        console.error('[Drive OAuth] Failed to write tokens:', e);
    }
}

// Exchange code/refresh_token for a fresh access token via HTTPS
function postOAuthRequest(body) {
    return new Promise((resolve, reject) => {
        const data = new URLSearchParams(body).toString();
        const req = https.request({
            hostname: 'oauth2.googleapis.com',
            path: '/token',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(data)
            }
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(body)); }
                catch (e) { reject(new Error('Bad JSON: ' + body)); }
            });
        });
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

// Get a valid access token (refresh if expired)
async function getDriveOAuthAccessToken() {
    const tokens = readDriveTokens();
    if (!tokens || !tokens.refresh_token) return null;

    // If we have a fresh access_token use it
    if (tokens.access_token && tokens.expires_at && Date.now() < tokens.expires_at - 60000) {
        return tokens.access_token;
    }

    // Refresh it
    const serviceKey = process.env.NEXT_PUBLIC_GOOGLE_SERVICE_ACCOUNT_KEY
        ? JSON.parse(process.env.NEXT_PUBLIC_GOOGLE_SERVICE_ACCOUNT_KEY)
        : {};
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID || 
                     process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID_WEB || 
                     process.env.GOOGLE_OAUTH_CLIENT_ID || 
                     serviceKey.oauth_client_id || '';
    const clientSecret = process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_SECRET || 
                         process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_SECRET_WEB || 
                         process.env.GOOGLE_OAUTH_CLIENT_SECRET || 
                         serviceKey.oauth_client_secret || '';

    const result = await postOAuthRequest({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: tokens.refresh_token,
        grant_type: 'refresh_token'
    });

    if (result.error) {
        console.error('[Drive OAuth] Refresh failed:', result.error);
        return null;
    }

    const updated = {
        ...tokens,
        access_token: result.access_token,
        expires_at: Date.now() + (result.expires_in - 60) * 1000
    };
    writeDriveTokens(updated);
    return result.access_token;
}

// IPC: Check if Drive is connected
ipcMain.handle('drive:is-connected', () => {
    const tokens = readDriveTokens();
    return !!(tokens && tokens.refresh_token);
});

// IPC: Get a fresh OAuth access token (used by renderer for Drive uploads)
ipcMain.handle('drive:get-access-token', async () => {
    return await getDriveOAuthAccessToken();
});

// NEW: IPC for Service Account token (used by googleSheetWriter.ts to avoid CORS)
ipcMain.handle('google:get-service-token', async (event, { credentials }) => {
    try {
        const now = Math.floor(Date.now() / 1000);
        
        // Use Node's crypto for signing
        const crypto = require('crypto');
        
        const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
        const claims = Buffer.from(JSON.stringify({
            iss: credentials.client_email,
            scope: 'https://www.googleapis.com/auth/spreadsheets',
            aud: 'https://oauth2.googleapis.com/token',
            exp: now + 3600,
            iat: now,
        })).toString('base64url');
        
        const signInput = `${header}.${claims}`;
        const signer = crypto.createSign('RSA-SHA256');
        signer.update(signInput);
        signer.end();
        const signature = signer.sign(credentials.private_key, 'base64url');
        
        const jwt = `${signInput}.${signature}`;
        
        const https = require('https');
        return new Promise((resolve, reject) => {
            const data = new URLSearchParams({
                grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                assertion: jwt
            }).toString();
            
            const req = https.request({
                hostname: 'oauth2.googleapis.com',
                path: '/token',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Content-Length': Buffer.byteLength(data)
                }
            }, (res) => {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => {
                    try { resolve(JSON.parse(body)); }
                    catch (e) { reject(new Error('Bad response from Google: ' + body)); }
                });
            });
            req.on('error', reject);
            req.write(data);
            req.end();
        });
    } catch (err) {
        console.error('[Main] Google token fetch failed:', err);
        throw err;
    }
});

// IPC: Open OAuth window — user just signs in, no code copying needed
// Uses loopback redirect: Google sends the code to http://localhost:PORT automatically
ipcMain.handle('drive:connect', async (event, { clientId }) => {
    const http = require('http');
    const net = require('net');

    // Find a free port
    const port = await new Promise((resolve, reject) => {
        const srv = net.createServer();
        srv.listen(0, '127.0.0.1', () => {
            const p = srv.address().port;
            srv.close(() => resolve(p));
        });
        srv.on('error', reject);
    });

    const redirectUri = `http://localhost:${port}`;

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/drive');
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');

    return new Promise((resolve, reject) => {
        // Start a one-shot local HTTP server to catch the redirect
        const server = http.createServer((req, res) => {
            const url = new URL(req.url, `http://localhost:${port}`);
            const code = url.searchParams.get('code');
            const error = url.searchParams.get('error');

            // Send a friendly success/error page to close the browser window
            const html = code
                ? `<html><body style="font-family:sans-serif;text-align:center;padding:60px;background:#f0fdf4">
                        <h2 style="color:#16a34a">✓ Google Drive Connected!</h2>
                        <p>You can close this window and return to the app.</p>
                        <script>window.close();</script>
                   </body></html>`
                : `<html><body style="font-family:sans-serif;text-align:center;padding:60px;background:#fef2f2">
                        <h2 style="color:#dc2626">Connection Failed</h2>
                        <p>${error || 'Unknown error'}</p>
                        <script>window.close();</script>
                   </body></html>`;

            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(html);
            server.close();

            if (authWindow && !authWindow.isDestroyed()) authWindow.close();
            if (error) reject(new Error('OAuth error: ' + error));
            else resolve({ code, redirectUri });
        });

        server.listen(port, '127.0.0.1');

        // Open the Electron auth window with Google's sign-in page
        const authWindow = new BrowserWindow({
            width: 500,
            height: 650,
            show: true,
            title: 'Connect Google Drive',
            webPreferences: { nodeIntegration: false, contextIsolation: true }
        });

        authWindow.loadURL(authUrl.toString());
        authWindow.on('closed', () => {
            server.close();
            resolve(null); // User closed window without signing in
        });
    });
});


// IPC: Exchange code for tokens and store them
ipcMain.handle('drive:save-tokens', async (event, tokens) => {
    writeDriveTokens({
        ...tokens,
        expires_at: Date.now() + (tokens.expires_in - 60) * 1000
    });
    return true;
});

// IPC: Disconnect/Logout from Google Drive
ipcMain.handle('drive:disconnect', async () => {
    try {
        if (fs.existsSync(DRIVE_TOKEN_FILE)) {
            fs.unlinkSync(DRIVE_TOKEN_FILE);
            return true;
        }
    } catch (err) {
        console.error('[Main] Failed to disconnect Drive:', err);
        throw err;
    }
    return false;
});

// ─────────────────────────────────────────────────────────────────────────────

app.whenReady().then(() => {
    // ── Set a custom User-Agent to satisfy OSM tile usage policy ─────────────
    // Without this, Electron's default UA gets blocked with 403 Access Blocked
    const { session } = require('electron');
    session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
        details.requestHeaders['User-Agent'] = 'SriVariERP/1.0 (contact: srivarienterprises@gmail.com)';
        callback({ requestHeaders: details.requestHeaders });
    });

    // ── Register app:// protocol handler ─────────────────────────────────────
    protocol.handle('app', (request) => {
        const url = new URL(request.url)
        let pathname = decodeURIComponent(url.pathname)

        // Normalize Pathname for Windows
        pathname = pathname.replace(/^\//, ''); // remove leading slash
        if (pathname === '' || pathname === '/') pathname = 'index.html'

        logToFile('[app://] Loading:', pathname);

        // Handle Next.js route pathnames (SPA logic)
        if (!path.extname(pathname) && !pathname.endsWith('/')) {
            pathname += '/index.html'
        }

        const filePath = path.join(outDir, pathname)
        const fileUrl = require('url').pathToFileURL(filePath).toString()

        return net.fetch(fileUrl).catch(err => {
            console.error('[app://] fetch error:', err, 'for', fileUrl)
            // SPA Fallback: if not found, serve the main index.html
            const fallbackPath = path.join(outDir, 'index.html')
            return net.fetch(require('url').pathToFileURL(fallbackPath).toString())
        })
    })

    createWindow()
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
