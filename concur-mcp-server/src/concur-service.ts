import { CreateExpenseParams, CreateReportParams, UpdateExpenseParams, ConcurApiError, PerDiemRate, PerDiemCalculation, PerDiemDayDetail, CreateItemizationParams, ConcurLocation } from './types.js';

const PER_DIEM_RATES: PerDiemRate[] = [
    // US Locations
    { location: "New York City", aliases: ["NYC", "New York", "Manhattan"], country: "US", fullDay: 92.00, partialDay: 69.00 },
    { location: "San Francisco", aliases: ["SF", "Bay Area"], country: "US", fullDay: 92.00, partialDay: 69.00 },
    { location: "Boston", aliases: [], country: "US", fullDay: 18.00, partialDay: 18.00 },
    { location: "All Other US", aliases: ["US", "USA", "United States"], country: "US", fullDay: 74.00, partialDay: 56.00, isDefault: true },
    // International Locations
    { location: "Switzerland", aliases: ["Zurich", "Geneva", "Basel"], country: "CH", fullDay: 150.00, partialDay: 112.50 },
    { location: "London", aliases: ["UK", "United Kingdom", "England"], country: "GB", fullDay: 150.00, partialDay: 112.50 },
    { location: "Copenhagen", aliases: ["Denmark"], country: "DK", fullDay: 150.00, partialDay: 112.50 },
    { location: "Rest of World", aliases: ["International", "Other"], country: "INTL", fullDay: 100.00, partialDay: 75.00, isDefault: true },
];

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
        const encodedId = encodeURIComponent(expenseId);
        const response = await this.fetchWithRetry(
            `${this.baseUrl}/api/v3.0/expense/entries/${encodedId}`,
            { method: "GET" },
            `getExpenseDetails(${expenseId})`
        );
        return await response.json();
    }

    async createExpense(expenseDetails: CreateExpenseParams) {
        const isValid = await this.validateExpenseTypeCode(expenseDetails.expenseTypeCode);
        if (!isValid) {
            const validTypes = await this.getExpenseTypes();
            const validCodes = validTypes.map(t => t.Code).join(', ');
            throw new Error(
                `Invalid ExpenseTypeCode: "${expenseDetails.expenseTypeCode}". ` +
                `Valid codes for your expense group: ${validCodes || 'none found'}`
            );
        }

        let paymentTypeId = expenseDetails.paymentTypeId;
        if (!paymentTypeId) {
            paymentTypeId = await this.resolvePaymentTypeId(expenseDetails.paymentTypeName);
        }

        let locationId = expenseDetails.locationId;
        if (!locationId && expenseDetails.locationCity) {
            const locations = await this.searchLocations(expenseDetails.locationCity);
            if (locations.length > 0) {
                locationId = locations[0].ID;
            }
        }

        const body: Record<string, unknown> = {
            TransactionDate: expenseDetails.transactionDate,
            ExpenseTypeCode: expenseDetails.expenseTypeCode,
            VendorDescription: expenseDetails.vendorDescription,
            TransactionAmount: expenseDetails.transactionAmount,
            TransactionCurrencyCode: expenseDetails.currencyCode,
            PaymentTypeID: paymentTypeId,
        };

        if (expenseDetails.reportId) {
            body.ReportID = expenseDetails.reportId;
        }
        if (locationId) {
            body.LocationID = locationId;
        }
        if (expenseDetails.comment) {
            body.Comment = expenseDetails.comment;
        }
        if (expenseDetails.description) {
            body.Description = expenseDetails.description;
        }
        if (expenseDetails.businessPurpose) {
            body.Description = expenseDetails.businessPurpose;
        }
        if (expenseDetails.isBillable !== undefined) {
            body.IsBillable = expenseDetails.isBillable;
        }
        if (expenseDetails.isPersonal !== undefined) {
            body.IsPersonal = expenseDetails.isPersonal;
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

        // Only include writable fields - exclude read-only fields returned by GET
        const writableFields = [
            'TransactionDate', 'ExpenseTypeCode', 'TransactionAmount',
            'TransactionCurrencyCode', 'VendorDescription', 'Description',
            'Comment', 'PaymentTypeID', 'ReportID', 'LocationID',
            'IsBillable', 'IsPersonal', 'Custom1', 'Custom2', 'Custom3',
            'Custom4', 'Custom5', 'Custom6', 'Custom7', 'Custom8',
            'Custom9', 'Custom10', 'Custom11', 'Custom12', 'Custom13',
            'Custom14', 'Custom15', 'Custom16', 'Custom17', 'Custom18',
            'Custom19', 'Custom20', 'Custom21', 'Custom22', 'Custom23', 'Custom24'
        ];

        const body: Record<string, unknown> = {};
        for (const field of writableFields) {
            if (existing[field] !== undefined) {
                body[field] = existing[field];
            }
        }

        // Apply updates
        if (updates.transactionDate) body.TransactionDate = updates.transactionDate;
        if (updates.expenseTypeCode) body.ExpenseTypeCode = updates.expenseTypeCode;
        if (updates.businessPurpose) body.Description = updates.businessPurpose;
        if (updates.vendorDescription) body.VendorDescription = updates.vendorDescription;
        if (updates.transactionAmount) body.TransactionAmount = updates.transactionAmount;
        if (updates.currencyCode) body.TransactionCurrencyCode = updates.currencyCode;
        if (updates.reportId) body.ReportID = updates.reportId;

        const encodedId = encodeURIComponent(expenseId);
        await this.fetchWithRetry(
            `${this.baseUrl}/api/v3.0/expense/entries/${encodedId}`,
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
        const encodedId = encodeURIComponent(expenseId);
        await this.fetchWithRetry(
            `${this.baseUrl}/api/v3.0/expense/entries/${encodedId}`,
            { method: "DELETE" },
            `deleteExpense(${expenseId})`
        );
        return true;
    }

    async deleteReport(reportId: string) {
        const encodedId = encodeURIComponent(reportId);
        await this.fetchWithRetry(
            `${this.baseUrl}/api/v3.0/expense/reports/${encodedId}`,
            { method: "DELETE" },
            `deleteReport(${reportId})`
        );
        return true;
    }

    async getExpenseGroupConfigurations() {
        const response = await this.fetchWithRetry(
            `${this.baseUrl}/api/v3.0/expense/expensegroupconfigurations`,
            { method: "GET" },
            "getExpenseGroupConfigurations"
        );
        const data = await response.json();
        return data;
    }

    async getExpenseTypes() {
        try {
            const config = await this.getExpenseGroupConfigurations();
            const expenseTypes: Array<{ Code: string; Name: string; ExpenseCode: string }> = [];

            if (config.Items && config.Items.length > 0) {
                for (const item of config.Items) {
                    if (item.Policies) {
                        for (const policy of item.Policies) {
                            if (policy.ExpenseTypes) {
                                for (const et of policy.ExpenseTypes) {
                                    if (!expenseTypes.find(e => e.Code === et.Code)) {
                                        expenseTypes.push({
                                            Code: et.Code,
                                            Name: et.Name,
                                            ExpenseCode: et.ExpenseCode || ''
                                        });
                                    }
                                }
                            }
                        }
                    }
                }
            }

            return expenseTypes;
        } catch (error) {
            console.error("Error fetching expense types:", error);
            return [];
        }
    }

    async getPaymentTypes() {
        try {
            const config = await this.getExpenseGroupConfigurations();
            const paymentTypes: Array<{ ID: string; Name: string; IsDefault: boolean }> = [];

            if (config.Items && config.Items.length > 0) {
                for (const item of config.Items) {
                    if (item.PaymentTypes) {
                        for (const pt of item.PaymentTypes) {
                            if (!paymentTypes.find(p => p.ID === pt.ID)) {
                                paymentTypes.push({
                                    ID: pt.ID,
                                    Name: pt.Name,
                                    IsDefault: pt.IsDefault || false
                                });
                            }
                        }
                    }
                }
            }

            return paymentTypes;
        } catch (error) {
            console.error("Error fetching payment types:", error);
            return [];
        }
    }

    async resolvePaymentTypeId(paymentTypeName?: string): Promise<string> {
        const paymentTypes = await this.getPaymentTypes();

        if (paymentTypeName) {
            const match = paymentTypes.find(pt =>
                pt.Name.toLowerCase().includes(paymentTypeName.toLowerCase()) ||
                paymentTypeName.toLowerCase().includes(pt.Name.toLowerCase())
            );
            if (match) return match.ID;
        }

        const defaultType = paymentTypes.find(pt => pt.IsDefault);
        if (defaultType) return defaultType.ID;

        if (paymentTypes.length > 0) return paymentTypes[0].ID;

        throw new Error("No payment types available. Cannot create expense without PaymentTypeID.");
    }

    async validateExpenseTypeCode(code: string): Promise<boolean> {
        const expenseTypes = await this.getExpenseTypes();
        return expenseTypes.some(et => et.Code === code);
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

    async searchLocations(city: string): Promise<ConcurLocation[]> {
        const response = await this.fetchWithRetry(
            `${this.baseUrl}/api/v3.0/common/locations?city=${encodeURIComponent(city)}&limit=10`,
            { method: "GET" },
            `searchLocations(${city})`
        );
        const data = await response.json();
        return (data.Items || []).map((item: any) => ({
            ID: item.ID,
            Name: item.Name,
            City: item.City,
            Country: item.Country,
            IATACode: item.IATACode
        }));
    }

    async createItemization(params: CreateItemizationParams) {
        const body: Record<string, unknown> = {
            EntryID: params.entryId,
            ReportID: params.reportId,
            ReportOwnerID: params.reportOwnerId,
            ExpenseTypeCode: params.expenseTypeCode,
            TransactionDate: params.transactionDate,
            TransactionAmount: params.transactionAmount,
        };

        if (params.description) {
            body.Description = params.description;
        }
        if (params.comment) {
            body.Comment = params.comment;
        }

        const response = await this.fetchWithRetry(
            `${this.baseUrl}/api/v3.0/expense/itemizations`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            },
            "createItemization"
        );
        return await response.json();
    }

    async getItemizations(reportId: string, entryId?: string) {
        let url = `${this.baseUrl}/api/v3.0/expense/itemizations?reportID=${reportId}&limit=100`;
        if (entryId) {
            url += `&entryID=${entryId}`;
        }
        const response = await this.fetchWithRetry(url, { method: "GET" }, "getItemizations");
        const data = await response.json();
        return { Items: data.Items || [] };
    }

    async addExpenseComment(entryId: string, comment: string, reportId?: string) {
        // Get reportId from expense if not provided
        let resolvedReportId = reportId;
        if (!resolvedReportId) {
            const existing = await this.getExpenseDetails(entryId);
            resolvedReportId = existing.ReportID;
        }

        if (!resolvedReportId) {
            throw new Error("Could not determine ReportID for expense. Please provide reportId parameter.");
        }

        // Use v4 comments endpoint - much cleaner than updating the whole expense
        const encodedReportId = encodeURIComponent(resolvedReportId);
        const encodedEntryId = encodeURIComponent(entryId);

        await this.fetchWithRetry(
            `${this.baseUrl}/expensereports/v4/reports/${encodedReportId}/expenses/${encodedEntryId}/comments`,
            {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ comment }),
            },
            `addExpenseComment(${entryId})`
        );
        return { success: true, entryId, reportId: resolvedReportId, comment };
    }

    getPerDiemRates(): PerDiemRate[] {
        return PER_DIEM_RATES;
    }

    findPerDiemRate(location: string): PerDiemRate {
        const normalizedLocation = location.toLowerCase().trim();

        for (const rate of PER_DIEM_RATES) {
            if (rate.location.toLowerCase() === normalizedLocation) {
                return rate;
            }
            for (const alias of rate.aliases) {
                if (alias.toLowerCase() === normalizedLocation) {
                    return rate;
                }
            }
        }

        for (const rate of PER_DIEM_RATES) {
            if (rate.location.toLowerCase().includes(normalizedLocation) ||
                normalizedLocation.includes(rate.location.toLowerCase())) {
                return rate;
            }
            for (const alias of rate.aliases) {
                if (alias.toLowerCase().includes(normalizedLocation) ||
                    normalizedLocation.includes(alias.toLowerCase())) {
                    return rate;
                }
            }
        }

        const isUS = normalizedLocation.includes('us') ||
                     normalizedLocation.includes('united states') ||
                     normalizedLocation.includes('america') ||
                     /^[a-z]{2}$/.test(normalizedLocation);

        const defaultRate = PER_DIEM_RATES.find(r =>
            r.isDefault && (isUS ? r.country === 'US' : r.country === 'INTL')
        );

        return defaultRate || PER_DIEM_RATES.find(r => r.isDefault && r.country === 'INTL')!;
    }

    calculatePerDiem(startDate: string, endDate: string, location: string): PerDiemCalculation {
        const rate = this.findPerDiemRate(location);
        const start = new Date(startDate);
        const end = new Date(endDate);

        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            throw new Error("Invalid date format. Use YYYY-MM-DD.");
        }

        if (end < start) {
            throw new Error("End date must be after start date.");
        }

        const breakdown: PerDiemDayDetail[] = [];
        const dayMs = 24 * 60 * 60 * 1000;
        const totalDays = Math.round((end.getTime() - start.getTime()) / dayMs) + 1;

        let currentDate = new Date(start);
        let dayIndex = 0;

        while (currentDate <= end) {
            const dateStr = currentDate.toISOString().split('T')[0];
            let dayType: 'first' | 'last' | 'full';
            let dayRate: number;

            if (totalDays === 1) {
                dayType = 'first';
                dayRate = rate.partialDay;
            } else if (dayIndex === 0) {
                dayType = 'first';
                dayRate = rate.partialDay;
            } else if (dayIndex === totalDays - 1) {
                dayType = 'last';
                dayRate = rate.partialDay;
            } else {
                dayType = 'full';
                dayRate = rate.fullDay;
            }

            breakdown.push({
                date: dateStr,
                dayType,
                rate: dayRate,
                location: rate.location
            });

            currentDate = new Date(currentDate.getTime() + dayMs);
            dayIndex++;
        }

        const fullDays = breakdown.filter(d => d.dayType === 'full').length;
        const partialDays = breakdown.filter(d => d.dayType !== 'full').length;
        const totalAmount = breakdown.reduce((sum, d) => sum + d.rate, 0);

        return {
            location: rate.location,
            startDate,
            endDate,
            totalDays,
            fullDays,
            partialDays,
            fullDayRate: rate.fullDay,
            partialDayRate: rate.partialDay,
            totalAmount,
            breakdown
        };
    }

    async createPerDiemExpenses(
        reportId: string,
        startDate: string,
        endDate: string,
        location: string,
        businessPurpose: string,
        perDiemExpenseTypeCode?: string
    ): Promise<{ calculation: PerDiemCalculation; expenses: any[] }> {
        const calculation = this.calculatePerDiem(startDate, endDate, location);

        const expenseTypeCode = perDiemExpenseTypeCode || 'MEALN';

        const expenses: any[] = [];

        for (const day of calculation.breakdown) {
            const expense = await this.createExpense({
                reportId,
                transactionDate: day.date,
                expenseTypeCode,
                transactionAmount: day.rate,
                currencyCode: 'USD',
                vendorDescription: `Per Diem - ${day.location}`,
                businessPurpose: `${businessPurpose} (${day.dayType === 'full' ? 'Full Day' : 'Travel Day'})`
            });
            expenses.push(expense);
        }

        return { calculation, expenses };
    }
}
