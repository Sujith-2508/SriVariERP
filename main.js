const { app, BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')

// Better detection: check if Next.js dev server is likely running
// In dev mode (electron-dev script), NODE_ENV might not be set, but we can check if 'out' folder exists
const outPath = path.join(__dirname, 'out/index.html')
const hasProductionBuild = fs.existsSync(outPath)

// Force dev mode when running electron-dev (localhost:3000 should be available)
// Only use production build if 'out' folder exists and NODE_ENV explicitly set to production
const isDev = process.env.NODE_ENV !== 'production' || !hasProductionBuild

function createWindow() {
    const win = new BrowserWindow({
        width: 1400,
        height: 900,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        },
        title: 'Sri Vari Enterprises - Billing ERP',
        icon: path.join(__dirname, 'public/icon.png')
    })

    // Remove default menu
    win.setMenuBarVisibility(false)

    if (isDev) {
        // Development: Load from Next.js dev server
        console.log('Loading from development server: http://localhost:3000')
        win.loadURL('http://localhost:3000')
        // DevTools disabled for clean UI
        // win.webContents.openDevTools()
    } else {
        // Production: Load from static export
        console.log('Loading from production build:', outPath)
        win.loadFile(outPath)
    }

    // Handle load errors
    win.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
        console.error(`Failed to load: ${errorDescription} (${errorCode})`)
        if (isDev) {
            // Retry loading after a short delay (dev server might still be starting)
            setTimeout(() => {
                console.log('Retrying connection to dev server...')
                win.loadURL('http://localhost:3000')
            }, 2000)
        }
    })
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
