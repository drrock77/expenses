# MCP Server Deployment Guide

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   ContextForge Gateway                   │
│               192.168.2.58:${GATEWAY_PORT}               │
│                  (managed by Komodo)                     │
└─────────────────────┬───────────────────┬───────────────┘
                      │                   │
          ┌───────────▼───────┐ ┌─────────▼─────────┐
          │  concur-mcp-server│ │ tripit-mcp-server │
          │  (contextforge_net)│ │ (contextforge_net) │
          └───────────────────┘ └───────────────────┘
```

## Deployment Options

### Option A: Komodo Stack (Recommended for NUC)

Your MCP servers run in the same stack as ContextForge on your NUC.

### Option B: Local Docker Compose (Development)

Run locally for testing before deploying.

## Quick Start

### 1. Set Environment Variables

Create `.env` in the expenses root:

```bash
# Concur OAuth
CONCUR_ACCESS_TOKEN=your_token
CONCUR_REFRESH_TOKEN=your_refresh_token
CONCUR_CLIENT_ID=your_client_id
CONCUR_CLIENT_SECRET=your_client_secret

# TripIt OAuth
TRIPIT_API_KEY=your_consumer_key
TRIPIT_API_SECRET=your_consumer_secret
TRIPIT_ACCESS_TOKEN=your_access_token
TRIPIT_ACCESS_TOKEN_SECRET=your_access_token_secret

# ContextForge
CONTEXTFORGE_PASSWORD=your_admin_password
```

### 2. Run with Docker Compose

```bash
cd /Users/ihoffman/softdev/expenses

# Build and start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

### 3. Register Servers with ContextForge

After services are running, register the MCP servers:

```bash
# Get auth token
TOKEN=$(echo -n "admin:$CONTEXTFORGE_PASSWORD" | base64)

# Register Concur server
curl -X POST http://localhost:4444/gateways \
  -H "Authorization: Basic $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "concur", "url": "http://concur-mcp:3000/sse"}'

# Register TripIt server
curl -X POST http://localhost:4444/gateways \
  -H "Authorization: Basic $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "tripit", "url": "http://tripit-mcp:3001/sse"}'
```

### 4. Access Gateway

Open http://localhost:4444 and login with `admin` / your password.

## CI/CD Pipeline

GitHub Actions automatically builds and pushes images on:
- Push to `main` branch affecting `concur-mcp-server/**` or `tripit-mcp-server/**`
- Manual workflow dispatch

Images are pushed to:
- `ghcr.io/<username>/concur-mcp-server:latest`
- `ghcr.io/<username>/tripit-mcp-server:latest`

## Updating Deployments

### Pull Latest Images

```bash
docker-compose pull
docker-compose up -d
```

### Rebuild from Source

```bash
docker-compose build --no-cache
docker-compose up -d
```

## Individual Server Development

### Concur MCP Server

```bash
cd concur-mcp-server
npm install
npm run build
npm start  # stdio mode for local testing
```

### TripIt MCP Server

```bash
cd tripit-mcp-server
npm install
npm run build
node dist/index.js  # SSE mode, auto-OAuth if tokens missing
node dist/index.js --stdio  # stdio mode for MCP clients
```

## Connecting MCP Clients

### Claude Code

