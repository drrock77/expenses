#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import express, { Request, Response } from "express";
import { z } from "zod";
import { ConcurService } from "./concur-service.js";
import dotenv from "dotenv";

import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, "../.env");

dotenv.config({ path: envPath });

const PORT = parseInt(process.env.PORT || "3000", 10);
const USE_STDIO = process.argv.includes("--stdio");

const accessToken = process.env.CONCUR_ACCESS_TOKEN;
const refreshToken = process.env.CONCUR_REFRESH_TOKEN;
const clientId = process.env.CONCUR_CLIENT_ID;
const clientSecret = process.env.CONCUR_CLIENT_SECRET;

if (!accessToken && !refreshToken && (!clientId || !clientSecret)) {
    console.error("Error: At least one of CONCUR_ACCESS_TOKEN, CONCUR_REFRESH_TOKEN, or (CONCUR_CLIENT_ID and CONCUR_CLIENT_SECRET) is required.");
    process.exit(1);
}

const concurService = new ConcurService({
    accessToken,
    refreshToken,
    clientId,
    clientSecret
});

function createServer(): McpServer {
    const server = new McpServer({
        name: "concur-mcp-server",
        version: "0.1.0",
    });

    const formatError = (error: unknown) => {
        if (error instanceof Error) {
            return `Error: ${error.message}`;
        }
        return `Unknown error: ${String(error)}`;
    };

    server.tool(
    "list_concur_reports",
    "List active Concur expense reports",
    {},
    async () => {
        try {
            const reports = await concurService.getReports();
            return {
                content: [{ type: "text", text: JSON.stringify(reports, null, 2) }],
            };
        } catch (error) {
            return {
                content: [{ type: "text", text: formatError(error) }],
                isError: true,
            };
        }
    }
);

// Tool: get_concur_report_details
server.tool(
    "get_concur_report_details",
    "Get details for a specific Concur expense report",
    {
        reportId: z.string().describe("The ID of the report to retrieve"),
    },
    async ({ reportId }) => {
        try {
            const report = await concurService.getReportDetails(reportId);
            return {
                content: [{ type: "text", text: JSON.stringify(report, null, 2) }],
            };
        } catch (error) {
            return {
                content: [{ type: "text", text: formatError(error) }],
                isError: true,
            };
        }
    }
);

// Tool: create_concur_report
server.tool(
    "create_concur_report",
    "Create a new Concur expense report",
    {
        name: z.string().describe("Name of the report"),
        purpose: z.string().describe("Business purpose of the report"),
        startDate: z.string().describe("Start date of the report (YYYY-MM-DD)"),
    },
    async ({ name, purpose, startDate }) => {
        try {
            const report = await concurService.createReport({ name, purpose, startDate });
            return {
                content: [{ type: "text", text: JSON.stringify(report, null, 2) }],
            };
        } catch (error) {
            return {
                content: [{ type: "text", text: formatError(error) }],
                isError: true,
            };
        }
    }
);

// Tool: list_concur_expenses
server.tool(
    "list_concur_expenses",
    "List Concur expenses (optionally filtered by report ID)",
    {
        reportId: z.string().optional().describe("Optional Report ID to filter expenses"),
    },
    async ({ reportId }) => {
        try {
            const expenses = await concurService.getExpenses(reportId);
            return {
                content: [{ type: "text", text: JSON.stringify(expenses, null, 2) }],
            };
        } catch (error) {
            return {
                content: [{ type: "text", text: formatError(error) }],
                isError: true,
            };
        }
    }
);

// Tool: get_concur_expense_details
server.tool(
    "get_concur_expense_details",
    "Get details for a specific Concur expense entry",
    {
        expenseId: z.string().describe("The ID of the expense entry"),
    },
    async ({ expenseId }) => {
        try {
            const expense = await concurService.getExpenseDetails(expenseId);
            return {
                content: [{ type: "text", text: JSON.stringify(expense, null, 2) }],
            };
        } catch (error) {
            return {
                content: [{ type: "text", text: formatError(error) }],
                isError: true,
            };
        }
    }
);

// Tool: create_concur_expense
server.tool(
    "create_concur_expense",
    "Create a new Concur expense entry",
    {
        transactionDate: z.string().describe("Date of the transaction (YYYY-MM-DD)"),
        expenseTypeCode: z.string().describe("Expense type code (e.g., AIRFR, MEALS)"),
        businessPurpose: z.string().describe("Business purpose of the expense"),
        vendorDescription: z.string().describe("Vendor description"),
        transactionAmount: z.number().describe("Amount of the transaction"),
        currencyCode: z.string().describe("Currency code (e.g., USD)"),
        reportId: z.string().optional().describe("Optional Report ID to assign the expense to"),
    },
    async (args) => {
        try {
            const expense = await concurService.createExpense(args);
            return {
                content: [{ type: "text", text: JSON.stringify(expense, null, 2) }],
            };
        } catch (error) {
            return {
                content: [{ type: "text", text: formatError(error) }],
                isError: true,
            };
        }
    }
);

// Tool: update_concur_expense
server.tool(
    "update_concur_expense",
    "Update an existing Concur expense entry",
    {
        expenseId: z.string().describe("The ID of the expense to update"),
        transactionDate: z.string().optional(),
        expenseTypeCode: z.string().optional(),
        businessPurpose: z.string().optional(),
        vendorDescription: z.string().optional(),
        transactionAmount: z.number().optional(),
        currencyCode: z.string().optional(),
        reportId: z.string().optional(),
    },
    async ({ expenseId, ...updates }) => {
        try {
            await concurService.updateExpense(expenseId, updates);
            return {
                content: [{ type: "text", text: `Expense ${expenseId} updated successfully.` }],
            };
        } catch (error) {
            return {
                content: [{ type: "text", text: formatError(error) }],
                isError: true,
            };
        }
    }
);

// Tool: delete_concur_expense
server.tool(
    "delete_concur_expense",
    "Delete a Concur expense entry",
    {
        expenseId: z.string().describe("The ID of the expense to delete"),
    },
    async ({ expenseId }) => {
        try {
            await concurService.deleteExpense(expenseId);
            return {
                content: [{ type: "text", text: `Expense ${expenseId} deleted successfully.` }],
            };
        } catch (error) {
            return {
                content: [{ type: "text", text: formatError(error) }],
                isError: true,
            };
        }
    }
);

// Tool: get_concur_expense_types
server.tool(
    "get_concur_expense_types",
    "Get available Concur expense types",
    {},
    async () => {
        try {
            const types = await concurService.getExpenseTypes();
            return {
                content: [{ type: "text", text: JSON.stringify(types, null, 2) }],
            };
        } catch (error) {
            return {
                content: [{ type: "text", text: formatError(error) }],
                isError: true,
            };
        }
    }
);

// Tool: get_concur_payment_types
server.tool(
    "get_concur_payment_types",
    "Get available Concur payment types",
    {},
    async () => {
        try {
            const types = await concurService.getPaymentTypes();
            return {
                content: [{ type: "text", text: JSON.stringify(types, null, 2) }],
            };
        } catch (error) {
            return {
                content: [{ type: "text", text: formatError(error) }],
                isError: true,
            };
        }
    }
);

// Tool: test_concur_connection
server.tool(
    "test_concur_connection",
    "Test the connection to the Concur API",
    {},
    async () => {
        try {
            // We use getReports as a connectivity test because getUserProfile might return 403 for some tokens
            const reports = await concurService.getReports();
            return {
                content: [{ type: "text", text: `Connection successful! Found ${reports.Items.length} reports.` }],
            };
        } catch (error) {
            return {
                content: [{ type: "text", text: `Connection failed: ${formatError(error)}` }],
                isError: true,
            };
        }
    }
);

// Tool: list_card_charges
server.tool(
    "list_card_charges",
    "List unassigned corporate card charges (transactions not yet added to a report)",
    {},
    async () => {
        try {
            const charges = await concurService.getCardCharges();
            return {
                content: [{ type: "text", text: JSON.stringify(charges, null, 2) }],
            };
        } catch (error) {
            return {
                content: [{ type: "text", text: formatError(error) }],
                isError: true,
            };
        }
    }
);

// Tool: get_expense_attendees
server.tool(
    "get_expense_attendees",
    "Get attendees associated with an expense entry",
    {
        entryId: z.string().describe("The ID of the expense entry"),
    },
    async ({ entryId }) => {
        try {
            const attendees = await concurService.getExpenseAttendees(entryId);
            return {
                content: [{ type: "text", text: JSON.stringify(attendees, null, 2) }],
            };
        } catch (error) {
            return {
                content: [{ type: "text", text: formatError(error) }],
                isError: true,
            };
        }
    }
);

// Tool: add_expense_attendee
server.tool(
    "add_expense_attendee",
    "Add an attendee to an expense entry (for meals, entertainment, etc.)",
    {
        entryId: z.string().describe("The ID of the expense entry"),
        attendeeId: z.string().describe("The ID of the attendee to add"),
        amount: z.number().optional().describe("Amount to allocate to this attendee"),
        associatedAttendeeCount: z.number().optional().describe("Number of additional unnamed attendees"),
    },
    async (args) => {
        try {
            const result = await concurService.addExpenseAttendee(args);
            return {
                content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            };
        } catch (error) {
            return {
                content: [{ type: "text", text: formatError(error) }],
                isError: true,
            };
        }
    }
);

// Tool: remove_expense_attendee
server.tool(
    "remove_expense_attendee",
    "Remove an attendee association from an expense entry",
    {
        associationId: z.string().describe("The ID of the attendee association to remove"),
    },
    async ({ associationId }) => {
        try {
            await concurService.removeExpenseAttendee(associationId);
            return {
                content: [{ type: "text", text: `Attendee association ${associationId} removed successfully.` }],
            };
        } catch (error) {
            return {
                content: [{ type: "text", text: formatError(error) }],
                isError: true,
            };
        }
    }
);

// Tool: search_attendees
server.tool(
    "search_attendees",
    "Search for existing attendees by name or company",
    {
        searchTerm: z.string().describe("Name or company to search for"),
    },
    async ({ searchTerm }) => {
        try {
            const attendees = await concurService.searchAttendees(searchTerm);
            return {
                content: [{ type: "text", text: JSON.stringify(attendees, null, 2) }],
            };
        } catch (error) {
            return {
                content: [{ type: "text", text: formatError(error) }],
                isError: true,
            };
        }
    }
);

// Tool: create_attendee
server.tool(
    "create_attendee",
    "Create a new attendee record",
    {
        firstName: z.string().describe("Attendee's first name"),
        lastName: z.string().describe("Attendee's last name"),
        company: z.string().optional().describe("Attendee's company"),
        title: z.string().optional().describe("Attendee's job title"),
    },
    async (args) => {
        try {
            const attendee = await concurService.createAttendee(args);
            return {
                content: [{ type: "text", text: JSON.stringify(attendee, null, 2) }],
            };
        } catch (error) {
            return {
                content: [{ type: "text", text: formatError(error) }],
                isError: true,
            };
        }
    }
);

// Tool: get_receipt_image_url
server.tool(
    "get_receipt_image_url",
    "Get the receipt image URL for an expense entry (URL valid for 15 minutes)",
    {
        entryId: z.string().describe("The ID of the expense entry"),
    },
    async ({ entryId }) => {
        try {
            const result = await concurService.getReceiptImageUrl(entryId);
            return {
                content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            };
        } catch (error) {
            return {
                content: [{ type: "text", text: formatError(error) }],
                isError: true,
            };
        }
    }
);

// Tool: list_report_receipts
server.tool(
    "list_report_receipts",
    "List all receipt images attached to an expense report",
    {
        reportId: z.string().describe("The ID of the expense report"),
    },
    async ({ reportId }) => {
        try {
            const result = await concurService.getReportReceiptImages(reportId);
            return {
                content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            };
        } catch (error) {
            return {
                content: [{ type: "text", text: formatError(error) }],
                isError: true,
            };
        }
    }
);

// Tool: upload_receipt
server.tool(
    "upload_receipt",
    "Upload a receipt image to an expense entry. Provide base64-encoded image data.",
    {
        entryId: z.string().describe("The ID of the expense entry"),
        imageBase64: z.string().describe("Base64-encoded image data"),
        contentType: z.enum(["application/pdf", "image/jpeg", "image/png"]).describe("MIME type of the image"),
    },
    async ({ entryId, imageBase64, contentType }) => {
        try {
            const imageBuffer = Buffer.from(imageBase64, 'base64');
            const result = await concurService.uploadReceiptToExpense(entryId, imageBuffer, contentType);
            return {
                content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            };
        } catch (error) {
            return {
                content: [{ type: "text", text: formatError(error) }],
                isError: true,
            };
        }
    }
);

// Tool: submit_report
server.tool(
    "submit_report",
    "Submit an expense report for approval",
    {
        reportId: z.string().describe("The ID of the expense report to submit"),
    },
    async ({ reportId }) => {
        try {
            const result = await concurService.submitReport(reportId);
            return {
                content: [{ type: "text", text: `Report ${reportId} submitted successfully.` }],
            };
        } catch (error) {
            return {
                content: [{ type: "text", text: formatError(error) }],
                isError: true,
            };
        }
    }
);

// Tool: get_concur_api_guide
server.tool(
    "get_concur_api_guide",
    "Get a guide on how to use the Concur API tools",
    {},
    async () => {
        return {
            content: [{
                type: "text",
                text: `
# Concur MCP Server Guide

This server provides tools to interact with the SAP Concur API.

## Available Tools

### Reports
- **list_concur_reports**: List active expense reports.
- **get_concur_report_details**: Get full details of a specific report.
- **create_concur_report**: Create a new expense report.
- **submit_report**: Submit a report for approval.

### Expenses
- **list_concur_expenses**: List expenses, optionally filtered by report.
- **get_concur_expense_details**: Get details of a specific expense.
- **create_concur_expense**: Create a new expense entry.
- **update_concur_expense**: Update an existing expense.
- **delete_concur_expense**: Delete an expense.

### Card Charges
- **list_card_charges**: List unassigned corporate card transactions.

### Receipts
- **get_receipt_image_url**: Get receipt image URL for an expense.
- **list_report_receipts**: List all receipts on a report.
- **upload_receipt**: Upload a receipt image to an expense.

### Attendees
- **search_attendees**: Search for existing attendees.
- **create_attendee**: Create a new attendee record.
- **get_expense_attendees**: Get attendees on an expense.
- **add_expense_attendee**: Add an attendee to an expense.
- **remove_expense_attendee**: Remove an attendee from an expense.

### Configuration
- **get_concur_expense_types**: List available expense types.
- **get_concur_payment_types**: List available payment types.
- **test_concur_connection**: Verify API connectivity.

## Workflow Tips

1. Use \`list_card_charges\` to see unassigned card transactions
2. Use \`create_concur_expense\` to create expenses from card charges
3. Use \`upload_receipt\` to attach receipt images
4. For meals/entertainment, use \`search_attendees\` or \`create_attendee\`, then \`add_expense_attendee\`
5. Use \`submit_report\` when report is complete
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
        res.json({ status: "ok", service: "concur-mcp-server" });
    });

    app.listen(PORT, () => {
        console.log(`Concur MCP Server running on http://localhost:${PORT}`);
        console.log(`SSE endpoint: http://localhost:${PORT}/sse`);
    });
}

async function main() {
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
