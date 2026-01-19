import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const baseUrl = 'https://us2.api.concursolutions.com';
const clientId = process.env.CONCUR_CLIENT_ID!;
const clientSecret = process.env.CONCUR_CLIENT_SECRET!;
const refreshToken = process.env.CONCUR_REFRESH_TOKEN!;

const reportId = process.argv[2];

if (!reportId) {
    console.error('Usage: npx ts-node scripts/test-report-image.ts <reportId>');
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

async function testReportImage(reportId: string) {
    const token = await getAccessToken();
    console.log('Got access token\n');

    const headers = {
        'Authorization': `Bearer ${token}`,
    };

    // Test: Image v1 at REPORT level (not entry level)
    console.log('=== Image v1 API at REPORT level ===');
    const reportImgUrl = `${baseUrl}/api/image/v1.0/report/${reportId}`;
    console.log(`URL: ${reportImgUrl}`);

    // First try XML to get metadata
    const metaRes = await fetch(reportImgUrl, {
        headers: { ...headers, 'Accept': 'application/xml' },
    });
    console.log(`Metadata Status: ${metaRes.status}`);
    const metaText = await metaRes.text();
    console.log(`Metadata Response:\n${metaText}\n`);

    // Extract the URL from metadata
    const urlMatch = metaText.match(/<Url>([^<]*)<\/Url>/);
    if (urlMatch) {
        console.log('=== Trying to download from URL ===');
        console.log(`Download URL: ${urlMatch[1]}`);

        const dlRes = await fetch(urlMatch[1], { headers });
        console.log(`Download Status: ${dlRes.status}`);
        console.log(`Content-Type: ${dlRes.headers.get('content-type')}`);
        console.log(`Content-Length: ${dlRes.headers.get('content-length')}`);

        if (dlRes.ok) {
            const bytes = await dlRes.arrayBuffer();
            console.log(`SUCCESS! Got ${bytes.byteLength} bytes`);

            // Save to file
            const outputPath = `/tmp/report-${reportId}.pdf`;
            fs.writeFileSync(outputPath, Buffer.from(bytes));
            console.log(`Saved to: ${outputPath}`);
        } else {
            const errorText = await dlRes.text();
            console.log(`Error: ${errorText.substring(0, 500)}`);
        }
    }

    // Also try direct PDF request
    console.log('\n=== Direct PDF Request ===');
    const pdfRes = await fetch(reportImgUrl, {
        headers: { ...headers, 'Accept': 'application/pdf' },
    });
    console.log(`Status: ${pdfRes.status}`);
    console.log(`Content-Type: ${pdfRes.headers.get('content-type')}`);
    if (pdfRes.ok && pdfRes.headers.get('content-type')?.includes('pdf')) {
        const bytes = await pdfRes.arrayBuffer();
        console.log(`SUCCESS! Got ${bytes.byteLength} bytes`);
    }
}

testReportImage(reportId);