Add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "expenses": {
      "url": "http://localhost:4444/sse"
    }
  }
}
```

### MCP Inspector

```bash
npx @modelcontextprotocol/inspector --url http://localhost:4444/sse
```

## Komodo Deployment (NUC at 192.168.2.58)

### 1. Add MCP Servers to Existing Stack

Copy the service definitions from `contextforge-stack.yml` to your Komodo stack config:

```yaml
  concur-mcp:
    image: ghcr.io/ihoffman/concur-mcp-server:latest
    container_name: concur-mcp-server
    environment:
      CONCUR_BASE_URL: ${CONCUR_BASE_URL:-https://us.api.concursolutions.com}
      CONCUR_ACCESS_TOKEN: ${CONCUR_ACCESS_TOKEN}
      CONCUR_REFRESH_TOKEN: ${CONCUR_REFRESH_TOKEN}
      CONCUR_CLIENT_ID: ${CONCUR_CLIENT_ID}
      CONCUR_CLIENT_SECRET: ${CONCUR_CLIENT_SECRET}
    restart: unless-stopped
    networks: [contextforge_net]

  tripit-mcp:
    image: ghcr.io/ihoffman/tripit-mcp-server:latest
    container_name: tripit-mcp-server
    environment:
      TRIPIT_API_KEY: ${TRIPIT_API_KEY}
      TRIPIT_API_SECRET: ${TRIPIT_API_SECRET}
      TRIPIT_ACCESS_TOKEN: ${TRIPIT_ACCESS_TOKEN}
      TRIPIT_ACCESS_TOKEN_SECRET: ${TRIPIT_ACCESS_TOKEN_SECRET}
      PORT: "3001"
    restart: unless-stopped
    networks: [contextforge_net]
```

### 2. Add Environment Variables in Komodo

Add these to your stack's environment in Komodo UI:

```
CONCUR_ACCESS_TOKEN=xxx
CONCUR_REFRESH_TOKEN=xxx
CONCUR_CLIENT_ID=xxx
CONCUR_CLIENT_SECRET=xxx
TRIPIT_API_KEY=xxx
TRIPIT_API_SECRET=xxx
TRIPIT_ACCESS_TOKEN=xxx
TRIPIT_ACCESS_TOKEN_SECRET=xxx
```

### 3. Configure GitHub Secrets for Auto-Deploy

In your GitHub repo settings, add:

| Secret | Value |
|--------|-------|
| `KOMODO_URL` | `http://192.168.2.58:9120` (your Komodo URL) |
| `KOMODO_API_KEY` | From Komodo API settings |
| `KOMODO_API_SECRET` | From Komodo API settings |

### 4. Alternative: Komodo Webhook

Instead of API calls, configure a webhook in Komodo:

1. Go to Stack → contextforge → Webhooks
2. Create webhook for "Deploy" action
3. Copy webhook URL
4. Add to GitHub repo as `KOMODO_WEBHOOK_URL` secret
5. Update workflow to call webhook instead

### 5. Register MCP Servers with ContextForge

After stack deploys, register the servers with ContextForge gateway:

```bash
# On your NUC or via API
TOKEN=$(echo -n "admin:$PLATFORM_ADMIN_PASSWORD" | base64)

curl -X POST http://192.168.2.58:${GATEWAY_PORT}/gateways \
  -H "Authorization: Basic $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "concur", "url": "http://concur-mcp:3000/sse"}'

curl -X POST http://192.168.2.58:${GATEWAY_PORT}/gateways \
  -H "Authorization: Basic $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "tripit", "url": "http://tripit-mcp:3001/sse"}'
```

Note: Use Docker service names (`concur-mcp`, `tripit-mcp`) since they're on the same network.

## Dev Workflow

```
┌──────────────┐    push    ┌─────────────────┐   build    ┌──────────┐
│ Local Dev    │ ────────▶  │ GitHub Actions  │ ────────▶  │  GHCR    │
│ (edit code)  │            │ (CI/CD)         │            │ (images) │
└──────────────┘            └────────┬────────┘            └────┬─────┘
                                     │                          │
                                     │ trigger                  │ pull
                                     ▼                          ▼
                            ┌─────────────────┐         ┌──────────────┐
                            │ Komodo (NUC)    │ ◀────── │ Stack Deploy │
                            │ 192.168.2.58    │         │ (auto)       │
                            └─────────────────┘         └──────────────┘
```

1. Edit code locally in `concur-mcp-server/` or `tripit-mcp-server/`
2. Push to `main` branch
3. GitHub Actions builds Docker images → pushes to GHCR
4. Actions triggers Komodo to redeploy stack
5. Komodo pulls new images and restarts containers

## Troubleshooting

### Check Server Health

```bash
curl http://192.168.2.58:3000/health  # Concur (if exposed)
curl http://192.168.2.58:3001/health  # TripIt (if exposed)
curl http://192.168.2.58:${GATEWAY_PORT}/health  # ContextForge
```

### View Container Logs (Komodo)

Use Komodo UI → Stack → Logs, or SSH to NUC:

```bash
docker logs concur-mcp-server
docker logs tripit-mcp-server
docker logs contextforge-gateway
```

### Token Refresh Issues

- Concur: Server auto-refreshes on 401 if refresh token provided
- TripIt: Run locally without `--stdio` first to complete OAuth, then copy tokens to Komodo env

### Force Pull New Images

In Komodo, use "Pull" action on the stack, or:

```bash
docker-compose pull
docker-compose up -d
```
