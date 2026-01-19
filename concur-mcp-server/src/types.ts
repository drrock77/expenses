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
