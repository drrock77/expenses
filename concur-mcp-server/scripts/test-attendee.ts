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

async function main() {
    try {
        const token = await getAccessToken();
        const tokenData = parseJwt(token);
        const userId = tokenData.sub;
        console.log(`User ID: ${userId}`);

        const headers = {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json',
        };

        // List reports using v3 API
        console.log('\n=== Listing Reports (v3 API) ===');
        const reportsRes = await fetch(
            `${baseUrl}/api/v3.0/expense/reports?limit=100`,
            { headers }
        );
        console.log(`Reports status: ${reportsRes.status}`);
        const reportsData = await reportsRes.json();
        console.log(`Found ${reportsData.Items?.length || 0} reports`);

        // Use v4 reports endpoint with user context (this works)
        console.log('\n=== Listing Reports (v4 API with user context) ===');
        const v4ReportsRes = await fetch(
            `${baseUrl}/expensereports/v4/users/${userId}/context/TRAVELER/reports?start=0&limit=50`,
            { headers }
        );
        console.log(`v4 Reports status: ${v4ReportsRes.status}`);
        if (v4ReportsRes.ok) {
            const v4ReportsData = await v4ReportsRes.json();
            console.log(`Found ${v4ReportsData.reports?.length || 0} v4 reports`);
            for (const r of (v4ReportsData.reports || []).slice(0, 20)) {
                console.log(`  - ${r.name} (${r.reportId}) - ${r.approvalStatus}`);
            }
        } else {
            console.log(`v4 error: ${await v4ReportsRes.text()}`);
        }

        // Search entries for the amount
        console.log('\n=== Searching entries for $109.94 ===');
        const entriesRes = await fetch(
            `${baseUrl}/api/v3.0/expense/entries?limit=500`,
            { headers }
        );
        const entriesData = await entriesRes.json();
        console.log(`Total entries: ${entriesData.Items?.length || 0}`);
        const matchingEntries = (entriesData.Items || []).filter((e: any) =>
            Math.abs((e.TransactionAmount || 0) - 109.94) < 0.01 ||
            (e.VendorDescription || '').toLowerCase().includes('occidental')
        );
        console.log(`Found ${matchingEntries.length} matching entries`);
        for (const entry of matchingEntries) {
            console.log(`  Entry: ${entry.VendorDescription} $${entry.TransactionAmount} (Report: ${entry.ReportID}, Entry: ${entry.ID})`);
        }

        // Sort by most recent first
        const sortedReports = (reportsData.Items || []).sort((a: any, b: any) => {
            return new Date(b.CreateDate || b.SubmitDate || 0).getTime() - new Date(a.CreateDate || a.SubmitDate || 0).getTime();
        });
        console.log(`Most recent: ${sortedReports[0]?.Name} (${sortedReports[0]?.CreateDate})`);

        // Find Occidental Cigar in first few reports
        for (const report of sortedReports.slice(0, 20)) {
            console.log(`\nChecking report: ${report.Name} (${report.ID})`);

            // Use v4 API to get expenses (v3 entry IDs won't work with v4 attendee API)
            const expensesRes = await fetch(
                `${baseUrl}/expensereports/v4/users/${userId}/context/TRAVELER/reports/${report.ID}/expenses`,
                { headers }
            );

            if (!expensesRes.ok) {
                console.log(`  Failed to get expenses: ${expensesRes.status}`);
                continue;
            }

            const expensesData = await expensesRes.json();

            for (const expense of expensesData.expenses || []) {
                const vendor = expense.vendor?.name || expense.vendor?.description || 'Unknown';
                const amount = expense.transactionAmount?.value;

                console.log(`  - ${vendor}: $${amount}`);

                if (vendor.toLowerCase().includes('occidental') || Math.abs(amount - 109.94) < 0.01) {
                    console.log(`\n*** FOUND Occidental Cigar ***`);
                    console.log(`  Vendor: ${vendor}`);
                    console.log(`  Amount: ${amount}`);
                    console.log(`  Expense ID: ${expense.expenseId}`);
                    console.log(`  Report ID: ${report.ID}`);
                    console.log(`  Expense Type: ${expense.expenseType?.name}`);
                    console.log(`  Currency: ${expense.transactionAmount?.currencyCode}`);

                    // Now try to add attendee
                    await addAttendee(token, userId, report.ID, expense);
                    return;
                }
            }
        }

        console.log('\nOccidental Cigar expense not found in first 20 reports');
    } catch (e) {
        console.error('Error:', e);
    }
}

async function addAttendee(token: string, userId: string, reportId: string, expense: any) {
    const headers = {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
    };

    // Search for Ryan Kosai
    console.log('\n=== Searching for Ryan Kosai ===');
    const searchRes = await fetch(
        `${baseUrl}/v4/attendees?attendeeTypeCode=BUSGUEST&limit=100`,
        { headers }
    );
    const searchData = await searchRes.json();
    console.log(`Found ${searchData.attendees?.length || 0} attendees`);

    const ryan = (searchData.attendees || []).find((a: any) => {
        const name = `${a.firstName || ''} ${a.lastName || ''}`.toLowerCase();
        return name.includes('ryan') && name.includes('kosai');
    });

    if (!ryan) {
        console.log('Ryan Kosai not found. Available:');
        (searchData.attendees || []).slice(0, 10).forEach((a: any) => {
            console.log(`  ${a.firstName} ${a.lastName}`);
        });
        return;
    }

    console.log(`Found: ${ryan.firstName} ${ryan.lastName} (${ryan.attendeeId})`);

    // Get current attendees first
    console.log('\n=== Current Attendees ===');
    const currentRes = await fetch(
        `${baseUrl}/expensereports/v4/users/${userId}/context/TRAVELER/reports/${reportId}/expenses/${expense.expenseId}/attendees`,
        { headers }
    );
    console.log(`Current attendees status: ${currentRes.status}`);
    const currentData = await currentRes.json();
    console.log(`Current attendees: ${JSON.stringify(currentData, null, 2)}`);

    // Add Ryan as attendee with half the amount
    const halfAmount = expense.transactionAmount.value / 2;
    console.log(`\n=== Adding Ryan with amount ${halfAmount} ===`);

    const body = {
        expenseAttendeeList: [{
            attendeeId: ryan.attendeeId,
            transactionAmount: {
                value: halfAmount,
                currencyCode: expense.transactionAmount.currencyCode,
            },
        }],
    };

    const url = `${baseUrl}/expensereports/v4/users/${userId}/context/TRAVELER/reports/${reportId}/expenses/${expense.expenseId}/attendees`;
    console.log(`URL: ${url}`);
    console.log(`Body: ${JSON.stringify(body, null, 2)}`);

    const addRes = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
    });

    console.log(`Add status: ${addRes.status}`);
    const addText = await addRes.text();
    console.log(`Response: ${addText}`);
}

main();
