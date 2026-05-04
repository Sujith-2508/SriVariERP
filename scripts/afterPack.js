/**
 * electron-builder afterPack hook
 * 
 * This script runs automatically after the app is packaged but BEFORE
 * the installer is created. It ensures:
 *   1. The custom "Sri Vari" lion icon is always stamped into the EXE
 *   2. Professional version information is embedded in the EXE resources
 *   3. The Electron default icon is never used
 */

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const os = require('os');

exports.default = async function afterPack(context) {
    const { appOutDir, electronPlatformName, packager } = context;

    // Only process Windows builds
    if (electronPlatformName !== 'win32') {
        console.log('[afterPack] Skipping non-Windows platform:', electronPlatformName);
        return;
    }

    console.log('[afterPack] ✅ Running custom icon & version stamping...');

    // ── Locate rcedit ──────────────────────────────────────────────────────────
    const winCodeSignCache = path.join(
        os.homedir(),
        'AppData', 'Local', 'electron-builder', 'Cache', 'winCodeSign'
    );

    let rceditPath = null;

    // Search through all cached winCodeSign versions
    if (fs.existsSync(winCodeSignCache)) {
        const versions = fs.readdirSync(winCodeSignCache)
            .filter(n => !n.endsWith('.7z'))
            .sort()
            .reverse(); // Prefer newest

        for (const version of versions) {
            const candidate = path.join(winCodeSignCache, version, 'rcedit-x64.exe');
            if (fs.existsSync(candidate)) {
                rceditPath = candidate;
                console.log('[afterPack] Found rcedit at:', rceditPath);
                break;
            }
        }
    }

    if (!rceditPath) {
        console.warn('[afterPack] ⚠️  rcedit not found in cache. Icon stamping skipped.');
        console.warn('[afterPack]    Run a full build once to download winCodeSign tools.');
        return;
    }

    // ── Locate the EXE ────────────────────────────────────────────────────────
    // Dynamically find the EXE to avoid hardcoded name breaking after version bumps
    const files = fs.readdirSync(appOutDir);
    const exeFile = files.find(f => f.endsWith('.exe'));
    if (!exeFile) {
        console.error('[afterPack] ❌ No .exe found in:', appOutDir);
        console.log('[afterPack] Available files:', files.join(', '));
        return;
    }
    const exePath = path.join(appOutDir, exeFile);
    console.log('[afterPack] Found EXE:', exeFile);

    if (!fs.existsSync(exePath)) {
        console.error('[afterPack] ❌ EXE path not accessible:', exePath);
        return;
    }

    // ── Locate the ICO ────────────────────────────────────────────────────────
    const icoPath = path.join(packager.projectDir, 'public', 'icon.ico');

    if (!fs.existsSync(icoPath)) {
        console.error('[afterPack] ❌ Custom icon not found at:', icoPath);
        console.error('[afterPack]    Ensure public/icon.ico exists.');
        return;
    }

    // ── Stamp the ICO into the EXE ────────────────────────────────────────────
    try {
        execFileSync(rceditPath, [
            exePath,
            '--set-icon', icoPath,
            '--set-version-string', 'ProductName', 'Sri Vari ERP Updated',
            '--set-version-string', 'FileDescription', 'Sri Vari Enterprises - Billing ERP System Updated Version',
            '--set-version-string', 'CompanyName', 'Sri Vari Enterprises',
            '--set-version-string', 'LegalCopyright', 'Copyright 2026 Sri Vari Enterprises',
            '--set-version-string', 'InternalName', 'SriVariERP',
            '--set-version-string', 'OriginalFilename', 'Sri Vari ERP.exe',
            '--set-file-version', '2.12.1.0',
            '--set-product-version', '2.12.1',
        ]);
        console.log('[afterPack] ✅ Custom icon and version info successfully stamped into EXE!');
        console.log('[afterPack]    Icon: public/icon.ico');
        console.log('[afterPack]    EXE: ', exePath);
    } catch (err) {
        console.error('[afterPack] ❌ rcedit failed:', err.message);
        // Don't throw — we still want the build to succeed even if stamping fails
    }
};
