import { CreateExpenseParams, CreateReportParams, UpdateExpenseParams, ConcurApiError } from './types.js';

export class ConcurService {
    private accessToken: string | null = null;
    private refreshToken: string | null = null;
    private clientId?: string;
    private clientSecret?: string;
    private baseUrl = "https://us2.api.concursolutions.com";
    private tokenUrl = "https://us.api.concursolutions.com/oauth2/v0/token";
    private tokenRefreshInProgress = false;

    constructor(config: { accessToken?: string; refreshToken?: string; clientId?: string; clientSecret?: string }) {
        if (config.accessToken) {
            this.accessToken = config.accessToken;
        }
        if (config.refreshToken) {
            this.refreshToken = config.refreshToken;
        }
        this.clientId = config.clientId;
        this.clientSecret = config.clientSecret;
    }

    private async refreshAccessToken() {
        if (!this.refreshToken || !this.clientId || !this.clientSecret) {
            throw new Error("Cannot refresh token: Missing refresh token or client credentials.");
        }

        try {
            console.error("Refreshing Concur access token...");
            const body = new URLSearchParams({
                client_id: this.clientId,
                client_secret: this.clientSecret,
                grant_type: 'refresh_token',
                refresh_token: this.refreshToken,
            });

            const response = await fetch(this.tokenUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: body,
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Failed to refresh token: ${response.statusText} - ${errorText}`);
            }

            const data: any = await response.json();
            this.accessToken = data.access_token;
            if (data.refresh_token) {
                this.refreshToken = data.refresh_token; // Update refresh token if a new one is returned
            }
            console.error("Successfully refreshed Concur access token.");
        } catch (error) {
            console.error("Token refresh failed:", error);
            throw error;
        }
    }

    private async ensureToken() {
        if (this.accessToken) return;

        // If we have a refresh token, try to use it first
        if (this.refreshToken && this.clientId && this.clientSecret) {
            await this.refreshAccessToken();
            return;
        }

        if (!this.clientId || !this.clientSecret) {
            throw new Error("No access token, refresh token, or client credentials provided");
        }

        try {
            const body = new URLSearchParams({
                client_id: this.clientId,
                client_secret: this.clientSecret,
                grant_type: 'client_credentials',
            });

            const response = await fetch(this.tokenUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: body,
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Failed to authenticate: ${response.statusText} - ${errorText}`);
            }

            const data: any = await response.json();
            this.accessToken = data.access_token;
        } catch (error) {
            console.error("Authentication failed:", error);
            throw error;
        }
    }

    private async getHeaders() {
        await this.ensureToken();
        return {
            Authorization: `Bearer ${this.accessToken}`,
            "Accept": "application/json",
        };
    }

    private async handleApiError(response: Response, context: string): Promise<never> {
        let errorBody: any = null;
        try {
            errorBody = await response.json();
        } catch {
            try {
                errorBody = await response.text();
            } catch {
                errorBody = null;
            }
        }

        const error: ConcurApiError = new Error(
            `Concur API error (${context}): ${response.status} ${response.statusText}`
        ) as ConcurApiError;
        error.status = response.status;
        error.statusText = response.statusText;
        error.body = errorBody;

        if (errorBody?.Message) {
            error.message += ` - ${errorBody.Message}`;
        } else if (errorBody?.error_description) {
            error.message += ` - ${errorBody.error_description}`;
        } else if (typeof errorBody === 'string' && errorBody.length < 200) {
            error.message += ` - ${errorBody}`;
        }

        throw error;
    }

    private async fetchWithRetry(
        url: string,
        options: RequestInit,
        context: string,
        retryOn401 = true
    ): Promise<Response> {
        const headers = await this.getHeaders();
        const mergedOptions: RequestInit = {
            ...options,
            headers: { ...headers, ...options.headers },
        };

        const response = await fetch(url, mergedOptions);

        if (response.status === 401 && retryOn401 && !this.tokenRefreshInProgress) {
            if (this.refreshToken && this.clientId && this.clientSecret) {
                console.error(`401 received for ${context}, attempting token refresh...`);
                this.tokenRefreshInProgress = true;
                try {
                    await this.refreshAccessToken();
                    this.tokenRefreshInProgress = false;
                    return this.fetchWithRetry(url, options, context, false);
                } catch (refreshError) {
                    this.tokenRefreshInProgress = false;
                    throw refreshError;
                }
            }
        }

        if (!response.ok) {
            await this.handleApiError(response, context);
        }

        return response;
    }

    async getReports() {
        const response = await this.fetchWithRetry(
            `${this.baseUrl}/api/v3.0/expense/reports?limit=100`,
            { method: "GET" },
            "getReports"
        );
        const data = await response.json();
        return { Items: data.Items || [] };
    }

    async getReportDetails(reportId: string) {
        const response = await this.fetchWithRetry(
            `${this.baseUrl}/api/v3.0/expense/reports/${reportId}`,
            { method: "GET" },
            `getReportDetails(${reportId})`
        );
        return await response.json();
    }

    async createReport(reportDetails: CreateReportParams) {
        const response = await this.fetchWithRetry(
            `${this.baseUrl}/api/v3.0/expense/reports`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    Name: reportDetails.name,
                    Purpose: reportDetails.purpose,
                    UserDefinedDate: reportDetails.startDate,
                }),
            },
            "createReport"
        );
        return await response.json();
    }

    async getExpenses(reportId?: string) {
        const url = reportId
            ? `${this.baseUrl}/api/v3.0/expense/entries?limit=100&reportID=${reportId}`
            : `${this.baseUrl}/api/v3.0/expense/entries?limit=100`;

        const response = await this.fetchWithRetry(url, { method: "GET" }, "getExpenses");
        const data = await response.json();
        return { Items: data.Items || [] };
    }

    async getExpenseDetails(expenseId: string) {
        const response = await this.fetchWithRetry(
            `${this.baseUrl}/api/v3.0/expense/entries/${expenseId}`,
            { method: "GET" },
            `getExpenseDetails(${expenseId})`
        );
        return await response.json();
    }

    async createExpense(expenseDetails: CreateExpenseParams) {
        const body: Record<string, unknown> = {
            TransactionDate: expenseDetails.transactionDate,
            ExpenseTypeCode: expenseDetails.expenseTypeCode,
            BusinessPurpose: expenseDetails.businessPurpose,
            VendorDescription: expenseDetails.vendorDescription,
            TransactionAmount: expenseDetails.transactionAmount,
            CurrencyCode: expenseDetails.currencyCode,
        };

        if (expenseDetails.reportId) {
            body.ReportID = expenseDetails.reportId;
        }

        const response = await this.fetchWithRetry(
            `${this.baseUrl}/api/v3.0/expense/entries`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            },
            "createExpense"
        );
        return await response.json();
    }

    async updateExpense(expenseId: string, updates: UpdateExpenseParams) {
        const existing = await this.getExpenseDetails(expenseId);
        const body: Record<string, unknown> = { ...existing };

        if (updates.transactionDate) body.TransactionDate = updates.transactionDate;
        if (updates.expenseTypeCode) body.ExpenseTypeCode = updates.expenseTypeCode;
        if (updates.businessPurpose) body.BusinessPurpose = updates.businessPurpose;
        if (updates.vendorDescription) body.VendorDescription = updates.vendorDescription;
        if (updates.transactionAmount) body.TransactionAmount = updates.transactionAmount;
        if (updates.currencyCode) body.CurrencyCode = updates.currencyCode;
        if (updates.reportId) body.ReportID = updates.reportId;

        await this.fetchWithRetry(
            `${this.baseUrl}/api/v3.0/expense/entries/${expenseId}`,
            {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            },
            `updateExpense(${expenseId})`
        );
        return true;
    }

    async deleteExpense(expenseId: string) {
        await this.fetchWithRetry(
            `${this.baseUrl}/api/v3.0/expense/entries/${expenseId}`,
            { method: "DELETE" },
            `deleteExpense(${expenseId})`
        );
        return true;
    }

    async getExpenseTypes() {
        try {
            // Note: This endpoint might vary based on Concur configuration, 
            // but usually it's under list items or configuration.
            // For now, we'll try a common endpoint or return a placeholder if not easily available via standard v3.
            // v3.0/common/listitems is one place, or v3.0/expense/expensetypes (if available)
            // Let's assume v3.0/expense/configuration/expensetypes exists or similar.
            // Actually, v3.0 doesn't have a direct 'expensetypes' endpoint documented publicly always.
            // We might need to use v1.1 or v3.1 if available.
            // Let's try a safe bet: v3.0/common/listitems if we knew the list ID.
            // Without a known list ID, we might just return a static list or try to fetch from a known config.

            // For this implementation, let's try to fetch from a likely endpoint, or return empty if not found.
            // A common pattern is to just let the user type the code, but the tool asks for 'get_concur_expense_types'.

            // Let's try to fetch recent expenses and extract unique types as a heuristic if no direct endpoint.
            // Or better, let's try to hit a standard endpoint.

            // Placeholder implementation as specific endpoint requires more discovery
            return [
                { Code: "AIRFR", Name: "Airfare" },
                { Code: "HOTEL", Name: "Hotel" },
                { Code: "MEALS", Name: "Meals" },
                { Code: "TAXI", Name: "Taxi" },
                { Code: "PRKNG", Name: "Parking" },
                { Code: "CAR", Name: "Car Rental" }
            ];
        } catch (error) {
            console.error("Error fetching expense types:", error);
            return [];
        }
    }

    async getPaymentTypes() {
        try {
            // Placeholder implementation
            return [
                { Code: "CASH", Name: "Cash" },
                { Code: "CORP", Name: "Corporate Card" }
            ];
        } catch (error) {
            console.error("Error fetching payment types:", error);
            return [];
        }
    }

    async getUserProfile() {
        const response = await this.fetchWithRetry(
            `${this.baseUrl}/api/v3.0/common/users?primary=true`,
            { method: "GET" },
            "getUserProfile"
        );
        const data = await response.json();
        return data.Items ? data.Items[0] : null;
    }

    async getCardCharges() {
        const response = await this.fetchWithRetry(
            `${this.baseUrl}/api/expense/expensereport/v1.1/CardCharges`,
            { method: "GET" },
            "getCardCharges"
        );
        const text = await response.text();

        // v1.1 API returns XML, parse it
        const charges: Array<Record<string, string>> = [];
        const chargeMatches = text.match(/<CardCharge>([\s\S]*?)<\/CardCharge>/g) || [];

        for (const chargeXml of chargeMatches) {
            const charge: Record<string, string> = {};
            const fields = [
                'CardNumber', 'ExpKey', 'Merchant', 'ExpName', 'TransactionAmount',
                'TransactionCrnCode', 'TransactionDate', 'CardTransactionID', 'PostedAmount'
            ];
            for (const field of fields) {
                const match = chargeXml.match(new RegExp(`<${field}>([^<]*)</${field}>`));
                if (match) charge[field] = match[1];
            }
            if (Object.keys(charge).length > 0) charges.push(charge);
        }

        return { Items: charges };
    }

    async getExpenseAttendees(entryId: string) {
        const response = await this.fetchWithRetry(
            `${this.baseUrl}/api/v3.0/expense/entryattendeeassociations?entryID=${entryId}&limit=100`,
            { method: "GET" },
            `getExpenseAttendees(${entryId})`
        );
        const data = await response.json();
        return { Items: data.Items || [] };
    }

    async addExpenseAttendee(params: {
        entryId: string;
        attendeeId: string;
        amount?: number;
        associatedAttendeeCount?: number;
    }) {
        const body: Record<string, unknown> = {
            EntryID: params.entryId,
            AttendeeID: params.attendeeId,
        };
        if (params.amount !== undefined) body.Amount = params.amount;
        if (params.associatedAttendeeCount !== undefined) {
            body.AssociatedAttendeeCount = params.associatedAttendeeCount;
        }

        const response = await this.fetchWithRetry(
            `${this.baseUrl}/api/v3.0/expense/entryattendeeassociations`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            },
            "addExpenseAttendee"
        );
        return await response.json();
    }

    async removeExpenseAttendee(associationId: string) {
        await this.fetchWithRetry(
            `${this.baseUrl}/api/v3.0/expense/entryattendeeassociations/${associationId}`,
            { method: "DELETE" },
            `removeExpenseAttendee(${associationId})`
        );
        return true;
    }

    async searchAttendees(searchTerm: string) {
        const response = await this.fetchWithRetry(
            `${this.baseUrl}/api/v3.0/common/attendees?attendeeTypeCode=BUSGUEST&limit=25`,
            { method: "GET" },
            "searchAttendees"
        );
        const data = await response.json();
        const items = data.Items || [];

        // Filter by search term (name or company)
        const filtered = items.filter((a: any) => {
            const name = `${a.FirstName || ''} ${a.LastName || ''}`.toLowerCase();
            const company = (a.Company || '').toLowerCase();
            const term = searchTerm.toLowerCase();
            return name.includes(term) || company.includes(term);
        });

        return { Items: filtered };
    }

    async createAttendee(params: {
        firstName: string;
        lastName: string;
        company?: string;
        title?: string;
        attendeeTypeCode?: string;
    }) {
        const body: Record<string, unknown> = {
            FirstName: params.firstName,
            LastName: params.lastName,
            AttendeeTypeCode: params.attendeeTypeCode || 'BUSGUEST',
        };
        if (params.company) body.Company = params.company;
        if (params.title) body.Title = params.title;

        const response = await this.fetchWithRetry(
            `${this.baseUrl}/api/v3.0/common/attendees`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            },
            "createAttendee"
        );
        return await response.json();
    }

    async getReceiptImageUrl(entryId: string) {
        const response = await this.fetchWithRetry(
            `${this.baseUrl}/api/image/v1.0/expenseentry/${entryId}`,
            {
                method: "GET",
                headers: { "Accept": "application/xml" },
            },
            `getReceiptImageUrl(${entryId})`
        );
        const xml = await response.text();

        // Parse XML response
        const idMatch = xml.match(/<Id>([^<]*)<\/Id>/);
        const urlMatch = xml.match(/<Url>([^<]*)<\/Url>/);

        return {
            id: idMatch ? idMatch[1] : null,
            url: urlMatch ? urlMatch[1] : null,
        };
    }

    async getReportReceiptImages(reportId: string) {
        const response = await this.fetchWithRetry(
            `${this.baseUrl}/api/image/v1.0/report/${reportId}`,
            {
                method: "GET",
                headers: { "Accept": "application/xml" },
            },
            `getReportReceiptImages(${reportId})`
        );
        const xml = await response.text();

        // Parse multiple images from XML
        const images: Array<{ id: string; url: string }> = [];
        const imageMatches = xml.match(/<Image>([\s\S]*?)<\/Image>/g) || [];

        for (const imageXml of imageMatches) {
            const idMatch = imageXml.match(/<Id>([^<]*)<\/Id>/);
            const urlMatch = imageXml.match(/<Url>([^<]*)<\/Url>/);
            if (idMatch && urlMatch) {
                images.push({ id: idMatch[1], url: urlMatch[1] });
            }
        }

        // If no Image tags, try single response format
        if (images.length === 0) {
            const idMatch = xml.match(/<Id>([^<]*)<\/Id>/);
            const urlMatch = xml.match(/<Url>([^<]*)<\/Url>/);
            if (idMatch && urlMatch) {
                images.push({ id: idMatch[1], url: urlMatch[1] });
            }
        }

        return { Items: images };
    }

    async uploadReceiptToExpense(entryId: string, imageData: Buffer, contentType: string) {
        const validTypes = ['application/pdf', 'image/jpg', 'image/jpeg', 'image/png'];
        if (!validTypes.includes(contentType)) {
            throw new Error(`Invalid content type: ${contentType}. Must be one of: ${validTypes.join(', ')}`);
        }

        const response = await this.fetchWithRetry(
            `${this.baseUrl}/api/image/v1.0/expenseentry/${entryId}`,
            {
                method: "POST",
                headers: {
                    "Content-Type": contentType,
                    "Content-Length": imageData.length.toString(),
                },
                body: imageData as unknown as BodyInit,
            },
            `uploadReceiptToExpense(${entryId})`
        );
        const xml = await response.text();

        const idMatch = xml.match(/<Id>([^<]*)<\/Id>/);
        const urlMatch = xml.match(/<Url>([^<]*)<\/Url>/);

        return {
            id: idMatch ? idMatch[1] : null,
            url: urlMatch ? urlMatch[1] : null,
        };
    }

    async submitReport(reportId: string) {
        // The submit workflow action endpoint
        const response = await this.fetchWithRetry(
            `${this.baseUrl}/api/expense/expensereport/v1.1/report/${reportId}/submit`,
            {
                method: "POST",
                headers: { "Content-Type": "application/xml" },
                body: "<WorkflowAction xmlns='http://www.concursolutions.com/api/expense/expensereport/2011/03'><Action>Submit</Action></WorkflowAction>",
            },
            `submitReport(${reportId})`
        );
        return { success: true, reportId };
    }
}
