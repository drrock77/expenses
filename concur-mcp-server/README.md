# Concur MCP Server

A Model Context Protocol (MCP) server for integrating with SAP Concur Expense API v3.0.

## Features

- List and manage expense reports
- List and manage expense entries
- Automatic token refresh on 401 errors
- Detailed error messages with Concur API error codes

## Prerequisites

- Node.js v18+
- SAP Concur API credentials (one of the following):
  - Access Token (short-lived)
  - Refresh Token + Client ID/Secret (recommended for long-running use)
  - Client ID/Secret only (client credentials flow)

## Installation

```bash
npm install
npm run build
```

## Configuration

Create a `.env` file or set environment variables:

```env
# Option 1: Access token only (expires, no auto-refresh)
CONCUR_ACCESS_TOKEN=your_access_token

# Option 2: Refresh token with client credentials (recommended)
CONCUR_REFRESH_TOKEN=your_refresh_token
CONCUR_CLIENT_ID=your_client_id
CONCUR_CLIENT_SECRET=your_client_secret

# Option 3: Client credentials only (client_credentials grant)
CONCUR_CLIENT_ID=your_client_id
CONCUR_CLIENT_SECRET=your_client_secret
```

**Recommended**: Use Option 2 with refresh token for automatic token renewal when the access token expires.

## Usage

### Running with an MCP Client

Configure your MCP client (Claude Desktop, Cursor, etc.):

```json
{
  "mcpServers": {
    "concur": {
      "command": "node",
      "args": ["/path/to/concur-mcp-server/dist/index.js"],
      "env": {
        "CONCUR_ACCESS_TOKEN": "...",
        "CONCUR_REFRESH_TOKEN": "...",
        "CONCUR_CLIENT_ID": "...",
        "CONCUR_CLIENT_SECRET": "..."
      }
    }
  }
}
```

### Available Tools

| Tool | Description |
|------|-------------|
| `list_concur_reports` | List all expense reports |
| `get_concur_report_details` | Get details for a specific report |
| `create_concur_report` | Create a new expense report |
| `list_concur_expenses` | List expenses (optionally by report ID) |
| `get_concur_expense_details` | Get details for a specific expense |
| `create_concur_expense` | Create a new expense entry |
| `update_concur_expense` | Update an existing expense |
| `delete_concur_expense` | Delete an expense entry |
| `get_concur_expense_types` | Get available expense type codes |
| `get_concur_payment_types` | Get available payment type codes |
| `test_concur_connection` | Test API connectivity |
| `get_concur_api_guide` | Get usage guide for tools |

## Development

```bash
npm run dev          # Watch mode for TypeScript
npm run test         # Run tests
npm run test:watch   # Watch mode for tests
npm run build        # Build for production
```

## Testing

Tests use Vitest with mocked fetch calls:

```bash
npm test
```
# Trigger build
