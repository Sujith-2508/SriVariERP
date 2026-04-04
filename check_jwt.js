const jwt = process.argv[2];
if (!jwt) {
    console.error('No JWT provided');
    process.exit(1);
}

try {
    const parts = jwt.split('.');
    if (parts.length !== 3) {
        console.error('Not a standard 3-part JWT');
        process.exit(0);
    }
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    console.log('JWT Payload:', JSON.stringify(payload, null, 2));
} catch (e) {
    console.error('Failed to decode JWT:', e.message);
}
