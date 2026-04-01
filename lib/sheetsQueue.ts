/**
 * Google Sheets Write Queue
 *
 * Architecture:
 * - All Sheet WRITES are queued in localStorage and processed one-by-one
 *   at a safe rate (1 write every 2 seconds → max 30 writes/min, well within the 60/min quota)
 * - All Sheet READS are served from an in-memory + localStorage cache (TTL: 5 min)
 *   and only hit the real API when the cache is cold or explicitly invalidated
 * - If a 429 is received, the operation is re-queued with an exponential back-off
 *
 * This means the UI never waits on a Sheet API call and never blows the quota.
 */

// ────────── Storage Keys ──────────
const QUEUE_KEY     = 'sve_sheets_queue';
const LAST_REQ_KEY  = 'sve_last_sheet_req';
const TOKEN_KEY     = 'sve_google_token';

// ────────── Rate limits ──────────
const WRITE_GAP_MS    = 2_000;  // 1 write per 2 s → ≤30/min (quota is 60)
const RETRY_BASE_MS   = 5_000;  // 5 s base back-off on 429
const MAX_RETRIES     = 5;
const CACHE_TTL_MS    = 5 * 60_000; // 5-minute read cache

// ────────── Types ──────────
export interface QueuedOp {
  id: string;         // unique op id
  path: string;       // e.g. '/values/CurrentProducts!A5:I5'
  method: string;     // GET | PUT | POST
  body?: any;
  isLog?: boolean;    // → use LOG spreadsheet
  retries: number;
  queuedAt: number;
}

// ────────── In-memory read cache ──────────
let readCache: Record<string, { data: any; ts: number }> = {};

export function clearReadCache(pathPrefix = '') {
  if (pathPrefix) {
    Object.keys(readCache).forEach(k => {
      if (k.startsWith(pathPrefix)) delete readCache[k];
    });
  } else {
    readCache = {};
  }
}

// ────────── Queue helpers ──────────
function loadQueue(): QueuedOp[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveQueue(q: QueuedOp[]): void {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
}

/** Enqueue a write operation. Deduplication: if same path+method already queued, replace it. */
export function enqueueOp(path: string, method: string, body?: any, isLog = false): void {
  const q = loadQueue();
  const existingIdx = q.findIndex(op => op.path === path && op.method === method);
  const op: QueuedOp = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
    path, method, body, isLog,
    retries: 0,
    queuedAt: Date.now(),
  };
  if (existingIdx >= 0) {
    q[existingIdx] = op; // replace stale op with latest data
  } else {
    q.push(op);
  }
  saveQueue(q);
  scheduleFlush();
}

// ────────── Flush scheduler ──────────
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleFlush(delay = 100): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushQueue();
  }, delay);
}

async function flushQueue(): Promise<void> {
  const q = loadQueue();
  if (q.length === 0) return;

  // Rate-limit: ensure enough time has passed since last real API request
  const lastReq = parseInt(localStorage.getItem(LAST_REQ_KEY) || '0', 10);
  const waitMs = WRITE_GAP_MS - (Date.now() - lastReq);
  if (waitMs > 0) {
    scheduleFlush(waitMs + 50);
    return;
  }

  // Grab the oldest op
  const op = q[0];

  try {
    localStorage.setItem(LAST_REQ_KEY, String(Date.now()));
    const token = await getAccessToken();
    const SPREADSHEET_ID     = '1ksFhdJK6-sQxVBIkqqJdRKPhm--_SfzpJeuC2GHR2y0';
    const LOG_SPREADSHEET_ID = '1O5Rjp2iA4dvq7rQog2-al5wDdn3xpjAm3KAFgX3AQ9U';
    const base = op.isLog
      ? `https://sheets.googleapis.com/v4/spreadsheets/${LOG_SPREADSHEET_ID}`
      : `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}`;

    const res = await fetch(`${base}${op.path}`, {
      method: op.method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: op.body ? JSON.stringify(op.body) : undefined,
    });

    if (res.status === 429) {
      throw new Error('RATE_LIMITED');
    }
    if (!res.ok) {
      const text = await res.text();
      // "already exists" is a benign error from ensureTabExistsWithName — drop silently
      if (text.includes('already exists')) {
        console.log('[SheetsQueue] Tab already exists — dropping op silently');
        q.shift();
        saveQueue(q);
      } else {
        console.error('[SheetsQueue] API error', res.status, text.slice(0, 200));
        // Drop non-retryable errors so they don't block the queue
        q.shift();
        saveQueue(q);
      }
    } else {
      // Success — remove op from queue
      q.shift();
      saveQueue(q);
    }
  } catch (err: any) {
    if (err?.message === 'RATE_LIMITED' || op.retries < MAX_RETRIES) {
      // Back-off and retry
      op.retries++;
      const delay = RETRY_BASE_MS * Math.pow(2, op.retries - 1);
      console.warn(`[SheetsQueue] Rate limited / error. Retry ${op.retries}/${MAX_RETRIES} in ${delay}ms`);
      q[0] = op;
      saveQueue(q);
      scheduleFlush(delay);
      return;
    } else {
      // Max retries exceeded — drop
      console.error('[SheetsQueue] Dropping op after max retries:', op.path);
      q.shift();
      saveQueue(q);
    }
  }

  // Schedule next op if queue still has items
  if (q.length > 1 || loadQueue().length > 0) {
    scheduleFlush(WRITE_GAP_MS);
  }
}

