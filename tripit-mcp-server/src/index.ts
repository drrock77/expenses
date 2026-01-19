#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import express, { Request, Response } from "express";
import { z } from "zod";
import { TripItService } from "./tripit-service.js";
import { performOAuthFlow, saveTokensToEnv } from "./tripit-oauth.js";
import dotenv from "dotenv";

import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, "../.env");

dotenv.config({ path: envPath });

const PORT = parseInt(process.env.PORT || "3001", 10);
const USE_STDIO = process.argv.includes("--stdio");

let consumerKey = process.env.TRIPIT_API_KEY;
let consumerSecret = process.env.TRIPIT_API_SECRET;
let accessToken = process.env.TRIPIT_ACCESS_TOKEN;
let accessTokenSecret = process.env.TRIPIT_ACCESS_TOKEN_SECRET;

let tripitService: TripItService;

async function initializeTripItService(): Promise<void> {
    if (!consumerKey || !consumerSecret) {
        console.error("Error: TRIPIT_API_KEY and TRIPIT_API_SECRET are required in .env");
        process.exit(1);
    }

    if (!accessToken || !accessTokenSecret) {
        if (USE_STDIO) {
            console.error("Error: TRIPIT_ACCESS_TOKEN and TRIPIT_ACCESS_TOKEN_SECRET are required.");
            console.error("Run the server without --stdio first to complete OAuth setup.");
            process.exit(1);
        }

        const tokens = await performOAuthFlow(consumerKey, consumerSecret);
        accessToken = tokens.accessToken;
        accessTokenSecret = tokens.accessTokenSecret;

        saveTokensToEnv(envPath, accessToken, accessTokenSecret);
    }

    tripitService = new TripItService({
        accessToken,
        accessTokenSecret,
        consumerKey,
        consumerSecret,
    });
}

const formatError = (error: unknown) => {
    if (error instanceof Error) {
        return `Error: ${error.message}`;
    }
    return `Unknown error: ${String(error)}`;
};

