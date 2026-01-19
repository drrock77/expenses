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

// Tool: delete_concur_report
server.tool(
    "delete_concur_report",
    "Delete a Concur expense report. Only works on reports that haven't been submitted.",
    {
        reportId: z.string().describe("The ID of the report to delete"),
    },
    async ({ reportId }) => {
        try {
            await concurService.deleteReport(reportId);
            return {
                content: [{ type: "text", text: `Report ${reportId} deleted successfully.` }],
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
    "List Concur expenses (optionally filtered by report ID) - uses v3 API",
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

// Tool: list_expenses_v4
server.tool(
    "list_expenses_v4",
    "List expenses for a report using v4 API - returns expenseId needed for comments/attendees",
    {
        reportId: z.string().describe("Report ID to list expenses for"),
    },
    async ({ reportId }) => {
        try {
            const expenses = await concurService.getExpensesV4(reportId);
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

// Tool: get_report_v4
server.tool(
    "get_report_v4",
    "Get report details via v4 API - useful for debugging v4 ID formats",
    {
        reportId: z.string().describe("Report ID"),
    },
    async ({ reportId }) => {
        try {
            const report = await concurService.getReportV4(reportId);
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
    "Create a new Concur expense entry. PaymentTypeID and LocationID are auto-resolved if not provided.",
    {
        transactionDate: z.string().describe("Date of the transaction (YYYY-MM-DD)"),
        expenseTypeCode: z.string().describe("Expense type code - must match your expense group. Use get_expense_group_config to get valid codes."),
        businessPurpose: z.string().describe("Business purpose/description of the expense (maps to Description field)"),
        vendorDescription: z.string().describe("Vendor name/description"),
        transactionAmount: z.number().describe("Amount of the transaction"),
        currencyCode: z.string().describe("Currency code (e.g., USD)"),
        reportId: z.string().describe("Report ID to assign the expense to (required by Concur API)"),
        paymentTypeId: z.string().optional().describe("Payment type ID (internal Concur ID). Auto-resolved if not provided."),
        paymentTypeName: z.string().optional().describe("Payment type name to match (e.g., 'Cash', 'Company Paid')."),
        locationId: z.string().optional().describe("Location ID (internal Concur ID). Auto-resolved from locationCity if not provided."),
        locationCity: z.string().optional().describe("City name for location lookup (e.g., 'London', 'New York'). Used to auto-resolve LocationID."),
        comment: z.string().optional().describe("Comment for the expense (max 500 chars). Use for justification on high-value expenses."),
        isBillable: z.boolean().optional().describe("Whether expense is billable to client"),
        isPersonal: z.boolean().optional().describe("Whether expense is personal (non-reimbursable)"),
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
        locationId: z.string().optional().describe("Location ID (use search_locations to find valid IDs)"),
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
    "Get available Concur payment types with their internal IDs (required for expense creation)",
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

// Tool: get_expense_group_config
server.tool(
    "get_expense_group_config",
    "Get the user's expense group configuration including valid expense types and payment types with their internal IDs. Call this before creating expenses to get valid codes.",
    {},
    async () => {
        try {
            const config = await concurService.getExpenseGroupConfigurations();
            return {
                content: [{ type: "text", text: JSON.stringify(config, null, 2) }],
            };
        } catch (error) {
            return {
                content: [{ type: "text", text: formatError(error) }],
                isError: true,
            };
        }
    }
);

// Tool: get_per_diem_rates
server.tool(
    "get_per_diem_rates",
    "Get the company's per diem rates by location. Returns full day and partial day (first/last day) rates for US and international locations.",
    {},
    async () => {
        try {
            const rates = concurService.getPerDiemRates();
            return {
                content: [{ type: "text", text: JSON.stringify(rates, null, 2) }],
            };
        } catch (error) {
            return {
                content: [{ type: "text", text: formatError(error) }],
                isError: true,
            };
        }
    }
);

// Tool: calculate_per_diem
server.tool(
    "calculate_per_diem",
    "Calculate per diem for a trip. First and last days are partial (75%), middle days are full rate. Returns breakdown by day and total amount.",
    {
        startDate: z.string().describe("Trip start date (YYYY-MM-DD)"),
        endDate: z.string().describe("Trip end date (YYYY-MM-DD)"),
        location: z.string().describe("Location (e.g., 'NYC', 'San Francisco', 'London', 'Switzerland'). Uses default rate if location not found."),
    },
    async ({ startDate, endDate, location }) => {
        try {
            const calculation = concurService.calculatePerDiem(startDate, endDate, location);
            return {
                content: [{ type: "text", text: JSON.stringify(calculation, null, 2) }],
            };
        } catch (error) {
            return {
                content: [{ type: "text", text: formatError(error) }],
                isError: true,
            };
        }
    }
);

// Tool: create_per_diem_expenses
server.tool(
    "create_per_diem_expenses",
    "Calculate and create per diem expense entries for a trip. Creates one expense per day with correct rates for first/last (partial) and full days.",
    {
        reportId: z.string().describe("Report ID to add per diem expenses to"),
        startDate: z.string().describe("Trip start date (YYYY-MM-DD)"),
        endDate: z.string().describe("Trip end date (YYYY-MM-DD)"),
        location: z.string().describe("Location for per diem rates (e.g., 'NYC', 'London')"),
        businessPurpose: z.string().describe("Business purpose for the trip"),
        expenseTypeCode: z.string().optional().describe("Expense type code for per diem (default: MEALN). Check get_expense_group_config for valid codes."),
    },
    async ({ reportId, startDate, endDate, location, businessPurpose, expenseTypeCode }) => {
        try {
            const result = await concurService.createPerDiemExpenses(
                reportId,
                startDate,
                endDate,
                location,
                businessPurpose,
                expenseTypeCode
            );
            return {
                content: [{
                    type: "text",
                    text: JSON.stringify({
                        message: `Created ${result.expenses.length} per diem expenses totaling $${result.calculation.totalAmount.toFixed(2)}`,
                        calculation: result.calculation,
                        expenseIds: result.expenses.map((e: any) => e.ID || e.id)
                    }, null, 2)
                }],
            };
        } catch (error) {
            return {
                content: [{ type: "text", text: formatError(error) }],
                isError: true,
            };
        }
    }
);

// Tool: search_locations
server.tool(
    "search_locations",
    "Search for Concur location IDs by city name. Use this to get LocationID for expense creation.",
    {
        city: z.string().describe("City name to search for (e.g., 'London', 'New York', 'San Francisco')"),
    },
    async ({ city }) => {
        try {
            const locations = await concurService.searchLocations(city);
            return {
                content: [{ type: "text", text: JSON.stringify(locations, null, 2) }],
            };
        } catch (error) {
            return {
                content: [{ type: "text", text: formatError(error) }],
                isError: true,
            };
        }
    }
);

// Tool: create_expense_itemization
server.tool(
    "create_expense_itemization",
    "Create an itemization for a parent expense entry. Use for hotel breakdowns (room rate, tax, fees) or other itemized expenses.",
    {
        entryId: z.string().describe("The parent expense entry ID"),
        reportId: z.string().describe("The report ID"),
        reportOwnerId: z.string().describe("The report owner's login ID (email)"),
        expenseTypeCode: z.string().describe("Expense type code for the itemization (e.g., LODTX for hotel tax)"),
        transactionDate: z.string().describe("Date of the itemization (YYYY-MM-DD)"),
        transactionAmount: z.number().describe("Amount for this itemization"),
        description: z.string().optional().describe("Description (max 64 chars)"),
        comment: z.string().optional().describe("Comment (max 500 chars)"),
    },
    async (args) => {
        try {
            const result = await concurService.createItemization(args);
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

// Tool: get_expense_itemizations
server.tool(
    "get_expense_itemizations",
    "Get itemizations for a report or specific expense entry",
    {
        reportId: z.string().describe("The report ID"),
        entryId: z.string().optional().describe("Optional entry ID to filter itemizations"),
    },
    async ({ reportId, entryId }) => {
        try {
            const result = await concurService.getItemizations(reportId, entryId);
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

// Tool: add_expense_comment
server.tool(
    "add_expense_comment",
    "Add a comment on an expense (v4 API). IMPORTANT: Use expenseId from list_expenses_v4, NOT the v3 entry ID.",
    {
        expenseId: z.string().describe("The v4 expense ID (get from list_expenses_v4)"),
        comment: z.string().describe("Comment text"),
        reportId: z.string().describe("The report ID"),
    },
    async ({ expenseId, comment, reportId }) => {
        try {
            const result = await concurService.addExpenseComment(expenseId, comment, reportId);
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
    "Add an attendee to an expense (v4 API). IMPORTANT: Use expenseId from list_expenses_v4, NOT the v3 entry ID.",
    {
        expenseId: z.string().describe("The v4 expense ID (get from list_expenses_v4)"),
        attendeeId: z.string().describe("The ID of the attendee (from create_attendee or search_attendees)"),
        reportId: z.string().describe("The report ID"),
        amount: z.number().describe("Amount to allocate to this attendee"),
        currencyCode: z.string().describe("Currency code (e.g., USD)"),
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
    "Create a new attendee record (v4 API)",
    {
        firstName: z.string().describe("Attendee's first name"),
        lastName: z.string().describe("Attendee's last name"),
        company: z.string().optional().describe("Attendee's company"),
        title: z.string().optional().describe("Attendee's job title"),
        externalId: z.string().optional().describe("External identifier (auto-generated if not provided)"),
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

// Tool: copy_receipt
server.tool(
    "copy_receipt",
    "Copy a receipt from one expense to another. Useful for migrating expenses between reports.",
    {
        sourceEntryId: z.string().describe("The ID of the source expense entry (has the receipt)"),
        targetEntryId: z.string().describe("The ID of the target expense entry (to copy receipt to)"),
    },
    async ({ sourceEntryId, targetEntryId }) => {
        try {
            const result = await concurService.copyReceiptBetweenExpenses(sourceEntryId, targetEntryId);
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
- **create_concur_expense**: Create a new expense entry (auto-resolves PaymentTypeID).
- **update_concur_expense**: Update an existing expense.
- **delete_concur_expense**: Delete an expense.

### Card Charges
- **list_card_charges**: List unassigned corporate card transactions.

### Receipts
- **get_receipt_image_url**: Get receipt image URL for an expense.
- **list_report_receipts**: List all receipts on a report.
- **upload_receipt**: Upload a receipt image to an expense.
- **copy_receipt**: Copy a receipt from one expense to another (for migrations).

### Attendees
- **search_attendees**: Search for existing attendees.
- **create_attendee**: Create a new attendee record.
- **get_expense_attendees**: Get attendees on an expense.
- **add_expense_attendee**: Add an attendee to an expense.
- **remove_expense_attendee**: Remove an attendee from an expense.

### Per Diem
- **get_per_diem_rates**: Get company per diem rates by location.
- **calculate_per_diem**: Calculate per diem for dates/location (preview without creating).
- **create_per_diem_expenses**: Create per diem expense entries for a trip.

### Configuration
- **get_expense_group_config**: Get full expense group config with valid expense types and payment type IDs.
- **get_concur_expense_types**: List available expense types for your group.
- **get_concur_payment_types**: List payment types with internal IDs.
- **test_concur_connection**: Verify API connectivity.

## Per Diem Rates (2025)

### US Locations
| Location | Full Day | First/Last Day |
|----------|----------|----------------|
| NYC/SF | $92.00 | $69.00 |
| Boston | $18.00 | $18.00 |
| Other US | $74.00 | $56.00 |

### International
| Location | Full Day | First/Last Day |
|----------|----------|----------------|
| Switzerland/London/Copenhagen | $150.00 | $112.50 |
| Rest of World | $100.00 | $75.00 |

## Workflow Tips

1. **IMPORTANT**: Before creating expenses, call \`get_expense_group_config\` to get valid expense type codes and payment type IDs for your user's expense group.
2. Use \`list_card_charges\` to see unassigned card transactions.
3. Use \`create_concur_expense\` to create expenses - PaymentTypeID is auto-resolved from your expense group config.
4. Use \`upload_receipt\` to attach receipt images.
5. For meals/entertainment, use \`search_attendees\` or \`create_attendee\`, then \`add_expense_attendee\`.
6. Use \`submit_report\` when report is complete.

## Common Errors

- "Invalid ExpenseTypeCode" - Use \`get_expense_group_config\` to see valid codes for your expense group.
- "PaymentTypeID required" - This is now auto-resolved, but you can specify paymentTypeName (e.g., "Cash", "Company Paid").
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
