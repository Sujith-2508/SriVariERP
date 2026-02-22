import fs from 'fs';
import crypto from 'crypto';

// Authenticate using .env.local
const envFile = fs.readFileSync('.env.local', 'utf-8');
const env: Record<string, string> = {};
envFile.split('\n').forEach(line => {
    const [key, ...value] = line.split('=');
    if (key && value) env[key.trim()] = value.join('=').trim().replace(/^"(.*)"$/, '$1');
});

const SPREADSHEET_ID = '1nQBRIzwiht43R9nXYzUj-M2EXp8qmWCXh9asC-GNJL0';
const SERVICE_ACCOUNT_KEY = env.NEXT_PUBLIC_GOOGLE_SERVICE_ACCOUNT_KEY;
const SRC_SHEET_NAME = 'Dealers, suppliers address';
const REFINED_SHEET_NAME = 'refined dealers';

if (!SERVICE_ACCOUNT_KEY) {
    console.error('SERVICE_ACCOUNT_KEY not found in .env.local');
    process.exit(1);
}

const credentials = JSON.parse(SERVICE_ACCOUNT_KEY);

async function getAccessToken() {
    const now = Math.floor(Date.now() / 1000);
    const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = base64url(JSON.stringify({
        iss: credentials.client_email,
        scope: 'https://www.googleapis.com/auth/spreadsheets',
        aud: 'https://oauth2.googleapis.com/token',
        exp: now + 3600,
        iat: now,
    }));
    const signInput = `${header}.${claims}`;
    const signature = crypto.sign('RSA-SHA256', Buffer.from(signInput), credentials.private_key);
    const jwt = `${signInput}.${base64urlFromBuffer(signature)}`;
    const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
    });
    const data = await response.json();
    return data.access_token;
}

