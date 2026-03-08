const fs = require('fs');
const content = fs.readFileSync('.env.local', 'utf8');
const match = content.match(/NEXT_PUBLIC_GOOGLE_SERVICE_ACCOUNT_KEY='(.*)'/);
if (!match) {
    console.log('Key not found in .env.local');
    process.exit(1);
}
const keyStr = match[1];

try {
    JSON.parse(keyStr);
    console.log('JSON.parse successful in script');
} catch (e) {
    console.log('JSON.parse failed:', e.message);
    // Find the position mentioned in the error if possible, or search for backslashes
    let i = 0;
    while ((i = keyStr.indexOf('\\', i)) !== -1) {
        const charAfter = keyStr[i + 1];
        console.log(`Backslash at ${i}, followed by: "${charAfter}" (code: ${charAfter ? charAfter.charCodeAt(0) : 'N/A'})`);
        i++;
    }
}
