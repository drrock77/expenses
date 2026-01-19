import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConcurService } from './concur-service.js';

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('ConcurService', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with access token', () => {
      const service = new ConcurService({ accessToken: 'test-token' });
      expect(service).toBeDefined();
    });

    it('should initialize with refresh token and client credentials', () => {
      const service = new ConcurService({
        refreshToken: 'refresh-token',
        clientId: 'client-id',
        clientSecret: 'client-secret',
      });
      expect(service).toBeDefined();
    });
  });

  describe('getReports', () => {
    it('should return reports on success', async () => {
      const mockReports = {
        Items: [
          { ID: 'report-1', Name: 'Trip Report' },
          { ID: 'report-2', Name: 'Conference Report' },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockReports),
      });

      const service = new ConcurService({ accessToken: 'test-token' });
      const result = await service.getReports();

      expect(result.Items).toHaveLength(2);
      expect(result.Items[0].ID).toBe('report-1');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://us2.api.concursolutions.com/api/v3.0/expense/reports?limit=100',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should handle empty response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

      const service = new ConcurService({ accessToken: 'test-token' });
      const result = await service.getReports();

      expect(result.Items).toEqual([]);
    });

    it('should throw on API error with details', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        json: () => Promise.resolve({ Message: 'Access denied' }),
      });

      const service = new ConcurService({ accessToken: 'test-token' });

      await expect(service.getReports()).rejects.toThrow('Access denied');
    });
  });

  describe('getReportDetails', () => {
    it('should return report details', async () => {
      const mockReport = {
        ID: 'report-1',
        Name: 'Business Trip',
        Total: 500.0,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockReport),
      });

      const service = new ConcurService({ accessToken: 'test-token' });
      const result = await service.getReportDetails('report-1');

      expect(result.ID).toBe('report-1');
      expect(result.Name).toBe('Business Trip');
    });
  });

  describe('createReport', () => {
    it('should create report with correct payload', async () => {
      const mockResponse = { ID: 'new-report', Name: 'New Trip' };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const service = new ConcurService({ accessToken: 'test-token' });
      const result = await service.createReport({
        name: 'New Trip',
        purpose: 'Client meeting',
        startDate: '2024-01-15',
      });

      expect(result.ID).toBe('new-report');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://us2.api.concursolutions.com/api/v3.0/expense/reports',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            Name: 'New Trip',
            Purpose: 'Client meeting',
            UserDefinedDate: '2024-01-15',
          }),
        })
      );
    });
  });

  describe('getExpenses', () => {
    it('should return expenses without filter', async () => {
      const mockExpenses = {
        Items: [{ ID: 'exp-1', TransactionAmount: 100 }],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockExpenses),
      });

      const service = new ConcurService({ accessToken: 'test-token' });
      const result = await service.getExpenses();

      expect(result.Items).toHaveLength(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://us2.api.concursolutions.com/api/v3.0/expense/entries?limit=100',
        expect.any(Object)
      );
    });

    it('should filter by reportId when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ Items: [] }),
      });

      const service = new ConcurService({ accessToken: 'test-token' });
      await service.getExpenses('report-123');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://us2.api.concursolutions.com/api/v3.0/expense/entries?limit=100&reportID=report-123',
        expect.any(Object)
      );
    });
  });

  describe('createExpense', () => {
    it('should create expense with all fields', async () => {
      const mockResponse = { ID: 'new-expense' };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const service = new ConcurService({ accessToken: 'test-token' });
      const result = await service.createExpense({
        transactionDate: '2024-01-15',
        expenseTypeCode: 'MEALS',
        businessPurpose: 'Client lunch',
        vendorDescription: 'Restaurant XYZ',
        transactionAmount: 75.5,
        currencyCode: 'USD',
        reportId: 'report-1',
      });

      expect(result.ID).toBe('new-expense');
      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.ReportID).toBe('report-1');
      expect(callBody.TransactionAmount).toBe(75.5);
    });
  });

  describe('updateExpense', () => {
    it('should merge updates with existing expense', async () => {
      const existingExpense = {
        ID: 'exp-1',
        TransactionDate: '2024-01-15',
        TransactionAmount: 50,
        VendorDescription: 'Old Vendor',
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(existingExpense),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({}),
        });

      const service = new ConcurService({ accessToken: 'test-token' });
      const result = await service.updateExpense('exp-1', {
        transactionAmount: 75,
      });

      expect(result).toBe(true);
      const putBody = JSON.parse(mockFetch.mock.calls[1][1].body);
      expect(putBody.TransactionAmount).toBe(75);
      expect(putBody.VendorDescription).toBe('Old Vendor');
    });
  });

  describe('deleteExpense', () => {
    it('should delete expense', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

      const service = new ConcurService({ accessToken: 'test-token' });
      const result = await service.deleteExpense('exp-1');

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://us2.api.concursolutions.com/api/v3.0/expense/entries/exp-1',
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });

  describe('token refresh on 401', () => {
    it('should refresh token and retry on 401', async () => {
      const tokenResponse = {
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
          json: () => Promise.resolve({ error: 'token_expired' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(tokenResponse),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ Items: [{ ID: 'report-1' }] }),
        });

      const service = new ConcurService({
        accessToken: 'old-token',
        refreshToken: 'refresh-token',
        clientId: 'client-id',
        clientSecret: 'client-secret',
      });

      const result = await service.getReports();

      expect(result.Items).toHaveLength(1);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should throw if refresh token unavailable on 401', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: () => Promise.resolve({ error: 'token_expired' }),
      });

      const service = new ConcurService({ accessToken: 'old-token' });

      await expect(service.getReports()).rejects.toThrow('401');
    });
  });

  describe('getExpenseTypes', () => {
    it('should return hardcoded expense types', async () => {
      const service = new ConcurService({ accessToken: 'test-token' });
      const types = await service.getExpenseTypes();

      expect(types).toBeInstanceOf(Array);
      expect(types.length).toBeGreaterThan(0);
      expect(types[0]).toHaveProperty('Code');
      expect(types[0]).toHaveProperty('Name');
    });
  });

  describe('getPaymentTypes', () => {
    it('should return hardcoded payment types', async () => {
      const service = new ConcurService({ accessToken: 'test-token' });
      const types = await service.getPaymentTypes();

      expect(types).toBeInstanceOf(Array);
      expect(types.length).toBeGreaterThan(0);
      expect(types.some((t) => t.Code === 'CASH')).toBe(true);
    });
  });
});
