import OAuth from 'oauth-1.0a';
import crypto from 'crypto';
import http from 'http';
import { URL } from 'url';
import fs from 'fs';
import path from 'path';

const TRIPIT_REQUEST_TOKEN_URL = 'https://api.tripit.com/oauth/request_token';
const TRIPIT_AUTHORIZE_URL = 'https://www.tripit.com/oauth/authorize';
const TRIPIT_ACCESS_TOKEN_URL = 'https://api.tripit.com/oauth/access_token';
const CALLBACK_PORT = 9876;
const CALLBACK_URL = `http://localhost:${CALLBACK_PORT}/callback`;

export interface OAuthTokens {
    accessToken: string;
    accessTokenSecret: string;
}

export async function performOAuthFlow(
    consumerKey: string,
    consumerSecret: string
): Promise<OAuthTokens> {
    const oauth = new OAuth({
        consumer: { key: consumerKey, secret: consumerSecret },
        signature_method: 'HMAC-SHA1',
        hash_function(base_string, key) {
            return crypto.createHmac('sha1', key).update(base_string).digest('base64');
        },
    });

    console.log('\n=== TripIt OAuth Setup ===\n');
    console.log('Access tokens not found. Starting OAuth flow...\n');

    const requestTokenData = await getRequestToken(oauth);
    const authUrl = `${TRIPIT_AUTHORIZE_URL}?oauth_token=${requestTokenData.oauth_token}&oauth_callback=${encodeURIComponent(CALLBACK_URL)}`;

    console.log('Please open this URL in your browser to authorize:\n');
    console.log(`  ${authUrl}\n`);

    try {
        const { exec } = await import('child_process');
        exec(`open "${authUrl}"`);
        console.log('(Browser should open automatically)\n');
    } catch {
        console.log('(Could not open browser automatically)\n');
    }

    const callbackParams = await waitForCallback();

    const accessTokens = await getAccessToken(
        oauth,
        callbackParams.oauth_token,
        requestTokenData.oauth_token_secret
    );

    console.log('\n✓ OAuth complete! Tokens acquired.\n');

    return {
        accessToken: accessTokens.oauth_token,
        accessTokenSecret: accessTokens.oauth_token_secret,
    };
}

async function getRequestToken(oauth: OAuth): Promise<{ oauth_token: string; oauth_token_secret: string }> {
    const request_data = {
        url: TRIPIT_REQUEST_TOKEN_URL,
        method: 'POST',
    };

    const authHeader = oauth.toHeader(oauth.authorize(request_data));

    const response = await fetch(request_data.url, {
        method: 'POST',
        headers: { ...authHeader },
    });

    if (!response.ok) {
        throw new Error(`Failed to get request token: ${response.status} ${response.statusText}`);
    }

    const text = await response.text();
    const params = new URLSearchParams(text);

    return {
        oauth_token: params.get('oauth_token')!,
        oauth_token_secret: params.get('oauth_token_secret')!,
    };
}

function waitForCallback(): Promise<{ oauth_token: string; oauth_verifier?: string }> {
    return new Promise((resolve, reject) => {
        const server = http.createServer((req, res) => {
            const url = new URL(req.url!, `http://localhost:${CALLBACK_PORT}`);

            if (url.pathname === '/callback') {
                const oauth_token = url.searchParams.get('oauth_token');
                const oauth_verifier = url.searchParams.get('oauth_verifier');

                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(`
                    <html>
                        <body style="font-family: system-ui; padding: 40px; text-align: center;">
                            <h1>✓ TripIt Authorization Complete</h1>
                            <p>You can close this window and return to the terminal.</p>
                        </body>
                    </html>
                `);

                server.close();

                if (oauth_token) {
                    resolve({ oauth_token, oauth_verifier: oauth_verifier || undefined });
                } else {
                    reject(new Error('No oauth_token in callback'));
                }
            }
        });

        server.listen(CALLBACK_PORT, () => {
            console.log(`Waiting for OAuth callback on port ${CALLBACK_PORT}...`);
        });

        server.on('error', (err) => {
            reject(new Error(`Callback server error: ${err.message}`));
        });

        setTimeout(() => {
            server.close();
            reject(new Error('OAuth callback timeout (5 minutes)'));
        }, 5 * 60 * 1000);
    });
}

async function getAccessToken(
    oauth: OAuth,
    oauthToken: string,
    oauthTokenSecret: string
): Promise<{ oauth_token: string; oauth_token_secret: string }> {
    const request_data = {
        url: TRIPIT_ACCESS_TOKEN_URL,
        method: 'POST',
    };

    const token = {
        key: oauthToken,
        secret: oauthTokenSecret,
    };

    const authHeader = oauth.toHeader(oauth.authorize(request_data, token));

    const response = await fetch(request_data.url, {
        method: 'POST',
        headers: { ...authHeader },
    });

    if (!response.ok) {
        throw new Error(`Failed to get access token: ${response.status} ${response.statusText}`);
    }

    const text = await response.text();
    const params = new URLSearchParams(text);

    return {
        oauth_token: params.get('oauth_token')!,
        oauth_token_secret: params.get('oauth_token_secret')!,
    };
}

export function saveTokensToEnv(
    envPath: string,
    accessToken: string,
    accessTokenSecret: string
): void {
    let content = '';

    if (fs.existsSync(envPath)) {
        content = fs.readFileSync(envPath, 'utf-8');
    }

    const updateOrAdd = (key: string, value: string) => {
        const regex = new RegExp(`^${key}=.*$`, 'm');
        if (regex.test(content)) {
            content = content.replace(regex, `${key}=${value}`);
        } else {
            content = content.trim() + `\n${key}=${value}`;
        }
    };

    updateOrAdd('TRIPIT_ACCESS_TOKEN', accessToken);
    updateOrAdd('TRIPIT_ACCESS_TOKEN_SECRET', accessTokenSecret);

    fs.writeFileSync(envPath, content.trim() + '\n');
    console.log(`Tokens saved to ${envPath}`);
}
