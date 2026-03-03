const fs = require('fs');
const https = require('https');
const crypto = require('crypto');

const SPREADSHEET_ID = '1CxjsldaglA9AM0BIudjTjyX5E8mLTijMrLWw4oZ17PA';
const credentials = {
    "type": "service_account",
    "project_id": "gen-lang-client-0780647001",
    "private_key_id": "afe05e5e52fa79937fc55ecc8a50f6d3e14ca372",
    "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCygYfy+5+mOU8r\nToY9cAxNFIhTXb31KxjQVTeo6hczg8+POtbNB813aT2kXSAgQm1eFcMXJXvV3vG7\ndy+sfu6nQ8NpzpvdjAkrw6rLhy6BDqMCiNKexanVA35N1YD7qYd8bjizA1MKZhsj\nojKIytGsSRD8h9LZa9NA9GvzaT0N93s6hw2zy5+z+DBgkD43tGqZsdWjBRaiNy+s\n7Qd+OdVXAPqMnkvevdDAfwy0WHd5GO/sWa+kOZhWmSknZEK9x3SvTq6QQrhY6BW+\nw9okO//bBWOnf5xYHoCzJWOF5ffgR6UP6B6STg4T/Bj2KJpXNmbiwSja/fTZVu2d\n68ORXqWzAgMBAAECggEAQrCC/oQEasEpc0gEfgqRBfEgV2kD0Yc234qe31QJs/zQ\nPDYizvnVyQF//pquKG841fgyaUDfSZFf5YZLQNoxRjtaU/rVH4m0WW3iLuTDuoKh\n4w4EBj5Zy1PhSan05NC65gF13GdnDFEGXaM41wNTH1cy6e3Cl+khRTir5gYQwdjt\nwZHVVKBrIhqQUbmhC+rukc/GHRyjYpT+d8q3mRPgY5LcJptWtOBJUqxkPGjmF0kc\nm8sj9wrOPO2+RY0rgvLNloBhofki9CErljvYdG31guCj8nqk7u/o9bedM7BoA/DT\nBIQf8+LZJEj40t42EyC8t8gZy5wJgVFRkuwn9Il2kQKBgQDt/7yFCBnp2yMiQjvz\n6lBz4ZMeWI3tGK25Ww+IrqVfj2XSVZYXG7Gi2FHrMzU7YeaMiB+m84tLkIuct5ws\ndagDSb4gckuZGndtHLvxuwY3i57/ydv2fQbufnwh4vUvD2VYBmJuErmw0DDbSmX6\n3pGeW16ARYNJzr7VOoAk0/iWEQKBgQDAAdwISBjIusU143b9UTkBz1/3A4GGFn7N\nXBAN9eZins+cRxOGt0D1A2PUjFGIN0MTlGigaM0RWiAQN0O1RgNCb/6T9UDvH93a\nzMTSomMtETQJrLC/6QqeIludLrhj2mUggixODbhfgunDzrPVh0M38t2VisToKTxv\+5lir6UrgwKBgQCATiVQxpxJwZTATFrL1V9ICazpaC4jSvGlAp1uP1DyInlvGirP\nDGQIeXw4QyQIfm/vBRejRpqqwyMw+p9cLJXGKAQys8tjn6wQi7Qazou8eC3gke9e\ng+qvukqrbhJmK3OkL9TyqG+pDaO5JPOzejeg2nsoxdDQgn/IrkAVGp1iMQKBgEAc\nntbZFAV6b701rZaaF1nmX5nAPvCB9Gcn1WiD8iB9/L6m8Psrl3H4Zs4i6Fp+cVRJ\nWsItHEQt/sTLXz1ZGl+Fu9C1tK/jyRV1CEd413rF4sVUN1RtQRFaUZLjdchJtTis\nnpSVejnSIbIzA9NJrgUxgBGd22/VzQtrTGUqVxF3AoGAU3iVMyEWlAqsLDGbYN1U\nhq04HsiAv4Hv7J+X1LQbgsNLCaJjkdwJgQ0JuD/PxbZi+JqX5h/5DGVYP6nW5iIM\nDFMHKdNRvpb/LmAGuDFRCZQc/o4mrNmgf+uTdn7ZpFI9NeOycqdBpYf+d17pR9sa\n7MAEWzNr1uKMFLVfe4TC3nI=\n-----END PRIVATE KEY-----\n",
    "client_email": "srivari-sheets@gen-lang-client-0780647001.iam.gserviceaccount.com"
};

function base64url(str) {
    return Buffer.from(str).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function getAccessToken() {
    const now = Math.floor(Date.now() / 1000);
    const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = base64url(JSON.stringify({
        iss: credentials.client_email,
        scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
        aud: 'https://oauth2.googleapis.com/token',
        exp: now + 3600,
        iat: now,
    }));

    const signInput = `${header}.${claims}`;
    const signature = crypto.createSign('RSA-SHA256').update(signInput).sign(credentials.private_key, 'base64');
    const jwt = `${signInput}.${signature.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;

    return new Promise((resolve, reject) => {
        const req = https.request('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(JSON.parse(data).access_token));
        });
        req.on('error', reject);
        req.write(`grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`);
        req.end();
    });
}

async function fetchSheet(token, tab) {
    return new Promise((resolve, reject) => {
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/'${encodeURIComponent(tab)}'!A1:I500`;
        const req = https.request(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(JSON.parse(data)));
        });
        req.on('error', reject);
        req.end();
    });
}

async function run() {
    try {
        const token = await getAccessToken();
        console.log('Got token');

        const tabs = ['ARUN RUBBER PRODUCTS', 'Summary'];
        const results = {};

        for (const tab of tabs) {
            console.log(`Fetching ${tab}`);
            const data = await fetchSheet(token, tab);
            const rows = data.values || [];
            results[tab] = {
                rowCount: rows.length,
                dateHeaderIndex: rows.findIndex(r => r[0] && r[0].toString().trim() === 'Date'),
                sampleRows: rows.slice(0, 10),
                rowsAround90: rows.slice(85, 105)
            };
        }

        fs.writeFileSync('debug_sheet_final.json', JSON.stringify(results, null, 2));
        console.log('Saved results to debug_sheet_final.json');
    } catch (e) {
        console.error(e);
    }
}

run();
