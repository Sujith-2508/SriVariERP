const fs = require('fs');
const path = require('path');

// --- Environment Loading for Standalone Script ---
function loadEnv() {
    const envPath = path.join(__dirname, '.env.local');
    if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8');
        // Match NEXT_PUBLIC_GOOGLE_SERVICE_ACCOUNT_KEY='...' including multi-line
        const match = content.match(/NEXT_PUBLIC_GOOGLE_SERVICE_ACCOUNT_KEY='([\s\S]*?)'/);
        if (match) {
            process.env.NEXT_PUBLIC_GOOGLE_SERVICE_ACCOUNT_KEY = match[1];
        } else {
            // Fallback to double quotes
            const dmatch = content.match(/NEXT_PUBLIC_GOOGLE_SERVICE_ACCOUNT_KEY="([\s\S]*?)"/);
            if (dmatch) {
                process.env.NEXT_PUBLIC_GOOGLE_SERVICE_ACCOUNT_KEY = dmatch[1];
            }
        }
    }
}

loadEnv();

const keyString = process.env.NEXT_PUBLIC_GOOGLE_SERVICE_ACCOUNT_KEY;

if (!keyString) {
    console.error('Error: NEXT_PUBLIC_GOOGLE_SERVICE_ACCOUNT_KEY not found in environment or .env.local');
    process.exit(1);
}

try {
    const key = JSON.parse(keyString);
    console.log('JSON.parse successful');
    console.log('Project ID:', key.project_id);
    console.log('Client Email:', key.client_email);
} catch (e) {
    console.error('JSON.parse failed:', e.message);
    // Log a snippet for debugging (masking private key)
    console.log('Key snippet:', keyString.substring(0, 50) + '...');
}
