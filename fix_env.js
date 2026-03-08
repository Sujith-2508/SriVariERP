const fs = require('fs');
const content = fs.readFileSync('.env.local', 'utf8');
// Replace malformed backslash followed by space with \n
const fixedContent = content.replace(/\\ /g, '\\n');
fs.writeFileSync('.env.local', fixedContent);
console.log('Fixed .env.local content');
