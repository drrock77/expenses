import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const baseUrl = 'https://us2.api.concursolutions.com';
const clientId = process.env.CONCUR_CLIENT_ID!;
const clientSecret = process.env.CONCUR_CLIENT_SECRET!;
const refreshToken = process.env.CONCUR_REFRESH_TOKEN!;

// Test expense entry ID (replace with actual)
const testEntryId = process.argv[2];

if (!testEntryId) {
    console.error('Usage: npx ts-node scripts/test-image-download.ts <entryId>');
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

async function testImageApis(entryId: string) {
    const token = await getAccessToken();
    console.log('Got access token\n');

    const headers = {
        'Authorization': `Bearer ${token}`,
    };

    // Test 1: Image v1 metadata (XML)
    console.log('=== Test 1: Image v1 Metadata ===');
    try {
        const res = await fetch(`${baseUrl}/api/image/v1.0/expenseentry/${entryId}`, {
            headers: { ...headers, 'Accept': 'application/xml' },
        });
        const text = await res.text();
        console.log(`Status: ${res.status}`);
        console.log(`Response: ${text.substring(0, 500)}\n`);

        // Extract ID and URL
        const idMatch = text.match(/<Id>([^<]*)<\/Id>/);
        const urlMatch = text.match(/<Url>([^<]*)<\/Url>/);
        if (idMatch) console.log(`Image ID: ${idMatch[1]}`);
        if (urlMatch) console.log(`Image URL: ${urlMatch[1]}\n`);

        const imageId = idMatch?.[1];

        // Test 2: Image v1 direct (try to get bytes)
        console.log('=== Test 2: Image v1 Direct Download ===');
        const directRes = await fetch(`${baseUrl}/api/image/v1.0/expenseentry/${entryId}`, {
            headers: { ...headers, 'Accept': 'image/*, application/pdf' },
        });
        console.log(`Status: ${directRes.status}`);
        console.log(`Content-Type: ${directRes.headers.get('content-type')}`);
        console.log(`Content-Length: ${directRes.headers.get('content-length')}\n`);

        // Test 3: Image v3 API
        if (imageId) {
            console.log('=== Test 3: Image v3 API ===');
            const v3Res = await fetch(`${baseUrl}/api/v3.0/expense/receiptimages/${imageId}`, {
                headers: { ...headers, 'Accept': 'application/json' },
            });
            console.log(`Status: ${v3Res.status}`);
            const v3Text = await v3Res.text();
            console.log(`Response: ${v3Text.substring(0, 500)}\n`);
        }

        // Test 4: Try fetching the URL directly with token
        if (urlMatch) {
            console.log('=== Test 4: Direct URL Fetch ===');
            const urlRes = await fetch(urlMatch[1], { headers });
            console.log(`Status: ${urlRes.status}`);
            console.log(`Content-Type: ${urlRes.headers.get('content-type')}\n`);
        }

    } catch (error) {
        console.error('Error:', error);
    }

    // Test 5: Spend Documents v4 API
    console.log('=== Test 5: Spend Documents v4 API ===');
    try {
        const spendRes = await fetch(`${baseUrl}/spend-documents/v4/receipts?entryId=${entryId}`, {
            headers: { ...headers, 'Accept': 'application/json' },
        });
        console.log(`Status: ${spendRes.status}`);
        const spendText = await spendRes.text();
        console.log(`Response: ${spendText.substring(0, 500)}\n`);
    } catch (error) {
        console.error('Spend Documents error:', error);
    }
}

testImageApis(testEntryId);
