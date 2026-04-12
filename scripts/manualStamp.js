const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Path to rcedit found in cache
const rceditPath = 'C:\\Users\\sujit\\AppData\\Local\\electron-builder\\Cache\\winCodeSign\\113784795\\rcedit-x64.exe';
const projectDir = 'c:\\Users\\sujit\\Documents\\GitHub\\Sri Vari project\\SriVariERP';
const exePath = path.join(projectDir, 'dist', 'win-unpacked', 'Sri Vari ERP 11-04-2026.exe');
const icoPath = path.join(projectDir, 'public', 'icon.ico');

console.log('--- Manual Stamping Start ---');
console.log('EXE:', exePath);
console.log('Icon:', icoPath);
console.log('Tool:', rceditPath);

if (!fs.existsSync(exePath)) {
    console.error('ERROR: EXE not found!');
    process.exit(1);
}

if (!fs.existsSync(icoPath)) {
    console.error('ERROR: Icon not found!');
    process.exit(1);
}

try {
    execFileSync(rceditPath, [
        exePath,
        '--set-icon', icoPath,
        '--set-version-string', 'ProductName', 'Sri Vari ERP 11-04-2026',
        '--set-version-string', 'FileDescription', 'Sri Vari Enterprises - Billing ERP System 11-04-2026',
        '--set-version-string', 'CompanyName', 'Sri Vari Enterprises',
        '--set-version-string', 'LegalCopyright', 'Copyright 2026 Sri Vari Enterprises',
        '--set-version-string', 'InternalName', 'SriVariERP',
        '--set-version-string', 'OriginalFilename', 'Sri Vari ERP.exe',
        '--set-file-version', '2.12.0.0',
        '--set-product-version', '2.12.0',
    ]);
    console.log('✅ Successfully stamped EXE with icon and version info.');
} catch (err) {
    console.error('❌ Failed to stamp EXE:', err.message);
    process.exit(1);
}
