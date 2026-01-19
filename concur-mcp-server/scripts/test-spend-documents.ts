import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const baseUrl = 'https://us.api.concursolutions.com';
const clientId = process.env.CONCUR_CLIENT_ID!;
const clientSecret = process.env.CONCUR_CLIENT_SECRET!;
const refreshToken = process.env.CONCUR_REFRESH_TOKEN!;

const testEntryId = process.argv[2];
const mode = process.argv[3] || 'entry'; // 'entry' or 'ereceipt'

if (!testEntryId) {
    console.error('Usage: npx ts-node scripts/test-spend-documents.ts <id> [entry|ereceipt]');
    process.exit(1);
}

async function getAccessToken(): Promise<string> {
    const response = await fetch('https://us.api.concursolutions.com/oauth2/v0/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
        }),
    });
    const data = await response.json();
    return data.access_token;
}

function parseJwt(token: string) {
    const base64Payload = token.split('.')[1];
    const payload = Buffer.from(base64Payload, 'base64').toString('utf8');
    return JSON.parse(payload);
}

async function testSpendDocuments(entryId: string) {
    const token = await getAccessToken();
    const tokenData = parseJwt(token);
    console.log('Token payload:', JSON.stringify(tokenData, null, 2));
    const companyId = tokenData['concur.company'] || tokenData.concur?.company?.id || tokenData.companyId;
    console.log('Got access token');
    console.log(`Company ID from token: ${companyId}\n`);

    const headers = {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
    };

    // Step 1: Get image ID from Image v1 API
    console.log('=== Step 1: Get Image ID from Image v1 ===');
    const imgRes = await fetch(`${baseUrl}/api/image/v1.0/expenseentry/${entryId}`, {
        headers: { ...headers, 'Accept': 'application/xml' },
    });
    const imgXml = await imgRes.text();
    console.log(`Status: ${imgRes.status}`);

    const imageIdMatch = imgXml.match(/<Id>([^<]*)<\/Id>/);
    const imageId = imageIdMatch?.[1];
    console.log(`Image ID: ${imageId}\n`);

    if (!imageId) {
        console.log('No image found for this entry');
        return;
    }

    // Step 2: Try Spend Documents v4 with imageId
    console.log('=== Step 2: Spend Documents v4 by imageId ===');
    const sdUrl = `${baseUrl}/spend-documents/v4/receipts?imageId=${imageId}&companyId=${companyId}`;
    console.log(`URL: ${sdUrl}`);
    const sdRes = await fetch(sdUrl, { headers });
    console.log(`Status: ${sdRes.status}`);
    const sdText = await sdRes.text();
    console.log(`Response: ${sdText.substring(0, 1000)}\n`);

    // Step 3: If we got a receipt ID, try to get representations
    try {
        const sdData = JSON.parse(sdText);
        const receiptId = sdData.id || sdData.receiptId;
        if (receiptId) {
            console.log('=== Step 3: Get Representations (image bytes) ===');
            const repUrl = `${baseUrl}/spend-documents/v4/receipts/${receiptId}/representations?type=display`;
            console.log(`URL: ${repUrl}`);
            const repRes = await fetch(repUrl, {
                headers: { ...headers, 'Accept': 'image/*, application/pdf' },
            });
            console.log(`Status: ${repRes.status}`);
            console.log(`Content-Type: ${repRes.headers.get('content-type')}`);
            console.log(`Content-Length: ${repRes.headers.get('content-length')}`);

            if (repRes.ok) {
                const bytes = await repRes.arrayBuffer();
                console.log(`SUCCESS! Got ${bytes.byteLength} bytes`);
            }
        }
    } catch (e) {
        console.log('Could not parse response as JSON');
    }

    // Step 4: Try direct receipt ID lookup (if imageId looks like UUID)
    if (imageId.includes('-')) {
        console.log('\n=== Step 4: Direct Receipt ID lookup ===');
        const directUrl = `${baseUrl}/spend-documents/v4/receipts/${imageId}`;
        console.log(`URL: ${directUrl}`);
        const directRes = await fetch(directUrl, { headers });
        console.log(`Status: ${directRes.status}`);
        const directText = await directRes.text();
        console.log(`Response: ${directText.substring(0, 500)}\n`);
    }
}

async function testEReceipt(receiptId: string) {
    const token = await getAccessToken();
    const tokenData = parseJwt(token);
    const companyId = tokenData['concur.company'];
    const userId = tokenData.sub;
    console.log(`Company ID: ${companyId}`);
    console.log(`User ID: ${userId}\n`);

    const headers = {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
    };

    // Try to fetch the e-receipt via Spend Documents v4
    console.log('=== Test: Spend Documents v4 for e-receipt ===');
    const sdUrl = `${baseUrl}/spend-documents/v4/receipts/${receiptId}`;
    console.log(`URL: ${sdUrl}`);
    const sdRes = await fetch(sdUrl, { headers });
    console.log(`Status: ${sdRes.status}`);
    const sdText = await sdRes.text();
    console.log(`Response: ${sdText.substring(0, 500)}\n`);

    // Try representations endpoint
    console.log('=== Test: Spend Documents v4 representations ===');
    const repUrl = `${baseUrl}/spend-documents/v4/receipts/${receiptId}/representations?type=display`;
    console.log(`URL: ${repUrl}`);
    const repRes = await fetch(repUrl, {
        headers: { ...headers, 'Accept': 'image/*, application/pdf' },
    });
    console.log(`Status: ${repRes.status}`);
    console.log(`Content-Type: ${repRes.headers.get('content-type')}`);
    if (repRes.ok) {
        const bytes = await repRes.arrayBuffer();
        console.log(`SUCCESS! Got ${bytes.byteLength} bytes`);
    } else {
        console.log(`Error: ${await repRes.text()}`);
    }

    // Also try the Receipts v4 API for comparison
    console.log('\n=== Test: Receipts v4 API (existing working API) ===');
    const r4Url = `${baseUrl}/receipts/v4/${receiptId}/image`;
    console.log(`URL: ${r4Url}`);
    const r4Res = await fetch(r4Url, { headers });
    console.log(`Status: ${r4Res.status}`);
    console.log(`Content-Type: ${r4Res.headers.get('content-type')}`);
    if (r4Res.ok) {
        const bytes = await r4Res.arrayBuffer();
        console.log(`SUCCESS! Got ${bytes.byteLength} bytes`);
    }
}

async function listEReceipts() {
    const token = await getAccessToken();
    const tokenData = parseJwt(token);
    const userId = tokenData.sub;
    console.log(`User ID: ${userId}\n`);

    const headers = {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
    };

    const res = await fetch(`${baseUrl}/receipts/v4/users/${userId}`, { headers });
    const data = await res.json();
    console.log('E-Receipts:');
    data.receipts?.slice(0, 5).forEach((r: any) => {
        console.log(`  ${r.id} - ${r.receipt?.merchant?.name} - ${r.receipt?.dateTime}`);
    });
    return data.receipts?.[0]?.id;
}

if (mode === 'list') {
    listEReceipts();
} else if (mode === 'ereceipt') {
    testEReceipt(testEntryId);
} else {
    testSpendDocuments(testEntryId);
}
