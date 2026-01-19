export interface ConcurReport {
    ID: string;
    Name: string;
    Purpose: string;
    UserDefinedDate: string;
    ApprovalStatusCode: string;
    Total: number;
    CurrencyCode: string;
    [key: string]: any;
}

export interface ConcurExpense {
    ID: string;
    TransactionDate: string;
    TransactionAmount: number;
    CurrencyCode: string;
    ExpenseTypeCode: string;
    BusinessPurpose: string;
    VendorDescription: string;
    ReportID?: string;
    [key: string]: any;
}

export interface CreateReportParams {
    name: string;
    purpose: string;
    startDate: string;
}

export interface CreateExpenseParams {
    transactionDate: string;
    expenseTypeCode: string;
    businessPurpose: string;
    vendorDescription: string;
    transactionAmount: number;
    currencyCode: string;
    reportId?: string;
    paymentTypeId?: string;
    paymentTypeName?: string;
    locationId?: string;
    locationCity?: string;
    comment?: string;
    description?: string;
    isBillable?: boolean;
    isPersonal?: boolean;
}

export interface CreateItemizationParams {
    entryId: string;
    reportId: string;
    reportOwnerId: string;
    expenseTypeCode: string;
    transactionDate: string;
    transactionAmount: number;
    description?: string;
    comment?: string;
}

export interface ConcurLocation {
    ID: string;
    Name: string;
    City: string;
    Country: string;
    IATACode?: string;
}

export interface UpdateExpenseParams {
    transactionDate?: string;
    expenseTypeCode?: string;
    businessPurpose?: string;
    vendorDescription?: string;
    transactionAmount?: number;
    currencyCode?: string;
    reportId?: string;
}

export interface ConcurApiError extends Error {
    status: number;
    statusText: string;
    body?: unknown;
}

export interface PerDiemRate {
    location: string;
    aliases: string[];
    country: string;
    fullDay: number;
    partialDay: number;
    isDefault?: boolean;
}

export interface PerDiemDayDetail {
    date: string;
    dayType: 'first' | 'last' | 'full';
    rate: number;
    location: string;
}

export interface PerDiemCalculation {
    location: string;
    startDate: string;
    endDate: string;
    totalDays: number;
    fullDays: number;
    partialDays: number;
    fullDayRate: number;
    partialDayRate: number;
    totalAmount: number;
    breakdown: PerDiemDayDetail[];
}
