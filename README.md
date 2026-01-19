# Expenses Monorepo

Personal expense management tools: web app + MCP servers for Concur and TripIt integration.

## Projects

| Directory | Description |
|-----------|-------------|
| `expense-reporter/` | Next.js app for expense report management |
| `concur-mcp-server/` | MCP server for SAP Concur API |
| `tripit-mcp-server/` | MCP server for TripIt travel data |

## Quick Start

### Local Development

```bash
# Expense Reporter (Next.js)
cd expense-reporter && npm install && npm run dev

# Concur MCP Server
cd concur-mcp-server && npm install && npm run build && npm start

# TripIt MCP Server
cd tripit-mcp-server && npm install && npm run build && node dist/index.js
```

### Docker (All Services)

```bash
docker-compose up -d
```

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for ContextForge gateway and Komodo stack setup.

## MCP Server Tools

### Concur (22 tools)
- Expense reports: list, create, submit
- Expenses: list, create, update, delete
- Card charges, attendees, receipts
- Auto token refresh on 401

### TripIt (8 tools)
- Trips: list, details, upcoming, past
- Flights, hotels, activities
- Auto OAuth flow on first run
