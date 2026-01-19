import 'dotenv/config';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '../.env');
dotenv.config({ path: envPath });

async function debugToken() {
    const accessToken = process.env.CONCUR_ACCESS_TOKEN;
    if (!accessToken) {
        console.error("No CONCUR_ACCESS_TOKEN found in .env");
        return;
    }

    console.log("Testing with Access Token:", accessToken.substring(0, 10) + "...");

    const baseUrl = "https://us2.api.concursolutions.com";

    // 1. Test User Profile (simplest read)
    console.log('\n1. Testing User Profile...');
    try {
        const userRes = await fetch(`${baseUrl}/api/v3.0/common/users?primary=true`, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: 'application/json'
            }
        });
        console.log(`Status: ${userRes.status} ${userRes.statusText}`);
        if (!userRes.ok) {
            console.log('Body:', await userRes.text());
        } else {
            console.log('Success!');
            const data = await userRes.json();
            console.log('User ID:', data.Items?.[0]?.ID || 'Unknown');
        }
    } catch (e) {
        console.error("User Profile Error:", e);
    }

    // 2. Test Reports (minimal params)
    console.log('\n2. Testing Reports (limit=100)...');
    try {
        const reportRes = await fetch(`${baseUrl}/api/v3.0/expense/reports?limit=100`, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: 'application/json'
            }
        });
        console.log(`Status: ${reportRes.status} ${reportRes.statusText}`);
        if (!reportRes.ok) {
            console.log('Body:', await reportRes.text());
        } else {
            console.log('Success!');
            const data = await reportRes.json();
            console.log('Reports found:', data.Items?.length || 0);
        }
    } catch (e) {
        console.error("Reports Error:", e);
    }
}

debugToken();