function base64url(str: string) { return Buffer.from(str).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function base64urlFromBuffer(buffer: Buffer) { return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }

async function sheetsRequest(path: string, method = 'GET', body: any = null, token: string) {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}${path}`;
    const response = await fetch(url, {
        method,
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : null,
    });
    if (!response.ok) {
        const err = await response.text();
        throw new Error(`Sheets API error: ${err}`);
    }
    return response.json();
}

const NOISE_NAMES = [
    'Angappan', 'Aravind', 'Bank', 'Cash', 'Cash Discount', 'Cheque', 'Cheques',
    'Discount Allowed', 'Freight Charges', 'IGST', 'SGST', 'Purchase',
    'Transport Charges', 'Scrab', 'Mahaboob', 'Puli Gudown', 'Round off',
    'sales return', 'stock return', 'vel murugan', 'kaliappan', 'gopalakrisshnan',
    'kaja mydeen', 'KV capital', 'MKV capital'
].map(n => n.toLowerCase());

const REFINED_DEALER_LIST = [
    "Gifts & Metal", "Indian Metal Mart", "J Flora", "Jagan Super Store", "Jain Metal Store",
    "Janatha Metals", "Jayam Agencies", "Jayam Traders", "Jeeva Metal", "Jeyam Department",
    "Jeyam Furnitures", "Jeyarathna Metal Mart", "Kaaba Furnitures", "Kaja Steels & Furniture",
    "Kalavathi Metal", "Kaliyappan", "Kamatchi Metal", "Kamatchi Steel House", "Kani Stores & Metal",
    "Karthikeyan Steel House", "Kavi Traders", "K G Metal Mart", "K K Thirukavel Metal",
    "Kumbakonam Pathirakadai", "Kumaran Pattira Maligai", "Lakshmi Metal", "Lakshmi Metal Corporation",
    "Lakshmi Metal Mart", "Latha Metal", "Laxmi Metals", "Lotus Department", "Lucky Metal Plaza",
    "Lulu Super Market", "Madan Metal", "Madhena Metal Store", "Madras Metal", "Magesh Gas Service",
    "Maha Metal Mart", "Mahalakshmi Metals Stores", "Maharaja Stores", "Maharasi Metal Mart and Furnitures",
    "Mangal & Mangal", "Mani Plastic", "Maruthi Steels", "Mayura Agencies", "Meen Mark Metal Corporation",
    "Mega Metal", "MKV Capital", "M/S Cheeram Metals", "M/S Geetha Agencies", "M/S Hari Furnitures & Electronics",
    "Mukesh Electricals and Home Appliances", "Muthu Metal Mart", "Narayana Pathirakadai",
    "National Erumad", "Nataraj Metal", "Nayagam Metal", "New Aysha Traders", "New Aysha Traders (Branch)",
    "New Lucky Metal", "New Mangalam Steel House", "New Premier Steels and Gifts", "NRG Metal Mart",
    "O N K Traders", "Ovg Enterprises", "P K S Silks", "Palaniyappa Metal Mart", "Ponmani Steel House",
    "Ponnu Corporation", "Prabha Metal Mart", "Prabu Metal Store", "Prakesh Steel House",
    "Priya Home Center", "Priya Shopping Centre", "Priyadarshini Metal", "Priyadarshini Metal Mart",
    "Pushpam Metals", "Pushpamali Stores", "Queeta Stores", "Raja Furnitures & Electronics",
    "Rajakshmi Enterprises", "Ramdev Marketing", "Rasi Furniture", "Rekha Metal Stores",
    "Renga Stores", "Renuga Enterprises", "Rex Ooty", "Royal Furnitures", "R Vinayagan Stores",
    "S A B Mega Mall", "Sanmuga Agencies", "Sany Teakadai", "Saravana Metals", "Saravana Stores",
    "Sathi Sivan Metal Mart", "Selvakumar Metal Mart", "Selvam Metal Stores", "Selvam Vessel Stores",
    "Shanthinath Steels & Home Appliances", "Shree Chiraj Home Appliances", "Shri Balamurugan Stores",
    "Shri Krishna Metals", "Shri Lakshmi Super Market", "Shri Saravana Stores", "Singaravelan Metal Mart",
    "Sithara Furniture & Home Appliances", "Siva Plastics", "Siva Sathi Steel House", "Sivam Steel House",
    "Sivasathi Agency", "S J Steel House", "S K Enterprise", "S K Enterprises", "Sowbakyia Furniture and T V Mart",
    "S P Metal Mart", "S P S Steels & Gifts", "Sree Lakshmi Vilas Pathirakadai", "Sree Rajalakshmi Pathira Angadi",
    "Sree Ramnath Agencies", "Sree Rasalakshmi Metal Mart", "Sree Rasalakshmi Metal Marts",
    "Sree Saravana Stores", "Sree Sathi Metal Mart", "Sri Abirami Metal Stores", "Sri Ambika Metals and Traders",
    "Sri Annai Pathirakadai", "Sri Anur Traders", "Sri Balaji Steel House", "Sri Ganapathy Stores",
    "Sri Gokulam Enterprises", "Sri Jayam Departmental Stores", "Sri Senthilkumar Furnitures",
    "Sri Senthur Murugan Metals", "Sri Sivasathi Steels House & Gifts", "Sri Sri Ganapathy Furniture and Home Appliances",
    "Sri Tharma Metal Stores", "Sri Theni Metal Stores", "Sri Traders", "Sri Valli Metal",
    "Sri Vasavi Eversilver Mart", "Sri Venkadeshwara Metal Mart", "Sri Venkateshwara Pathirakadai",
    "Sri Venkateshwara Metal Mart", "Sri Venkateshwara Metal Works", "Sri Vigneshwara Radios",
    "Sri Vinayaga Agencies", "Sri Vinayaga Metals & Home Needs", "Sri Vinayaga Traders",
    "Sri Visalatchi Vilas P R A Athimalingam & Sons", "Star Agency", "Star Electronics", "Suba Metal",
    "Subam Furnitures", "Sumit Kumar Sharma Construction Company", "Super Metal Mart", "Surya Furniture",
    "S V & Co", "SVM Metal", "S V S Metal", "Thamarai Selvi Traders", "The Cheanni & Co", "The Madras Metal Mart",
    "Thirumagal Metal", "Thirupathi Coirs", "Tip Top Furnitures & Home Appliances", "Tirupur Pathirakadai",
    "Tirupur Valli Vilas Pathipam and Furniture", "Udhyam Agencies", "Vadivel Pathirakadai", "Valli Electronics",
    "Vasantha Maligai", "Velmurugan Furniture Showroom", "Venkateshwara Metal", "Venkateshwara Metal Mart",
    "Venkateshwara Metal Works", "Vignesh Agency", "Vimalnath Agencies", "V M Silks", "V V G Stores",
    "V V Metal", "Youva Shree Agencies", "Yuvaraj Metals"
];

const REFINED_SUPPLIER_LIST = [
    "A PLUS TRADELINK LLP", "ARUN RUBBER PRODUCTS", "DHAKSHAN RUBBER TECHNOLOGIST",
    "G KRISH INDUSTRIES", "LAKSHMI COOKWARE", "M DEALS", "MUTHU METAL",
    "National Metal Industries", "Pawan Marudhar Home Appliances",
    "PNB KITCHENMATE LIMITED", "RAO RUBBER INDUSTRIES", "Sawan",
    "Suyambu Enterprises", "SWETA TRADING", "UTTAM AGENCIES", "VARDHAMAN INTERNATIONAL"
];

const REFINED_SUPPLIER_NAME = 'refined suppliers';

async function main() {
    console.log('Starting data refinement...');
    const token = await getAccessToken();

    // 1. Fetch current data
    const dataResponse = await sheetsRequest(`/values/${SRC_SHEET_NAME}!A:E`, 'GET', null, token);
    const rows = dataResponse.values || [];
    if (rows.length === 0) {
        console.log('No data found in source sheet.');
        return;
    }

    const header = rows[0];
    const dealers = [];
    dealers.push(header);

    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const name = (row[0] || '').trim();
        let address = (row[1] || '').trim();
        let gst = (row[2] || '').trim();
        let phone = (row[3] || '').trim();
        const period = row[4] || '';

        // Noise removal
        if (NOISE_NAMES.some(noise => name.toLowerCase().includes(noise))) {
            console.log(`Removing noise entry: ${name}`);
            continue;
        }

        // GST and Phone extraction from address
        // Pattern: NO: [GST], [Phone]
        // "in address inbetween NO: to before "," store in GST No. table after the GST NO , it haves a 10 digit phone number that store in Phone Number table"
        // Pattern: NO [separators] [GST] [Phone]
        // Very permissive: 10-15 alphanumeric for GST, then optional 10-digit phone
        const noPattern = /NO[^A-Z0-9]*([A-Z0-9]{10,15})(?:[^0-9]*(\d{10}))?/i;
        const match = address.match(noPattern);
        if (match) {
            const extractedGst = match[1].trim();
            const extractedPhone = match[2] ? match[2].trim() : '';

            gst = extractedGst;
            if (extractedPhone) phone = extractedPhone;

            // Clean address: remove the NO ... part
            address = address.replace(match[0], '').trim();
            // Cleanup commas and extra spaces
            address = address.replace(/,\s*,/g, ',').replace(/^,/, '').replace(/,$/, '').replace(/\s+/g, ' ').trim();

            console.log(`Rectified: ${name} | GST: ${gst} | Phone: ${phone}`);
        } else if (address.includes('NO')) {
            console.log(`Failed to match NO pattern in: ${name} | Address: ${address}`);
        }

        dealers.push([name, address, gst, phone, period]);
    }

    // 2. Update source sheet
    try {
        await sheetsRequest(`/values/${SRC_SHEET_NAME}!A:E:clear`, 'POST', {}, token);
        await sheetsRequest(`/values/${SRC_SHEET_NAME}!A1:E${dealers.length}?valueInputOption=USER_ENTERED`, 'PUT', { values: dealers }, token);
        console.log(`Updated ${SRC_SHEET_NAME} with ${dealers.length - 1} entries.`);
    } catch (e: any) {
        console.error(`Failed to update ${SRC_SHEET_NAME}:`, e.message);
    }

    // 3. Create/Update Refined Dealers & Suppliers
    const lowerRefinedDealers = REFINED_DEALER_LIST.map(d => d.toLowerCase());
    const lowerRefinedSuppliers = REFINED_SUPPLIER_LIST.map(s => s.toLowerCase());

    const refinedDealers = [header];
    const refinedSuppliers = [header];

    for (const dealer of dealers.slice(1)) {
        const name = dealer[0].toLowerCase();
        if (lowerRefinedDealers.includes(name)) {
            refinedDealers.push(dealer);
        }
        if (lowerRefinedSuppliers.includes(name)) {
            refinedSuppliers.push(dealer);
        }
    }

    console.log(`Found ${refinedDealers.length - 1} dealers and ${refinedSuppliers.length - 1} suppliers.`);

    try {
        // Ensure tabs exist
        const ssMetadata = await sheetsRequest('?fields=sheets.properties.title,sheets.properties.sheetId', 'GET', null, token);

        const ensureTab = async (name: string) => {
            const exists = ssMetadata.sheets.some((s: any) => s.properties.title === name);
            if (!exists) {
                await sheetsRequest(':batchUpdate', 'POST', {
                    requests: [{ addSheet: { properties: { title: name } } }]
                }, token);
                console.log(`Created sheet: ${name}`);
            }
        };

        await ensureTab(REFINED_SHEET_NAME);
        await ensureTab(REFINED_SUPPLIER_NAME);

        // Update Dealers
        await sheetsRequest(`/values/${REFINED_SHEET_NAME}!A:E:clear`, 'POST', {}, token);
        await sheetsRequest(`/values/${REFINED_SHEET_NAME}!A1:E${refinedDealers.length}?valueInputOption=USER_ENTERED`, 'PUT', { values: refinedDealers }, token);

        // Update Suppliers
        await sheetsRequest(`/values/${REFINED_SUPPLIER_NAME}!A:E:clear`, 'POST', {}, token);
        await sheetsRequest(`/values/${REFINED_SUPPLIER_NAME}!A1:E${refinedSuppliers.length}?valueInputOption=USER_ENTERED`, 'PUT', { values: refinedSuppliers }, token);

        console.log('Updated refined tabs.');

        // 4. Resize columns
        const updatedMetadata = await sheetsRequest('?fields=sheets.properties.title,sheets.properties.sheetId', 'GET', null, token);
        const tabsToResize = [SRC_SHEET_NAME, REFINED_SHEET_NAME, REFINED_SUPPLIER_NAME];

        const resizeRequests = [];
        for (const tabName of tabsToResize) {
            const sheetId = updatedMetadata.sheets.find((s: any) => s.properties.title === tabName)?.properties.sheetId;
            if (sheetId !== undefined) {
                resizeRequests.push(
                    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 250 }, fields: 'pixelSize' } },
                    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 }, properties: { pixelSize: 450 }, fields: 'pixelSize' } },
                    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 2, endIndex: 3 }, properties: { pixelSize: 150 }, fields: 'pixelSize' } },
                    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 3, endIndex: 4 }, properties: { pixelSize: 120 }, fields: 'pixelSize' } }
                );
            }
        }

        if (resizeRequests.length > 0) {
            await sheetsRequest(':batchUpdate', 'POST', { requests: resizeRequests }, token);
            console.log('Resized columns.');
        }

    } catch (e: any) {
        console.error(`Failed to complete final steps:`, e.message);
    }
}

main();
