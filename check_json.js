const fs = require('fs');
const path = require('path');

const content = fs.readFileSync('.env.local', 'utf8');
const lines = content.split('\n');
const keyLine = lines.find(l => l.startsWith('NEXT_PUBLIC_GOOGLE_SERVICE_ACCOUNT_KEY='));

if (!keyLine) {
    console.error('Key line not found');
    process.exit(1);
}

let value = keyLine.substring('NEXT_PUBLIC_GOOGLE_SERVICE_ACCOUNT_KEY='.length).trim();
if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
    value = value.substring(1, value.length - 1);
}

console.log('Value length:', value.length);

try {
    JSON.parse(value);
    console.log('JSON is VALID');
} catch (e) {
    console.error('JSON is INVALID:', e.message);
    const match = e.message.match(/at position (\d+)/);
    if (match) {
        const pos = parseInt(match[1]);
        console.error('Character at pos', pos, ':', value[pos], '(code:', value.charCodeAt(pos), ')');
        console.error('Context:', value.substring(Math.max(0, pos - 20), Math.min(value.length, pos + 20)));
    }
}