// ────────── Read with cache ──────────
export async function cachedRead(path: string, isLog = false): Promise<any> {
  const cacheKey = `${isLog ? 'log' : 'main'}:${path}`;
  const cached = readCache[cacheKey];
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    console.log('[SheetsQueue] Cache hit:', path);
    return cached.data;
  }

  // Rate-limit reads too
  const lastReq = parseInt(localStorage.getItem(LAST_REQ_KEY) || '0', 10);
  const waitMs = WRITE_GAP_MS - (Date.now() - lastReq);
  if (waitMs > 0) {
    await new Promise(r => setTimeout(r, waitMs + 50));
  }
  localStorage.setItem(LAST_REQ_KEY, String(Date.now()));

  const SPREADSHEET_ID     = '1ksFhdJK6-sQxVBIkqqJdRKPhm--_SfzpJeuC2GHR2y0';
  const LOG_SPREADSHEET_ID = '1O5Rjp2iA4dvq7rQog2-al5wDdn3xpjAm3KAFgX3AQ9U';
  const base = isLog
    ? `https://sheets.googleapis.com/v4/spreadsheets/${LOG_SPREADSHEET_ID}`
    : `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}`;

  const token = await getAccessToken();
  const res = await fetch(`${base}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 429) {
    // Return stale cache if available, otherwise throw
    if (cached) {
      console.warn('[SheetsQueue] 429 on read — serving stale cache for', path);
      return cached.data;
    }
    throw new Error('Rate limited — no cache available');
  }
  if (!res.ok) {
    throw new Error(`Sheets API error ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  readCache[cacheKey] = { data, ts: Date.now() };
  return data;
}

// ────────── Shared Token (localStorage) ──────────
async function getAccessToken(): Promise<string> {
  // 1. Try shared cache
  try {
    const cached = localStorage.getItem(TOKEN_KEY);
    if (cached) {
      const { token, expires } = JSON.parse(cached);
      if (Date.now() < expires) return token;
    }
  } catch {}

  // 2. Use Electron bridge if available
  const serviceAccountKey = process.env.NEXT_PUBLIC_GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!serviceAccountKey) throw new Error('NEXT_PUBLIC_GOOGLE_SERVICE_ACCOUNT_KEY not set');
  const credentials = JSON.parse(serviceAccountKey);

  if (typeof window !== 'undefined' && (window as any).electron?.drive?.getServiceToken) {
    const tokenData = await (window as any).electron.drive.getServiceToken(credentials);
    const expires = Date.now() + (tokenData.expires_in - 60) * 1000;
    localStorage.setItem(TOKEN_KEY, JSON.stringify({ token: tokenData.access_token, expires }));
    return tokenData.access_token;
  }

  // 3. Direct JWT
  const now = Math.floor(Date.now() / 1000);
  const b64url = (s: string) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  const b64urlBuf = (buf: ArrayBuffer) => {
    const bytes = new Uint8Array(buf);
    let bin = '';
    bytes.forEach(b => bin += String.fromCharCode(b));
    return btoa(bin).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  };

  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({
    iss: credentials.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600, iat: now,
  }));
  const signInput = `${header}.${claims}`;

  const pem = credentials.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/g,'').replace(/-----END PRIVATE KEY-----/g,'')
    .replace(/\\n/g,'').replace(/\n/g,'').replace(/\s/g,'');
  const pemBytes = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
  const pk = await crypto.subtle.importKey('pkcs8', pemBytes.buffer, { name:'RSASSA-PKCS1-v1_5', hash:'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pk, new TextEncoder().encode(signInput));
  const jwt = `${signInput}.${b64urlBuf(sig)}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const tokenData = await tokenRes.json();
  const expires = Date.now() + (tokenData.expires_in - 60) * 1000;
  localStorage.setItem(TOKEN_KEY, JSON.stringify({ token: tokenData.access_token, expires }));
  return tokenData.access_token;
}
