import http from 'http';
import { URL } from 'url';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load .env
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '../.env');
dotenv.config({ path: envPath });

const clientId = process.env.CONCUR_CLIENT_ID;
const clientSecret = process.env.CONCUR_CLIENT_SECRET;
const redirectUri = 'http://localhost:3000/api/concur/callback';
const scope = "openid expense.report.readwrite expense.report.read receipts.read identity.user.core.read user.read EXPRPT";

if (!clientId || !clientSecret) {
    console.error('Error: CONCUR_CLIENT_ID and CONCUR_CLIENT_SECRET must be set in .env');
    process.exit(1);
}

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '', `http://${req.headers.host}`);

    if (url.pathname === '/api/concur/callback') {
        const code = url.searchParams.get('code');
        const error = url.searchParams.get('error');

        if (error) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(`<h1>Error</h1><p>${error}</p>`);
            console.error('Error from Concur:', error);
            server.close();
            return;
        }

        if (code) {
            try {
                console.log('Received code, exchanging for token...');
                const tokenResponse = await fetch('https://us.api.concursolutions.com/oauth2/v0/token', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: new URLSearchParams({
                        client_id: clientId,
                        client_secret: clientSecret,
                        grant_type: 'authorization_code',
                        redirect_uri: redirectUri,
                        code: code,
                    }),
                });

                const data = await tokenResponse.json();

                if (tokenResponse.ok) {
                    res.writeHead(200, { 'Content-Type': 'text/html' });
                    res.end(`<h1>Success!</h1><p>Access Token received. Check your terminal.</p>`);

                    console.log('\n✅ Access Token Received:\n');
                    console.log(data.access_token);
                    console.log('\nRefresh Token:\n');
                    console.log(data.refresh_token);
                    console.log('\n👉 Please update your .env file with:');
                    console.log(`CONCUR_ACCESS_TOKEN=${data.access_token}`);

                    server.close();
                    process.exit(0);
                } else {
                    res.writeHead(400, { 'Content-Type': 'text/html' });
                    res.end(`<h1>Error exchanging token</h1><p>${JSON.stringify(data)}</p>`);
                    console.error('Error exchanging token:', data);
                    server.close();
                    process.exit(1);
                }
            } catch (err) {
                res.writeHead(500, { 'Content-Type': 'text/html' });
                res.end(`<h1>Server Error</h1><p>${err}</p>`);
                console.error('Server error:', err);
                server.close();
                process.exit(1);
            }
        }
    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

server.listen(3000, () => {
    const authUrl = `https://us2.api.concursolutions.com/oauth2/v0/authorize?client_id=${clientId}&response_type=code&scope=${encodeURIComponent(scope)}&redirect_uri=${encodeURIComponent(redirectUri)}`;

    console.log('Server listening on http://localhost:3000');
    console.log('\n👉 Please open the following URL in your browser to log in:');
    console.log(`\n${authUrl}\n`);
});
