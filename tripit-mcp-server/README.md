# TripIt MCP Server

A Model Context Protocol (MCP) server for TripIt integration using SSE (Server-Sent Events) transport.

## Features

- List and view trip details from TripIt
- Get flight segments, hotel reservations, and activities
- SSE transport for real-time communication
- OAuth 1.0a authentication

## Prerequisites

- Node.js v18+
- TripIt API credentials (consumer key/secret)
- TripIt user access tokens (obtained via OAuth flow)

## Installation

```bash
npm install
npm run build
```

## Configuration

Create a `.env` file:

```env
# TripIt OAuth 1.0a Consumer Credentials
TRIPIT_API_KEY=your_consumer_key
TRIPIT_API_SECRET=your_consumer_secret

# TripIt User Access Tokens
TRIPIT_ACCESS_TOKEN=your_access_token
TRIPIT_ACCESS_TOKEN_SECRET=your_access_token_secret

# Server Port (optional)
PORT=3001
```

## Usage

### Start the Server

```bash
npm start
```

Server runs at `http://localhost:3001` with SSE endpoint at `/sse`.

### Configure MCP Client

For SSE-based MCP clients:

```json
{
  "mcpServers": {
    "tripit": {
      "url": "http://localhost:3001/sse"
    }
  }
}
```

### Available Tools

| Tool | Description |
|------|-------------|
| `list_trips` | List all trips (past and upcoming) |
| `list_upcoming_trips` | List only future trips |
| `list_past_trips` | List past trips with limit |
| `get_trip_details` | Get full trip details (flights, hotels, activities) |
| `get_trip_flights` | Get flight segments for a trip |
| `get_trip_hotels` | Get hotel reservations for a trip |
| `test_tripit_connection` | Test API connectivity |
| `get_tripit_api_guide` | Get usage guide |

### Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/sse` | GET | SSE connection for MCP |
| `/messages` | POST | Client-to-server messages |
| `/health` | GET | Health check |

## Development

```bash
npm run dev          # Watch mode for TypeScript
npm run test         # Run tests
npm run build        # Build for production
```

## Obtaining TripIt Tokens

TripIt uses OAuth 1.0a. You'll need to:

1. Register an app at https://www.tripit.com/developer
2. Get consumer key and secret
3. Implement OAuth flow to get user access tokens (see expense-reporter app for example)
# Trigger build
# trigger