function createServer(): McpServer {
    const server = new McpServer({
        name: "tripit-mcp-server",
        version: "0.1.0",
    });

    // Tool: list_trips
    server.tool(
        "list_trips",
        "List all trips from TripIt (past and upcoming)",
        {
            includePast: z.boolean().optional().describe("Include past trips (default: true)"),
        },
        async ({ includePast }) => {
            try {
                const trips = await tripitService.getTrips(includePast ?? true);
                return {
                    content: [{ type: "text", text: JSON.stringify(trips, null, 2) }],
                };
            } catch (error) {
                return {
                    content: [{ type: "text", text: formatError(error) }],
                    isError: true,
                };
            }
        }
    );

    // Tool: get_trip_details
    server.tool(
        "get_trip_details",
        "Get detailed information about a specific trip including flights, hotels, and activities",
        {
            tripId: z.string().describe("The TripIt trip ID"),
        },
        async ({ tripId }) => {
            try {
                const details = await tripitService.getTripDetails(tripId);
                return {
                    content: [{ type: "text", text: JSON.stringify(details, null, 2) }],
                };
            } catch (error) {
                return {
                    content: [{ type: "text", text: formatError(error) }],
                    isError: true,
                };
            }
        }
    );

    // Tool: list_upcoming_trips
    server.tool(
        "list_upcoming_trips",
        "List only upcoming (future) trips",
        {},
        async () => {
            try {
                const trips = await tripitService.getUpcomingTrips();
                return {
                    content: [{ type: "text", text: JSON.stringify(trips, null, 2) }],
                };
            } catch (error) {
                return {
                    content: [{ type: "text", text: formatError(error) }],
                    isError: true,
                };
            }
        }
    );

    // Tool: list_past_trips
    server.tool(
        "list_past_trips",
        "List past trips (most recent first)",
        {
            limit: z.number().optional().describe("Maximum number of trips to return (default: 10)"),
        },
        async ({ limit }) => {
            try {
                const trips = await tripitService.getPastTrips(limit ?? 10);
                return {
                    content: [{ type: "text", text: JSON.stringify(trips, null, 2) }],
                };
            } catch (error) {
                return {
                    content: [{ type: "text", text: formatError(error) }],
                    isError: true,
                };
            }
        }
    );

    // Tool: get_trip_flights
    server.tool(
        "get_trip_flights",
        "Get flight segments for a specific trip",
        {
            tripId: z.string().describe("The TripIt trip ID"),
        },
        async ({ tripId }) => {
            try {
                const details = await tripitService.getTripDetails(tripId);
                return {
                    content: [{ type: "text", text: JSON.stringify({ flights: details.flights }, null, 2) }],
                };
            } catch (error) {
                return {
                    content: [{ type: "text", text: formatError(error) }],
                    isError: true,
                };
            }
        }
    );

    // Tool: get_trip_hotels
    server.tool(
        "get_trip_hotels",
        "Get hotel reservations for a specific trip",
        {
            tripId: z.string().describe("The TripIt trip ID"),
        },
        async ({ tripId }) => {
            try {
                const details = await tripitService.getTripDetails(tripId);
                return {
                    content: [{ type: "text", text: JSON.stringify({ hotels: details.hotels }, null, 2) }],
                };
            } catch (error) {
                return {
                    content: [{ type: "text", text: formatError(error) }],
                    isError: true,
                };
            }
        }
    );

    // Tool: test_connection
    server.tool(
        "test_tripit_connection",
        "Test the connection to TripIt API",
        {},
        async () => {
            try {
                const trips = await tripitService.getTrips(false);
                return {
                    content: [{ type: "text", text: `Connection successful! Found ${trips.length} upcoming trips.` }],
                };
            } catch (error) {
                return {
                    content: [{ type: "text", text: `Connection failed: ${formatError(error)}` }],
                    isError: true,
                };
            }
        }
    );

    // Tool: get_tripit_api_guide
    server.tool(
        "get_tripit_api_guide",
        "Get a guide on how to use the TripIt API tools",
        {},
        async () => {
            return {
                content: [{
                    type: "text",
                    text: `
# TripIt MCP Server Guide

This server provides tools to interact with the TripIt API.

## Available Tools

### Trip Listing
- **list_trips**: List all trips (past and upcoming)
- **list_upcoming_trips**: List only future trips
- **list_past_trips**: List past trips with optional limit

### Trip Details
- **get_trip_details**: Get full trip details including flights, hotels, activities
- **get_trip_flights**: Get just the flight segments for a trip
- **get_trip_hotels**: Get just the hotel reservations for a trip

### Utility
- **test_tripit_connection**: Verify API connectivity

## Workflow Tips

1. Use \`list_past_trips\` to find recent business trips
2. Use \`get_trip_details\` to get dates/locations for expense reports
3. Match trip dates with card charges to categorize expenses
`
                }],
            };
        }
    );

    return server;
}

async function runStdioServer() {
    const server = createServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
}

async function runHttpServer() {
    const app = express();
    app.use(express.json());

    const transports = new Map<string, SSEServerTransport>();

    app.get("/sse", async (req: Request, res: Response) => {
        console.log("New SSE connection");

        const transport = new SSEServerTransport("/messages", res);
        transports.set(transport.sessionId, transport);

        const server = createServer();

        res.on("close", () => {
            console.log(`SSE connection closed: ${transport.sessionId}`);
            transports.delete(transport.sessionId);
        });

        await server.connect(transport);
    });

    app.post("/messages", async (req: Request, res: Response) => {
        const sessionId = req.query.sessionId as string;
        const transport = transports.get(sessionId);

        if (!transport) {
            res.status(400).json({ error: "No active session" });
            return;
        }

        await transport.handlePostMessage(req, res, req.body);
    });

    app.get("/health", (req: Request, res: Response) => {
        res.json({ status: "ok", service: "tripit-mcp-server" });
    });

    app.listen(PORT, () => {
        console.log(`TripIt MCP Server running on http://localhost:${PORT}`);
        console.log(`SSE endpoint: http://localhost:${PORT}/sse`);
    });
}

async function main() {
    await initializeTripItService();

    if (USE_STDIO) {
        await runStdioServer();
    } else {
        await runHttpServer();
    }
}

main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
});
